import { BadGatewayException, Inject, Injectable, Logger } from "@nestjs/common";
import { ENV, type Env } from "../env";
import { detectImageType, IMAGE_TYPES, MAX_IMAGE_BYTES } from "../submissions/images";
import type { SubmissionImage } from "../submissions/submissions.service";
import type { InboundMedia } from "./inbound-message";

/** Stay well inside Twilio's 15-second webhook timeout. */
const DOWNLOAD_TIMEOUT_MS = 10_000;

@Injectable()
export class TwilioMediaService {
  private readonly logger = new Logger(TwilioMediaService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Downloads a message's image attachments. Other attachment types (vCards, video, …) and files
   * that aren't really images are skipped; a failed download fails the whole webhook.
   */
  async downloadImages(media: InboundMedia[]): Promise<SubmissionImage[]> {
    const images = await Promise.all(media.map((item) => this.download(item)));
    return images.filter((image) => image !== null);
  }

  private async download({ url, contentType }: InboundMedia): Promise<SubmissionImage | null> {
    if (!IMAGE_TYPES.test(contentType)) {
      this.logger.log(`Skipping ${contentType} attachment ${url}`);
      return null;
    }

    // Twilio media can require HTTP Basic auth (account SID + auth token); sending it always works.
    const credentials = `${this.env.TWILIO_ACCOUNT_SID}:${this.env.TWILIO_AUTH_TOKEN}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { authorization: `Basic ${Buffer.from(credentials).toString("base64")}` },
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      throw new BadGatewayException(`Couldn't download ${url}: ${String(error)}`);
    }
    if (!response.ok) {
      throw new BadGatewayException(`Downloading ${url} returned HTTP ${response.status}`);
    }

    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_IMAGE_BYTES) {
      this.logger.warn(`Skipping ${url}: ${data.length} bytes is over the limit`);
      return null;
    }
    const detected = await detectImageType(data);
    if (!detected) {
      this.logger.warn(`Skipping ${url}: declared ${contentType} but isn't an image`);
      return null;
    }
    const mediaSid = new URL(url).pathname.split("/").at(-1) ?? "media";
    return { filename: `${mediaSid}.${detected.ext}`, contentType: detected.mime, data };
  }
}

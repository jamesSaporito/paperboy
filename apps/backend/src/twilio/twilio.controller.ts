import { Body, Controller, Header, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { SubmissionsService } from "../submissions/submissions.service";
import { inboundMessageSchema, type InboundMessage } from "./inbound-message";
import { TwilioMediaService } from "./twilio-media.service";
import { TwilioSignatureGuard } from "./twilio-signature.guard";

/** TwiML that acknowledges the message without replying to the sender. */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

@Controller("twilio")
@UseGuards(TwilioSignatureGuard)
export class TwilioController {
  constructor(
    private readonly media: TwilioMediaService,
    private readonly submissions: SubmissionsService,
  ) {}

  /** Twilio's incoming-message webhook: configure the phone number's "A message comes in" URL. */
  @Post("messages")
  @HttpCode(HttpStatus.OK)
  @Header("content-type", "text/xml")
  async receiveMessage(
    @Body({ schema: inboundMessageSchema }) message: InboundMessage,
  ): Promise<string> {
    const images = await this.media.downloadImages(message.media);
    await this.submissions.create({ text: message.body }, images);
    return EMPTY_TWIML;
  }
}

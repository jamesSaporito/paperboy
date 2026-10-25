import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { imageExtension } from "./images";

/** An image already in memory, as it arrived in an email. */
export type SubmissionImage = {
  filename: string;
  contentType: string;
  data: Buffer;
};

export type SubmissionInput = {
  /** The sender. */
  contactId: string;
  text: string;
  /** The email's Message-ID, when it has one: a message saved once isn't saved again. */
  emailMessageId?: string;
};

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Saves a submission: its images to S3, then its row (and one row per image) to the database.
   * Throws if any of that fails, so the caller can retry; at worst that leaves unreferenced objects.
   */
  async create(input: SubmissionInput, images: SubmissionImage[]): Promise<void> {
    if (input.emailMessageId) {
      const existing = await this.prisma.client.submission.findUnique({
        where: { emailMessageId: input.emailMessageId },
        select: { id: true },
      });
      if (existing) {
        this.logger.log(`${input.emailMessageId} is already saved as submission ${existing.id}`);
        return;
      }
    }

    // Keys are generated: the sender's filename is untrusted input.
    const stored = await Promise.all(
      images.map(async (image, position) => {
        const s3Key = `submissions/${input.contactId}/${randomUUID()}.${imageExtension(image.contentType)}`;
        await this.storage.putObject(s3Key, image.data, image.contentType);
        return { position, s3Key, contentType: image.contentType, sizeBytes: image.data.length };
      }),
    );

    const submission = await this.prisma.client.submission.create({
      data: {
        contactId: input.contactId,
        text: input.text,
        emailMessageId: input.emailMessageId,
        images: { create: stored },
      },
      select: { id: true },
    });
    this.logger.log(`Saved submission ${submission.id} with ${stored.length} image(s)`);
  }
}

import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { ENV, type Env } from "../env";
import { PrismaService } from "../prisma/prisma.service";
import type { SubmissionImage } from "../submissions/submissions.service";
import { inboundAddress } from "./addresses";

export type OutgoingMail = { subject?: string; text: string; images?: SubmissionImage[] };

/** Sends email from the app's mailbox, only ever to contacts. */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly transport: Transporter;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {
    this.transport = createTransport({
      host: env.MAIL_SMTP_HOST,
      port: env.MAIL_SMTP_PORT,
      secure: env.MAIL_SMTP_SECURE,
      auth: { user: env.MAIL_ADDRESS, pass: env.MAIL_PASSWORD },
    });
  }

  async send(
    contactId: string,
    { subject = "Paperboy", text, images = [] }: OutgoingMail,
  ): Promise<void> {
    const contact = await this.prisma.client.contact.findUniqueOrThrow({
      where: { id: contactId },
    });
    if (!contact.active) throw new Error(`Contact ${contactId} is revoked`);
    await this.transport.sendMail({
      from: this.env.MAIL_ADDRESS,
      to: { name: contact.name, address: contact.email },
      // Replying goes to the contact's private address, so replies are accepted as submissions.
      replyTo: inboundAddress(this.env.MAIL_ADDRESS, contact.inboundToken),
      subject,
      text,
      attachments: images.map((image) => ({
        filename: image.filename,
        contentType: image.contentType,
        content: image.data,
      })),
    });
  }

  onModuleDestroy(): void {
    this.transport.close();
  }
}

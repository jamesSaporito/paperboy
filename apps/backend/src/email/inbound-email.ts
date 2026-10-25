import type { Logger } from "@nestjs/common";
import type { Contact } from "@paperboy/db";
import { parseAddressHeader, type EmailAddress, type ParsedMail } from "mailparser";
import { detectImageType, MAX_IMAGE_BYTES, MAX_IMAGES } from "../submissions/images";
import type { SubmissionImage } from "../submissions/submissions.service";
import { inboundToken } from "./addresses";
import { headerValue, senderIsAuthenticated } from "./sender-auth";

export type InboundEmail = {
  contactId: string;
  text: string;
  images: SubmissionImage[];
  /** The Message-ID header, when present. */
  messageId?: string;
};

export type InboundResult =
  { accepted: true; email: InboundEmail } | { accepted: false; reason: string };

export type ContactLookup = (
  token: string,
) => Promise<Pick<Contact, "id" | "email" | "active"> | null>;

/**
 * Decides whether an email in the app's mailbox is a submission. It must be sent to a contact's
 * private address, from that contact's own address, and pass the receiving server's sender checks.
 */
export async function readInboundEmail(
  mail: ParsedMail,
  mailAddress: string,
  findContact: ContactLookup,
  logger: Logger,
): Promise<InboundResult> {
  const from = mail.from?.value[0]?.address?.toLowerCase();
  if (!from) return { accepted: false, reason: "no sender address" };

  const tokens = new Set(
    recipients(mail).flatMap((address) => inboundToken(mailAddress, address) ?? []),
  );
  if (tokens.size === 0) return { accepted: false, reason: `${from} didn't use a contact address` };

  let contactId: string | undefined;
  for (const token of tokens) {
    const contact = await findContact(token);
    if (contact?.active && contact.email === from) contactId = contact.id;
  }
  if (!contactId) return { accepted: false, reason: `${from} isn't the contact for that address` };

  if (!senderIsAuthenticated(mail.headerLines, from)) {
    return { accepted: false, reason: `${from} failed sender authentication` };
  }

  return {
    accepted: true,
    email: {
      contactId,
      // Some people write only a subject.
      text: stripQuotedReply(mail.text ?? "").trim() || (mail.subject ?? "").trim(),
      images: await readImages(mail, logger),
      messageId: mail.messageId,
    },
  };
}

/** Every address the message was sent to, including Delivered-To (which covers Bcc). */
function recipients(mail: ParsedMail): string[] {
  const deliveredTo = mail.headerLines
    .filter((header) => header.key === "delivered-to")
    .map((header) => headerValue(header.line));
  const addresses: EmailAddress[] = [mail.to, mail.cc, parseAddressHeader(deliveredTo)]
    .flat()
    .flatMap((object) => object?.value ?? []);
  return addresses
    .flatMap((address) => [address, ...(address.group ?? [])])
    .flatMap((address) => address.address ?? []);
}

/** Drops the quoted original that mail apps append to replies ("On …, … wrote:" then "> …"). */
function stripQuotedReply(text: string): string {
  const quote = /^On [^\n]+(?:\r?\n[^\n]*)?wrote:[ \t]*\r?\n(?:[ \t]*\r?\n)*>/m.exec(text);
  return quote ? text.slice(0, quote.index) : text;
}

/** Image attachments, by their contents: some mail apps label photos application/octet-stream. */
async function readImages(mail: ParsedMail, logger: Logger): Promise<SubmissionImage[]> {
  const images: SubmissionImage[] = [];
  for (const attachment of mail.attachments) {
    const name = attachment.filename ?? attachment.contentType;
    if (attachment.size > MAX_IMAGE_BYTES) {
      logger.warn(`Skipping ${name}: ${attachment.size} bytes is over the limit`);
      continue;
    }
    const detected = await detectImageType(attachment.content);
    if (!detected) {
      logger.log(`Skipping ${name}: not an image`);
      continue;
    }
    if (images.length === MAX_IMAGES) {
      logger.warn(`Skipping ${name}: more than ${MAX_IMAGES} images`);
      continue;
    }
    images.push({
      filename: attachment.filename ?? `image-${images.length + 1}.${detected.ext}`,
      contentType: detected.mime,
      data: attachment.content,
    });
  }
  return images;
}

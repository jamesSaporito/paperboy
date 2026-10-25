import { createTransport, type Attachment } from "nodemailer";
import { domainOf } from "../email/addresses";

export type ContactMail = {
  from: string;
  /** The address the sender typed, e.g. a contact's `+token` address. */
  to: string;
  subject?: string;
  text?: string;
  attachments?: Attachment[];
  /** Whether the receiving server's sender checks passed. */
  authenticated?: boolean;
};

/**
 * The headers Gmail's receiving servers add: where the message was delivered, and whether the
 * sender's domain checked out. Local mail servers (GreenMail) and tests have to add them themselves.
 */
function gmailHeaders({ from, to, authenticated = true }: ContactMail): Record<string, string> {
  const domain = domainOf(from);
  const result = authenticated ? "pass" : "fail";
  return {
    "Delivered-To": to,
    "Authentication-Results": [
      "mx.google.com",
      `dkim=${result} header.i=@${domain} header.s=20230601`,
      `spf=${result} (google.com: domain of ${from} designates 192.0.2.1 as permitted sender) smtp.mailfrom=${from}`,
      `dmarc=${result} (p=NONE sp=QUARANTINE dis=NONE) header.from=${domain}`,
    ].join(";\r\n       "),
  };
}

function message(mail: ContactMail) {
  return {
    from: mail.from,
    to: mail.to,
    subject: mail.subject ?? "From my phone",
    text: mail.text ?? "",
    attachments: mail.attachments,
    headers: gmailHeaders(mail),
  };
}

/** The raw message as it would sit in the app's Gmail inbox. */
export async function buildMail(mail: ContactMail): Promise<Buffer> {
  const transport = createTransport({ streamTransport: true, buffer: true });
  const info = await transport.sendMail(message(mail));
  if (!Buffer.isBuffer(info.message)) throw new Error("expected a buffered message");
  return info.message;
}

/**
 * Delivers the message to `mailbox` over SMTP, as Gmail would: `+token` addresses land in the base
 * mailbox, which local mail servers don't do on their own.
 */
export async function deliverMail(
  smtp: { host: string; port: number },
  mailbox: string,
  mail: ContactMail,
): Promise<void> {
  const transport = createTransport({ ...smtp, secure: false });
  try {
    await transport.sendMail({ ...message(mail), envelope: { from: mail.from, to: mailbox } });
  } finally {
    transport.close();
  }
}

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Contact } from "@paperboy/db";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { addContact, revokeContact } from "../contacts/contacts";
import { ENV, type Env } from "../env";
import { PrismaService } from "../prisma/prisma.service";
import { SubmissionsService } from "../submissions/submissions.service";
import { createTestApp, type TestApp } from "../test/support";
import { deliverMail } from "../test/mail";
import { inboundAddress } from "./addresses";
import { PROCESSED_MAILBOX, REJECTED_MAILBOX } from "./inbox.service";
import { StorageService } from "../storage/storage.service";
import { MailService } from "./mail.service";

// These go through the local mail server (GreenMail), which `pnpm test` starts.
const testImage = await readFile(new URL("../test/fixtures/test-image.png", import.meta.url));

let testApp: TestApp;
let env: Env;
let prisma: PrismaService;
let contact: Contact;
let revoked: Contact;

beforeAll(async () => {
  testApp = await createTestApp();
  env = testApp.app.get<Env>(ENV);
  prisma = testApp.app.get(PrismaService);
  const id = randomBytes(4).toString("hex");
  contact = await addContact(prisma.client, "Alice", `alice-${id}@example.com`);
  revoked = await addContact(prisma.client, "Eve", `eve-${id}@example.com`);
  await revokeContact(prisma.client, revoked.email);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  // Submissions block deleting their contact; their image rows go with them.
  await prisma.client.submission.deleteMany({ where: { contactId: contact.id } });
  await prisma.client.contact.deleteMany({ where: { id: { in: [contact.id, revoked.id] } } });
  await testApp.app.close();
});

function uniqueSubject(): string {
  return `test ${randomBytes(4).toString("hex")}`;
}

function sendAsContact(
  mail: { subject: string; text: string; authenticated?: boolean },
  sender: Contact = contact,
) {
  return deliverMail({ host: env.MAIL_SMTP_HOST, port: env.MAIL_SMTP_PORT }, env.MAIL_ADDRESS, {
    from: sender.email,
    to: inboundAddress(env.MAIL_ADDRESS, sender.inboundToken),
    attachments: [{ filename: "photo.png", content: testImage }],
    ...mail,
  });
}

/** Waits for a message with `subject` to show up in `user`'s `mailbox`, and returns it parsed. */
async function waitForMessage(user: string, mailbox: string, subject: string): Promise<ParsedMail> {
  const client = new ImapFlow({
    host: env.MAIL_IMAP_HOST,
    port: env.MAIL_IMAP_PORT,
    secure: env.MAIL_IMAP_SECURE,
    auth: { user, pass: env.MAIL_PASSWORD },
    logger: false,
  });
  await client.connect();
  try {
    return await vi.waitFor(
      async () => {
        await client.mailboxOpen(mailbox).catch(() => undefined);
        const [uid] = (await client.search({ subject }, { uid: true })) || [];
        if (uid === undefined) throw new Error(`no "${subject}" in ${user}'s ${mailbox} yet`);
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) throw new Error("message vanished");
        return simpleParser(message.source);
      },
      { timeout: 10_000, interval: 200 },
    );
  } finally {
    await client.logout();
  }
}

test(
  "an email from a contact is saved, with its photo in S3, and moved to Processed",
  { timeout: 15_000 },
  async () => {
    const subject = uniqueSubject();

    await sendAsContact({ subject, text: `Sent from my phone (${subject})` });

    const submission = await vi.waitFor(
      async () => {
        const saved = await prisma.client.submission.findFirst({
          where: { contactId: contact.id, text: `Sent from my phone (${subject})` },
          include: { images: true },
        });
        if (!saved) throw new Error("not saved yet");
        return saved;
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(submission.emailMessageId).toMatch(/^<.+>$/);
    expect(submission.images).toHaveLength(1);
    const stored = await testApp.app.get(StorageService).getObject(submission.images[0]!.s3Key);
    expect(stored).toEqual({ data: testImage, contentType: "image/png" });
    await waitForMessage(env.MAIL_ADDRESS, PROCESSED_MAILBOX, subject);
  },
);

test(
  "an email that fails sender checks is moved to Rejected without a submission",
  { timeout: 15_000 },
  async () => {
    const create = vi.spyOn(testApp.app.get(SubmissionsService), "create");
    const subject = uniqueSubject();

    await sendAsContact({ subject, text: "Forged", authenticated: false });

    await waitForMessage(env.MAIL_ADDRESS, REJECTED_MAILBOX, subject);
    expect(create).not.toHaveBeenCalled();
  },
);

test(
  "an email from a revoked contact is moved to Rejected without a submission",
  { timeout: 15_000 },
  async () => {
    const create = vi.spyOn(testApp.app.get(SubmissionsService), "create");
    const subject = uniqueSubject();

    await sendAsContact({ subject, text: "Still here?" }, revoked);

    await waitForMessage(env.MAIL_ADDRESS, REJECTED_MAILBOX, subject);
    expect(create).not.toHaveBeenCalled();
  },
);

test(
  "the app can email a contact text and images, with replies going to their address",
  { timeout: 15_000 },
  async () => {
    const subject = uniqueSubject();

    await testApp.app.get(MailService).send(contact.id, {
      subject,
      text: "Here's your result",
      images: [{ filename: "result.png", contentType: "image/png", data: testImage }],
    });

    const received = await waitForMessage(contact.email, "INBOX", subject);
    expect(received.text?.trim()).toBe("Here's your result");
    expect(received.replyTo?.value[0]?.address).toBe(
      inboundAddress(env.MAIL_ADDRESS, contact.inboundToken),
    );
    expect(received.attachments).toHaveLength(1);
    expect(received.attachments[0]!.content.equals(testImage)).toBe(true);
  },
);

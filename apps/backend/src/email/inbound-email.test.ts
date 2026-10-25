import { readFile } from "node:fs/promises";
import { Logger } from "@nestjs/common";
import { simpleParser } from "mailparser";
import { expect, test } from "vitest";
import { buildMail, type ContactMail } from "../test/mail";
import { inboundAddress } from "./addresses";
import { readInboundEmail, type ContactLookup } from "./inbound-email";
import { senderIsAuthenticated } from "./sender-auth";

const testImage = await readFile(new URL("../test/fixtures/test-image.png", import.meta.url));

const MAILBOX = "paperboy.inbox@gmail.com";
const TOKEN = "0123456789abcdef";
const alice = { id: "contact-alice", email: "alice@example.com", active: true };

const findAlice: ContactLookup = async (token) => (token === TOKEN ? alice : null);
const logger = new Logger("test");

async function read(mail: Partial<ContactMail>, findContact = findAlice) {
  const raw = await buildMail({ from: alice.email, to: inboundAddress(MAILBOX, TOKEN), ...mail });
  return readInboundEmail(await simpleParser(raw), MAILBOX, findContact, logger);
}

test("mail from a contact to their address is accepted, with its photo byte for byte", async () => {
  const result = await read({
    text: "Look at this",
    attachments: [{ filename: "photo.png", content: testImage }],
  });

  expect(result.accepted).toBe(true);
  if (!result.accepted) return;
  expect(result.email).toMatchObject({ contactId: alice.id, text: "Look at this" });
  expect(result.email.images).toHaveLength(1);
  expect(result.email.images[0]).toMatchObject({ filename: "photo.png", contentType: "image/png" });
  expect(result.email.images[0]!.data.equals(testImage)).toBe(true);
});

test("photos are recognized by their contents, and other attachments are skipped", async () => {
  const result = await read({
    attachments: [
      // Some mail apps label photos this way.
      { filename: "IMG_0001", content: testImage, contentType: "application/octet-stream" },
      { filename: "card.vcf", content: "BEGIN:VCARD\nEND:VCARD\n", contentType: "text/vcard" },
      { filename: "fake.png", content: "not really a png", contentType: "image/png" },
    ],
  });

  expect(result.accepted && result.email.images.map((image) => image.contentType)).toEqual([
    "image/png",
  ]);
});

test("the quoted original in a reply is dropped, and a subject-only email uses its subject", async () => {
  const reply = await read({
    text: "Sounds good\n\nOn Fri, Oct 23, 2026 at 9:00 AM Paperboy <paperboy.inbox@gmail.com>\nwrote:\n\n> Your earlier message\n",
  });
  const subjectOnly = await read({ subject: "Just the subject", text: "" });

  expect(reply.accepted && reply.email.text).toBe("Sounds good");
  expect(subjectOnly.accepted && subjectOnly.email.text).toBe("Just the subject");
});

test("mail is rejected unless it's from the contact, to their address, and authenticated", async () => {
  const cases = await Promise.all([
    read({ to: MAILBOX }),
    read({ to: inboundAddress(MAILBOX, "ffffffffffffffff") }),
    read({ from: "mallory@example.com" }),
    read({ authenticated: false }),
    read({}, async () => ({ ...alice, active: false })),
  ]);

  expect(cases.map((result) => !result.accepted && result.reason)).toEqual([
    "alice@example.com didn't use a contact address",
    "alice@example.com isn't the contact for that address",
    "mallory@example.com isn't the contact for that address",
    "alice@example.com failed sender authentication",
    "alice@example.com isn't the contact for that address",
  ]);
});

/** Checks headers (topmost first) against a message from a@example.com. */
function verdict(...values: string[]): boolean {
  const lines = values.map((value) => ({
    key: "authentication-results",
    line: `Authentication-Results: ${value}`,
  }));
  return senderIsAuthenticated(lines, "a@example.com");
}

test("only the receiving server's own verdict, for the sender's domain, counts", () => {
  expect(verdict("mx.google.com; dkim=pass header.i=@example.com")).toBe(true);
  expect(verdict("mx.google.com; spf=pass smtp.mailfrom=a@mail.example.com")).toBe(true);
  expect(verdict("mx.google.com; dmarc=pass (p=NONE) header.from=example.com")).toBe(true);
  // Passing for some other domain proves nothing about the From address.
  expect(verdict("mx.google.com; dkim=pass header.i=@attacker.test")).toBe(false);
  // The sender's own header, below the one Gmail added, is ignored.
  expect(
    verdict(
      "mx.google.com; dkim=fail header.i=@example.com",
      "mx.google.com; dkim=pass header.i=@example.com",
    ),
  ).toBe(false);
  // Some other server's verdict.
  expect(verdict("evil.test; dmarc=pass header.from=example.com")).toBe(false);
});

import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@paperboy/db";
import { afterAll, beforeAll, expect, test } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { createTestApp, type TestApp } from "../test/support";
import { addContact, listContacts, revokeContact } from "./contacts";

let testApp: TestApp;
let prisma: PrismaClient;
const emails: string[] = [];

/** A unique address per test, cleaned up afterwards. */
function newEmail(): string {
  const email = `contact-${randomBytes(4).toString("hex")}@example.com`;
  emails.push(email);
  return email;
}

beforeAll(async () => {
  testApp = await createTestApp();
  prisma = testApp.app.get(PrismaService).client;
});

afterAll(async () => {
  await prisma.contact.deleteMany({ where: { email: { in: emails } } });
  await testApp.app.close();
});

test("adding a contact stores a normalized address and a private token", async () => {
  const email = newEmail();

  const contact = await addContact(prisma, "  Alice ", `  ${email.toUpperCase()} `);

  expect(contact).toMatchObject({ name: "Alice", email, active: true });
  expect(contact.inboundToken).toMatch(/^[0-9a-f]{16}$/);
});

test("adding an existing contact again issues a new token and reactivates them", async () => {
  const email = newEmail();
  const first = await addContact(prisma, "Bob", email);
  await revokeContact(prisma, email);

  const second = await addContact(prisma, "Robert", email);

  expect(second).toMatchObject({ id: first.id, name: "Robert", active: true });
  expect(second.inboundToken).not.toBe(first.inboundToken);
  // The old address no longer leads anywhere.
  expect(
    await prisma.contact.findUnique({ where: { inboundToken: first.inboundToken } }),
  ).toBeNull();
});

test("revoking a contact keeps them but marks them inactive", async () => {
  const email = newEmail();
  await addContact(prisma, "Carol", email);

  await revokeContact(prisma, email.toUpperCase());

  const contacts = await listContacts(prisma);
  expect(contacts.find((contact) => contact.email === email)).toMatchObject({ active: false });
});

test("invalid contacts are refused", async () => {
  await expect(addContact(prisma, "Dave", "not-an-email")).rejects.toThrow();
  await expect(addContact(prisma, "  ", newEmail())).rejects.toThrow("A contact needs a name");
  await expect(revokeContact(prisma, "nobody-here@example.com")).rejects.toThrow();
});

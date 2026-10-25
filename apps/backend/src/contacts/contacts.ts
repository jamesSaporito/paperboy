import { randomBytes } from "node:crypto";
import type { Contact, PrismaClient } from "@paperboy/db";
import { z } from "zod";

const emailSchema = z.email({ pattern: z.regexes.html5Email });

/** Lowercase hex, so it survives mail clients that change the case of addresses. */
function newInboundToken(): string {
  return randomBytes(8).toString("hex");
}

/**
 * Allows `email` to send to the app, or reissues their private address if they're already a
 * contact (the old one stops working). Revoked contacts are reactivated.
 */
export async function addContact(
  prisma: PrismaClient,
  name: string,
  email: string,
): Promise<Contact> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("A contact needs a name");
  const address = emailSchema.parse(email.trim().toLowerCase());
  const inboundToken = newInboundToken();
  return prisma.contact.upsert({
    where: { email: address },
    create: { name: trimmedName, email: address, inboundToken },
    update: { name: trimmedName, inboundToken, active: true },
  });
}

/** Stops accepting mail from `email` and sending mail to them. */
export async function revokeContact(prisma: PrismaClient, email: string): Promise<Contact> {
  return prisma.contact.update({
    where: { email: email.trim().toLowerCase() },
    data: { active: false },
  });
}

export function listContacts(prisma: PrismaClient): Promise<Contact[]> {
  return prisma.contact.findMany({ orderBy: { createdAt: "asc" } });
}

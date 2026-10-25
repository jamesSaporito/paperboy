// Manages who may email the app; there's no admin UI. The logic lives in src/contacts (tested).
import { existsSync } from "node:fs";
import { createPrismaClient } from "@paperboy/db";
import { addContact, listContacts, revokeContact } from "../src/contacts/contacts";
import { inboundAddress } from "../src/email/addresses";

const USAGE = `Usage: pnpm --dir apps/backend contact <command>
  add <name> <email>   Allow <email> to send, or give them a new address (the old one stops working)
  revoke <email>       Stop accepting their mail and sending them mail
  list                 Show contacts and their addresses`;

// Like the app, this reads the root .env; existing env vars win.
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const { DATABASE_URL, MAIL_ADDRESS } = process.env;
if (!DATABASE_URL || !MAIL_ADDRESS) throw new Error("DATABASE_URL and MAIL_ADDRESS must be set");

const prisma = createPrismaClient(DATABASE_URL);
const [command, ...args] = process.argv.slice(2);

try {
  if (command === "add" && args.length === 2) {
    const contact = await addContact(prisma, args[0]!, args[1]!);
    console.log(
      `${contact.name} <${contact.email}> sends to: ${inboundAddress(MAIL_ADDRESS, contact.inboundToken)}`,
    );
  } else if (command === "revoke" && args.length === 1) {
    console.log(`Revoked ${(await revokeContact(prisma, args[0]!)).email}`);
  } else if (command === "list" && args.length === 0) {
    for (const contact of await listContacts(prisma)) {
      const address = contact.active
        ? inboundAddress(MAIL_ADDRESS, contact.inboundToken)
        : "revoked";
      console.log(`${contact.name} <${contact.email}>  ${address}`);
    }
  } else {
    console.error(USAGE);
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Contact } from "@paperboy/db";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { addContact } from "../contacts/contacts";
import { ENV, type Env } from "../env";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { createTestApp, type TestApp } from "../test/support";
import { SubmissionsService, type SubmissionImage } from "./submissions.service";

// Against the local database and s3mock (its paperboy-test bucket), which `pnpm test` starts.
const testImage = await readFile(new URL("../test/fixtures/test-image.png", import.meta.url));

let testApp: TestApp;
let prisma: PrismaService;
let storage: StorageService;
let submissions: SubmissionsService;
let contact: Contact;

beforeAll(async () => {
  testApp = await createTestApp();
  prisma = testApp.app.get(PrismaService);
  storage = testApp.app.get(StorageService);
  submissions = testApp.app.get(SubmissionsService);
  contact = await addContact(
    prisma.client,
    "Alice",
    `alice-${randomBytes(4).toString("hex")}@example.com`,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await prisma.client.submission.deleteMany({ where: { contactId: contact.id } });
  await prisma.client.contact.delete({ where: { id: contact.id } });
  await testApp.app.close();
});

function messageId(): string {
  return `<${randomBytes(8).toString("hex")}@mail.example.com>`;
}

function image(filename: string, data = testImage): SubmissionImage {
  return { filename, contentType: "image/png", data };
}

function findSaved(emailMessageId: string) {
  return prisma.client.submission.findMany({
    where: { emailMessageId },
    include: { images: { orderBy: { position: "asc" } } },
  });
}

test("a submission is saved with its sender and text, and its images go to S3", async () => {
  const id = messageId();
  const secondImage = Buffer.concat([testImage, Buffer.from("trailing bytes")]);

  await submissions.create({ contactId: contact.id, text: "Two photos", emailMessageId: id }, [
    image("first.png"),
    image("../../evil name.png", secondImage),
  ]);

  const [saved, ...others] = await findSaved(id);
  expect(others).toHaveLength(0);
  expect(saved).toMatchObject({ contactId: contact.id, text: "Two photos", summary: null });
  expect(saved!.images.map((row) => [row.position, row.contentType, row.sizeBytes])).toEqual([
    [0, "image/png", testImage.length],
    [1, "image/png", secondImage.length],
  ]);
  for (const row of saved!.images) {
    // Generated keys under the sender: never the filename they sent.
    expect(row.s3Key).toMatch(new RegExp(`^submissions/${contact.id}/[0-9a-f-]{36}\\.png$`));
  }
  expect(await storage.getObject(saved!.images[0]!.s3Key)).toEqual({
    data: testImage,
    contentType: "image/png",
  });
  expect(await storage.getObject(saved!.images[1]!.s3Key)).toEqual({
    data: secondImage,
    contentType: "image/png",
  });
});

test("a submission without images is saved too", async () => {
  const id = messageId();

  await submissions.create({ contactId: contact.id, text: "Just words", emailMessageId: id }, []);

  const [saved] = await findSaved(id);
  expect(saved).toMatchObject({ text: "Just words", images: [] });
});

test("a message that's already saved isn't saved or uploaded again", async () => {
  const id = messageId();
  const put = vi.spyOn(storage, "putObject");

  await submissions.create({ contactId: contact.id, text: "Once", emailMessageId: id }, [
    image("a.png"),
  ]);
  await submissions.create({ contactId: contact.id, text: "Once", emailMessageId: id }, [
    image("a.png"),
  ]);

  expect(await findSaved(id)).toHaveLength(1);
  expect(put).toHaveBeenCalledOnce();
});

test("if an image can't be stored, nothing is saved", async () => {
  const id = messageId();
  // A real S3 failure: the same service, pointed at a bucket that doesn't exist.
  const env = testApp.app.get<Env>(ENV);
  const missingBucket = new StorageService({ ...env, S3_BUCKET: "paperboy-missing-bucket" });
  const failing = new SubmissionsService(prisma, missingBucket);

  await expect(
    failing.create({ contactId: contact.id, text: "Lost", emailMessageId: id }, [image("a.png")]),
  ).rejects.toThrow();

  expect(await findSaved(id)).toHaveLength(0);
  missingBucket.onModuleDestroy();
});

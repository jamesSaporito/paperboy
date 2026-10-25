import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Contact, Submission } from "@paperboy/db";
import { afterAll, beforeAll, expect, test } from "vitest";
import { addContact } from "../contacts/contacts";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { createTestApp, type TestApp } from "../test/support";
import { GenerationsService, type GenerationInput } from "./generations.service";

// Against the local database and s3mock (its paperboy-test bucket). Nothing here calls OpenAI:
// the "generated" content is made up.
const testImage = await readFile(new URL("../test/fixtures/test-image.png", import.meta.url));

let testApp: TestApp;
let prisma: PrismaService;
let generations: GenerationsService;
let contact: Contact;
let first: Submission;
let second: Submission;

beforeAll(async () => {
  testApp = await createTestApp();
  prisma = testApp.app.get(PrismaService);
  generations = testApp.app.get(GenerationsService);
  contact = await addContact(
    prisma.client,
    "Alice",
    `alice-${randomBytes(4).toString("hex")}@example.com`,
  );
  first = await prisma.client.submission.create({ data: { contactId: contact.id, text: "First" } });
  second = await prisma.client.submission.create({
    data: { contactId: contact.id, text: "Second" },
  });
});

afterAll(async () => {
  const ours = { submissions: { some: { submission: { contactId: contact.id } } } };
  await prisma.client.generation.deleteMany({ where: ours });
  await prisma.client.submission.deleteMany({ where: { contactId: contact.id } });
  await prisma.client.contact.delete({ where: { id: contact.id } });
  await testApp.app.close();
});

/** Generated text the way @paperboy/ai returns it, plus what was asked. */
function textResult(text: string): GenerationInput["text"] {
  return {
    text,
    model: "text-model",
    usage: { inputTokens: 120, outputTokens: 40, totalTokens: 160 },
    prompt: "First\n\nSecond",
    instructions: "Write a short story from these messages.",
  };
}

function findGeneration(id: string) {
  return prisma.client.generation.findUniqueOrThrow({
    where: { id },
    include: { submissions: { orderBy: { submissionId: "asc" } } },
  });
}

test("a generation is saved with its text, its image in S3, and the submissions it came from", async () => {
  const { id } = await generations.save({
    submissionIds: [first.id, second.id, first.id],
    text: textResult("Once upon a time"),
    image: {
      data: testImage,
      contentType: "image/png",
      model: "image-model",
      prompt: "An illustration of the story",
      usage: { inputTokens: 30, outputTokens: 1000, totalTokens: 1030 },
    },
  });

  const saved = await findGeneration(id);
  expect(saved).toMatchObject({
    text: "Once upon a time",
    textModel: "text-model",
    textInstructions: "Write a short story from these messages.",
    textPrompt: "First\n\nSecond",
    textInputTokens: 120,
    textOutputTokens: 40,
    imageContentType: "image/png",
    imageSizeBytes: testImage.length,
    imageModel: "image-model",
    imagePrompt: "An illustration of the story",
    imageInputTokens: 30,
    imageOutputTokens: 1000,
  });
  // Duplicates are linked once.
  expect(saved.submissions.map((link) => link.submissionId).toSorted()).toEqual(
    [first.id, second.id].toSorted(),
  );
  expect(saved.imageS3Key).toMatch(/^generations\/[0-9a-f-]{36}\.png$/);
  expect(await testApp.app.get(StorageService).getObject(saved.imageS3Key!)).toEqual({
    data: testImage,
    contentType: "image/png",
  });
});

test("a text-only generation has no image columns, and a submission can feed several generations", async () => {
  const { id } = await generations.save({
    submissionIds: [first.id],
    text: textResult("Just text"),
  });

  expect(await findGeneration(id)).toMatchObject({
    text: "Just text",
    imageS3Key: null,
    imageContentType: null,
    imageSizeBytes: null,
    imageModel: null,
    imagePrompt: null,
    imageInputTokens: null,
    imageOutputTokens: null,
  });
  expect(
    await prisma.client.generationSubmission.count({ where: { submissionId: first.id } }),
  ).toBeGreaterThanOrEqual(2);
});

test("a generation needs real submissions, and nothing is saved otherwise", async () => {
  const marker = `Orphan ${randomBytes(4).toString("hex")}`;

  await expect(generations.save({ submissionIds: [], text: textResult(marker) })).rejects.toThrow(
    "A generation needs at least one submission",
  );
  await expect(
    generations.save({
      submissionIds: ["00000000-0000-7000-8000-000000000000"],
      text: textResult(marker),
    }),
  ).rejects.toThrow();

  expect(await prisma.client.generation.count({ where: { text: marker } })).toBe(0);
});

test("the database keeps image columns all set or all empty", async () => {
  await expect(
    prisma.client.generation.create({
      data: {
        text: "Half an image",
        textModel: "text-model",
        textPrompt: "p",
        imageS3Key: `generations/${randomBytes(8).toString("hex")}.png`,
      },
    }),
  ).rejects.toThrow(/generations_image_complete_check/);
});

test("a submission used by a generation can't be deleted", async () => {
  await expect(prisma.client.submission.delete({ where: { id: first.id } })).rejects.toThrow();
});

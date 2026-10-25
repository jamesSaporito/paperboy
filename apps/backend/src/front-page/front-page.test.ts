import { randomBytes } from "node:crypto";
import { SchedulerRegistry } from "@nestjs/schedule";
import type { GeneratedText } from "@paperboy/ai";
import type { Contact } from "@paperboy/db";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { AI, type Ai } from "../ai/ai.token";
import { addContact } from "../contacts/contacts";
import { PrismaService } from "../prisma/prisma.service";
import { createTestApp, type TestApp } from "../test/support";
import { FRONT_PAGE_JOB, FRONT_PAGE_TIME_ZONE } from "./front-page.schedule";
import {
  buildPrompt,
  FRONT_PAGE_INSTRUCTIONS,
  MAX_MESSAGE_CHARS,
  MAX_OUTPUT_TOKENS,
  MAX_PROMPT_CHARS,
} from "./front-page.service";

// Never a real model: the AI provider is a fake. Runs in the test database, which each test empties.
const TOKEN = "test-jobs-token-that-is-at-least-32-characters";
const fakeAi = {
  generateText: vi.fn<Ai["generateText"]>(),
  generateImages: vi.fn<Ai["generateImages"]>(),
};
const PAPER: GeneratedText = {
  text: "THE PAPERBOY\nLOCAL MAN SAYS HI, TOWN STUNNED",
  model: "llama",
  responseId: "resp_1",
  usage: { inputTokens: 300, outputTokens: 400, totalTokens: 700 },
};

let testApp: TestApp;
let prisma: PrismaService;
let alice: Contact;
let bob: Contact;

beforeAll(async () => {
  testApp = await createTestApp((builder) => builder.overrideProvider(AI).useValue(fakeAi));
  prisma = testApp.app.get(PrismaService);
  const id = randomBytes(4).toString("hex");
  alice = await addContact(prisma.client, "Alice", `alice-${id}@example.com`);
  bob = await addContact(prisma.client, "Bob", `bob-${id}@example.com`);
});

beforeEach(async () => {
  vi.resetAllMocks();
  await prisma.client.generation.deleteMany({});
  await prisma.client.submission.deleteMany({});
});

afterAll(async () => {
  await prisma.client.generation.deleteMany({});
  await prisma.client.submission.deleteMany({});
  await prisma.client.contact.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  await testApp.app.close();
});

function submit(contact: Contact, text: string, createdAt: Date) {
  return prisma.client.submission.create({ data: { contactId: contact.id, text, createdAt } });
}

/** A promise the test resolves when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => (resolve = settle));
  return { promise, resolve };
}

/** `null` sends no Authorization header. */
function trigger(token: string | null = TOKEN) {
  return fetch(`${testApp.baseUrl}/jobs/front-page`, {
    method: "POST",
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
}

test("the endpoint needs the jobs token, and nothing runs without it", async () => {
  await submit(alice, "Hello", new Date());

  expect((await trigger(null)).status).toBe(401);
  expect((await trigger("wrong-token")).status).toBe(401);
  expect(fakeAi.generateText).not.toHaveBeenCalled();
});

test("new submissions become one front page, saved as a generation linked to all of them", async () => {
  const first = await submit(
    alice,
    "My cat knocked over a plant",
    new Date("2026-10-19T14:00:00Z"),
  );
  const second = await submit(bob, "I made soup", new Date("2026-10-21T23:00:00Z"));
  fakeAi.generateText.mockResolvedValueOnce(PAPER);

  const response = await trigger();

  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(body).toMatchObject({ status: "created", submissionCount: 2, remainingCount: 0 });

  const [request] = fakeAi.generateText.mock.calls[0]!;
  expect(request.instructions).toBe(FRONT_PAGE_INSTRUCTIONS);
  expect(request.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  // Oldest first, each with its sender's name.
  expect(request.prompt).toMatch(
    /From Alice, Oct 19:\nMy cat knocked over a plant[\s\S]*From Bob, Oct 21:\nI made soup/,
  );

  const generation = await prisma.client.generation.findFirstOrThrow({
    include: { submissions: true },
  });
  expect(body).toMatchObject({ generationId: generation.id });
  expect(generation).toMatchObject({
    text: PAPER.text,
    textModel: "llama",
    textInstructions: FRONT_PAGE_INSTRUCTIONS,
    textPrompt: request.prompt,
    textInputTokens: 300,
    textOutputTokens: 400,
    imageS3Key: null,
  });
  expect(generation.submissions.map((link) => link.submissionId).toSorted()).toEqual(
    [first.id, second.id].toSorted(),
  );
});

test("submissions are used once: the next run skips without calling the model", async () => {
  await submit(alice, "Once", new Date());
  fakeAi.generateText.mockResolvedValueOnce(PAPER);
  await trigger();

  const response = await trigger();

  expect(await response.json()).toEqual({ status: "skipped", reason: "no new submissions" });
  expect(fakeAi.generateText).toHaveBeenCalledOnce();
});

test("only submissions not already in a generation are used", async () => {
  await submit(alice, "Old news", new Date("2026-10-01T12:00:00Z"));
  fakeAi.generateText.mockResolvedValueOnce(PAPER);
  await trigger();
  const fresh = await submit(bob, "Fresh news", new Date());
  fakeAi.generateText.mockResolvedValueOnce(PAPER);

  const body: unknown = await (await trigger()).json();

  expect(body).toMatchObject({ status: "created", submissionCount: 1 });
  const [request] = fakeAi.generateText.mock.calls[1]!;
  expect(request.prompt).toContain("Fresh news");
  expect(request.prompt).not.toContain("Old news");
  const links = await prisma.client.generationSubmission.findMany({
    where: { submissionId: fresh.id },
  });
  expect(links).toHaveLength(1);
});

test("if the model fails, nothing is saved and the submissions wait for the next run", async () => {
  await submit(alice, "Hello", new Date());
  fakeAi.generateText.mockRejectedValueOnce(new Error("model unavailable"));

  const response = await trigger();

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "failed" });
  expect(await prisma.client.generation.count()).toBe(0);
  expect(await prisma.client.submission.count({ where: { generations: { none: {} } } })).toBe(1);
});

test("a run that's already going isn't started twice", async () => {
  await submit(alice, "Hello", new Date());
  const { promise, resolve: finish } = deferred<GeneratedText>();
  fakeAi.generateText.mockReturnValueOnce(promise);

  const firstRun = trigger();
  await vi.waitFor(() => expect(fakeAi.generateText).toHaveBeenCalledOnce());
  const second: unknown = await (await trigger()).json();
  finish(PAPER);

  expect(second).toEqual({ status: "skipped", reason: "already running" });
  expect(await (await firstRun).json()).toMatchObject({ status: "created" });
});

test("the prompt stays within the size limit, cutting long messages and leaving the rest for later", () => {
  const messages = Array.from({ length: 10 }, (_, index) => ({
    id: `s${index}`,
    name: `Person ${index}`,
    text: "x".repeat(MAX_MESSAGE_CHARS + 500),
    createdAt: new Date("2026-10-20T12:00:00Z"),
  }));

  const { prompt, used } = buildPrompt(messages, new Date("2026-10-25T13:00:00Z"));

  expect(prompt.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS);
  expect(prompt).toContain("Edition date: Sunday, October 25, 2026");
  expect(used.length).toBeGreaterThan(0);
  expect(used.length).toBeLessThan(messages.length);
  expect(prompt).not.toContain("x".repeat(MAX_MESSAGE_CHARS + 1));
});

test("the job is scheduled for Sundays at 9:00 New York time", () => {
  const job = testApp.app.get(SchedulerRegistry).getCronJob(FRONT_PAGE_JOB);
  const next = job.nextDate().setZone(FRONT_PAGE_TIME_ZONE);

  expect(next.weekday).toBe(7);
  expect([next.hour, next.minute]).toEqual([9, 0]);
});

import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { createTestApp, type TestApp } from "../test/support";
import { AI_HEALTH_REQUEST } from "./ai-health.controller";
import { AI, type Ai } from "./ai.token";

// Never a real model: one app gets a fake AI, the other the test config's dead address.
const fakeAi = {
  generateText: vi.fn<Ai["generateText"]>(),
  generateImages: vi.fn<Ai["generateImages"]>(),
};

let withFake: TestApp;
let unreachable: TestApp;

beforeAll(async () => {
  withFake = await createTestApp((builder) => builder.overrideProvider(AI).useValue(fakeAi));
  unreachable = await createTestApp();
});

afterAll(async () => {
  await withFake.app.close();
  await unreachable.app.close();
});

test("GET /ai-health asks the model for a haiku with a tiny prompt and returns it", async () => {
  fakeAi.generateText.mockResolvedValueOnce({
    text: "  Moonlight on the sea\nRipples dance with gentle song\nPeaceful evening sky\n",
    model: "llama",
    responseId: "resp_1",
    usage: { inputTokens: 43, outputTokens: 18, totalTokens: 61 },
  });

  const response = await fetch(`${withFake.baseUrl}/ai-health`);

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    status: "ok",
    model: "llama",
    haiku: "Moonlight on the sea\nRipples dance with gentle song\nPeaceful evening sky",
  });
  expect(fakeAi.generateText).toHaveBeenCalledExactlyOnceWith({
    instructions: "Write a haiku.",
    prompt: "Any topic.",
    maxOutputTokens: 200,
  });
  expect(AI_HEALTH_REQUEST.instructions.split(" ").length).toBeLessThanOrEqual(3);
});

test("GET /ai-health is 503 when the model fails", async () => {
  fakeAi.generateText.mockRejectedValueOnce(new Error("model crashed"));

  const response = await fetch(`${withFake.baseUrl}/ai-health`);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "down" });
});

test("without a fake, tests can't reach any model: the call fails and nothing is spent", async () => {
  const response = await fetch(`${unreachable.baseUrl}/ai-health`);

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ status: "down" });
});

import { RateLimitError } from "openai";
import { expect, test } from "vitest";
import { textUseCase } from "./ai";
import { AiError } from "./errors";
import { fakeOpenAI, responseBody } from "./test/fake-openai";

test("text is generated with the Responses API from the prompt and instructions", async () => {
  const { ai, requests } = fakeOpenAI(() => ({ body: responseBody({ text: "A short summary." }) }));

  const result = await ai.generateText({
    prompt: "Summarize this: a long story",
    instructions: "Summarize in one sentence.",
    maxOutputTokens: 200,
    reasoningEffort: "low",
  });

  expect(result).toEqual({
    text: "A short summary.",
    model: "default-text-model",
    responseId: "resp_123",
    usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
  });
  expect(requests).toHaveLength(1);
  expect(requests[0]!.method).toBe("POST");
  expect(requests[0]!.url.href).toBe("https://api.openai.com/v1/responses");
  expect(requests[0]!.body).toEqual({
    model: "default-text-model",
    input: "Summarize this: a long story",
    instructions: "Summarize in one sentence.",
    max_output_tokens: 200,
    reasoning: { effort: "low" },
    store: false,
  });
});

test("a request can pick its own model", async () => {
  const { ai, requests } = fakeOpenAI(() => ({ body: responseBody({ model: "small-model" }) }));

  const result = await ai.generateText({ prompt: "Hi", model: "small-model" });

  expect(requests[0]!.body.model).toBe("small-model");
  expect(result.model).toBe("small-model");
});

test("refusals, cut-off and failed responses are errors, not text", async () => {
  const replies = [
    responseBody({ refusal: "I can't help with that." }),
    responseBody({ status: "incomplete", incompleteReason: "max_output_tokens" }),
    responseBody({ status: "failed" }),
  ];
  const { ai } = fakeOpenAI(() => ({ body: replies.shift() }));

  await expect(ai.generateText({ prompt: "1" })).rejects.toThrow(
    new AiError("refused", "I can't help with that."),
  );
  await expect(ai.generateText({ prompt: "2" })).rejects.toMatchObject({
    reason: "incomplete",
    message: "Response resp_123 is incomplete (max_output_tokens)",
  });
  await expect(ai.generateText({ prompt: "3" })).rejects.toMatchObject({
    reason: "failed",
    message: "Response resp_123 failed: Something broke",
  });
});

test("API errors surface as the SDK's errors", async () => {
  const { ai } = fakeOpenAI(() => ({
    status: 429,
    body: {
      error: { message: "Rate limit reached", type: "requests", code: "rate_limit_exceeded" },
    },
  }));

  const error: unknown = await ai.generateText({ prompt: "Hi" }).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(RateLimitError);
  expect(error).toMatchObject({ status: 429 });
});

test("a text use case fixes its instructions and options, and calls can override them", async () => {
  const { ai, requests } = fakeOpenAI(() => ({ body: responseBody() }));
  const caption = textUseCase(ai, { instructions: "Write a caption.", maxOutputTokens: 50 });

  await caption("A photo of a dog");
  await caption("A photo of a cat", { maxOutputTokens: 10 });

  expect(requests.map((request) => request.body)).toMatchObject([
    { input: "A photo of a dog", instructions: "Write a caption.", max_output_tokens: 50 },
    { input: "A photo of a cat", instructions: "Write a caption.", max_output_tokens: 10 },
  ]);
});

import { z } from "zod";
import { createAi, type Ai } from "../ai";

export type RecordedRequest = { method: string; url: URL; body: Record<string, unknown> };

export type FakeReply = { status?: number; body: unknown };

/**
 * An `Ai` whose HTTP calls are answered by `reply` instead of OpenAI. Requests are recorded so
 * tests can check exactly what would have been sent.
 */
export function fakeOpenAI(reply: (request: RecordedRequest) => FakeReply) {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input);
    const body = z
      .record(z.string(), z.unknown())
      .parse(typeof init?.body === "string" ? JSON.parse(init.body) : {});
    const request = { method: init?.method ?? "GET", url, body };
    requests.push(request);
    const { status = 200, body: replyBody } = reply(request);
    return Response.json(replyBody, { status });
  };
  const ai: Ai = createAi({
    apiKey: "sk-test",
    textModel: "default-text-model",
    imageModel: "default-image-model",
    maxRetries: 0,
    fetch,
  });
  return { ai, requests };
}

/** A Responses API reply, shaped like OpenAI's. */
export function responseBody(
  options: {
    text?: string;
    refusal?: string;
    status?: "completed" | "incomplete" | "failed";
    model?: string;
    incompleteReason?: string;
  } = {},
) {
  const content = options.refusal
    ? [{ type: "refusal", refusal: options.refusal }]
    : [{ type: "output_text", text: options.text ?? "Hello there", annotations: [] }];
  return {
    id: "resp_123",
    object: "response",
    created_at: 1_790_000_000,
    status: options.status ?? "completed",
    model: options.model ?? "default-text-model",
    error:
      options.status === "failed" ? { code: "server_error", message: "Something broke" } : null,
    incomplete_details: options.incompleteReason ? { reason: options.incompleteReason } : null,
    output: [{ type: "message", id: "msg_123", role: "assistant", status: "completed", content }],
    usage: {
      input_tokens: 12,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 17,
    },
  };
}

/** An Images API reply carrying `images` as base64, shaped like OpenAI's. */
export function imagesBody(
  images: Buffer[],
  options: { format?: string; revisedPrompt?: string } = {},
) {
  return {
    created: 1_790_000_000,
    output_format: options.format ?? "png",
    data: images.map((image) => ({
      b64_json: image.toString("base64"),
      revised_prompt: options.revisedPrompt,
    })),
    usage: {
      input_tokens: 20,
      input_tokens_details: { image_tokens: 0, text_tokens: 20 },
      output_tokens: 1000,
      total_tokens: 1020,
    },
  };
}

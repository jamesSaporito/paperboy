import type OpenAI from "openai";
import { AiError } from "./errors";
import type { GeneratedText, TextRequest } from "./types";

/** Generates text with the Responses API. */
export async function generateText(
  client: OpenAI,
  defaultModel: string,
  request: TextRequest,
): Promise<GeneratedText> {
  const response = await client.responses.create({
    model: request.model ?? defaultModel,
    input: request.prompt,
    instructions: request.instructions,
    max_output_tokens: request.maxOutputTokens,
    reasoning: request.reasoningEffort ? { effort: request.reasoningEffort } : undefined,
    // Responses are used once; don't keep them on OpenAI's side.
    store: false,
  });

  if (response.status === "failed") {
    throw new AiError(
      "failed",
      `Response ${response.id} failed: ${response.error?.message ?? "no reason given"}`,
    );
  }
  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason ?? "unknown";
    throw new AiError("incomplete", `Response ${response.id} is incomplete (${reason})`);
  }
  const refusal = response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .find((content) => content.type === "refusal");
  if (refusal) throw new AiError("refused", refusal.refusal);
  if (!response.output_text) throw new AiError("empty", `Response ${response.id} has no text`);

  return {
    text: response.output_text,
    model: response.model,
    responseId: response.id,
    usage: response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : null,
  };
}

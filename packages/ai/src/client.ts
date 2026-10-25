import OpenAI from "openai";
import type { AiConfig } from "./types";

export function createOpenAIClient(config: AiConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    fetch: config.fetch,
  });
}

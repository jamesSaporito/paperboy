import { createOpenAIClient } from "./client";
import { generateImages } from "./images";
import { generateText } from "./text";
import type { AiConfig, GeneratedImages, GeneratedText, ImageRequest, TextRequest } from "./types";

export type Ai = {
  generateText(request: TextRequest): Promise<GeneratedText>;
  generateImages(request: ImageRequest): Promise<GeneratedImages>;
};

export function createAi(config: AiConfig): Ai {
  const client = createOpenAIClient(config);
  return {
    generateText: (request) => generateText(client, config.textModel, request),
    generateImages: (request) => generateImages(client, config.imageModel, request),
  };
}

/**
 * A reusable text use case: its instructions, model and limits are fixed, so callers pass only
 * the prompt. E.g. `const summarize = textUseCase(ai, { instructions: "Summarize in one line." })`.
 */
export function textUseCase(ai: Ai, preset: Omit<TextRequest, "prompt">) {
  return (prompt: string, overrides: Partial<TextRequest> = {}): Promise<GeneratedText> =>
    ai.generateText({ ...preset, ...overrides, prompt });
}

/** A reusable image use case, e.g. a fixed style, size and quality; callers pass only the prompt. */
export function imageUseCase(ai: Ai, preset: Omit<ImageRequest, "prompt">) {
  return (prompt: string, overrides: Partial<ImageRequest> = {}): Promise<GeneratedImages> =>
    ai.generateImages({ ...preset, ...overrides, prompt });
}

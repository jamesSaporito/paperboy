import type OpenAI from "openai";
import { AiError } from "./errors";
import type { GeneratedImages, ImageRequest } from "./types";

/** Generates images with the Images API. Images come back as bytes, not URLs. */
export async function generateImages(
  client: OpenAI,
  defaultModel: string | undefined,
  request: ImageRequest,
): Promise<GeneratedImages> {
  const model = request.model ?? defaultModel;
  // Checked here, before any request is sent.
  if (!model) throw new Error("No image model configured: set one in the AI config or the request");
  const response = await client.images.generate({
    model,
    prompt: request.prompt,
    n: request.count ?? 1,
    size: request.size,
    quality: request.quality,
    output_format: request.format,
    background: request.background,
  });

  const format = response.output_format ?? request.format ?? "png";
  const images = (response.data ?? []).map((image) => {
    if (!image.b64_json) throw new AiError("empty", `${model} returned an image without data`);
    return {
      data: Buffer.from(image.b64_json, "base64"),
      contentType: `image/${format}` as const,
      revisedPrompt: image.revised_prompt ?? null,
    };
  });
  if (images.length === 0) throw new AiError("empty", `${model} returned no images`);

  return {
    images,
    model,
    usage: response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : null,
  };
}

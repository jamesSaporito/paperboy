import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import { imageUseCase } from "./ai";
import { fakeOpenAI, imagesBody } from "./test/fake-openai";

const testImage = await readFile(new URL("./test/fixtures/test-image.png", import.meta.url));

test("images are generated from the prompt and returned as bytes", async () => {
  const { ai, requests } = fakeOpenAI(() => ({
    body: imagesBody([testImage], { revisedPrompt: "A red bicycle, studio lighting" }),
  }));

  const result = await ai.generateImages({
    prompt: "A red bicycle",
    size: "1024x1024",
    quality: "low",
    format: "png",
  });

  expect(requests).toHaveLength(1);
  expect(requests[0]!.url.href).toBe("https://api.openai.com/v1/images/generations");
  expect(requests[0]!.body).toEqual({
    model: "default-image-model",
    prompt: "A red bicycle",
    n: 1,
    size: "1024x1024",
    quality: "low",
    output_format: "png",
  });
  expect(result.model).toBe("default-image-model");
  expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 1000, totalTokens: 1020 });
  expect(result.images).toHaveLength(1);
  expect(result.images[0]).toMatchObject({
    contentType: "image/png",
    revisedPrompt: "A red bicycle, studio lighting",
  });
  expect(result.images[0]!.data.equals(testImage)).toBe(true);
});

test("several images can be requested at once, in the format OpenAI reports", async () => {
  const { ai, requests } = fakeOpenAI(() => ({
    body: imagesBody([testImage, testImage], { format: "webp" }),
  }));

  const result = await ai.generateImages({
    prompt: "Two cats",
    count: 2,
    model: "other-image-model",
  });

  expect(requests[0]!.body).toMatchObject({ n: 2, model: "other-image-model" });
  expect(result.images.map((image) => image.contentType)).toEqual(["image/webp", "image/webp"]);
  expect(result.images[0]!.revisedPrompt).toBeNull();
});

test("a reply without image data is an error", async () => {
  const { ai } = fakeOpenAI(() => ({
    body: { created: 1, data: [{ url: "https://example.com/x.png" }] },
  }));
  const empty = fakeOpenAI(() => ({ body: { created: 1, data: [] } }));

  await expect(ai.generateImages({ prompt: "A tree" })).rejects.toMatchObject({ reason: "empty" });
  await expect(empty.ai.generateImages({ prompt: "A tree" })).rejects.toMatchObject({
    reason: "empty",
    message: "default-image-model returned no images",
  });
});

test("an image use case fixes its options, and calls can override them", async () => {
  const { ai, requests } = fakeOpenAI(() => ({ body: imagesBody([testImage]) }));
  const thumbnail = imageUseCase(ai, { size: "1024x1024", quality: "low", format: "jpeg" });

  await thumbnail("A lighthouse");
  await thumbnail("A harbor", { quality: "high" });

  expect(requests.map((request) => request.body)).toMatchObject([
    { prompt: "A lighthouse", size: "1024x1024", quality: "low", output_format: "jpeg" },
    { prompt: "A harbor", size: "1024x1024", quality: "high", output_format: "jpeg" },
  ]);
});

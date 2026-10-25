import type { ClientOptions } from "openai";
import type { ImageGenerateParams } from "openai/resources/images";
import type { Reasoning } from "openai/resources/shared";

export type AiConfig = {
  apiKey: string;
  /** Default models. Each request can override them, e.g. a cheaper model for a simple use case. */
  textModel: string;
  imageModel: string;
  /** Passed through to the OpenAI client. `fetch` is how tests replace the network. */
  baseURL?: string;
  timeout?: number;
  maxRetries?: number;
  fetch?: ClientOptions["fetch"];
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TextRequest = {
  /** The text to respond to. */
  prompt: string;
  /** How to respond: the use case's role, rules and output format. */
  instructions?: string;
  model?: string;
  /** Caps the response length, and so its cost. */
  maxOutputTokens?: number;
  /** For reasoning models: how much thinking to spend on the answer. */
  reasoningEffort?: NonNullable<Reasoning["effort"]>;
};

export type GeneratedText = {
  text: string;
  model: string;
  /** OpenAI's id for the response, for logs and support requests. */
  responseId: string;
  usage: TokenUsage | null;
};

export type ImageFormat = "png" | "jpeg" | "webp";

export type ImageRequest = {
  /** A description of the image to create. */
  prompt: string;
  model?: string;
  /** How many images to create. Defaults to 1. */
  count?: number;
  size?: NonNullable<ImageGenerateParams["size"]>;
  quality?: NonNullable<ImageGenerateParams["quality"]>;
  format?: ImageFormat;
  background?: NonNullable<ImageGenerateParams["background"]>;
};

export type GeneratedImage = {
  data: Buffer;
  contentType: `image/${ImageFormat}`;
  /** The prompt the model actually used, when it rewrote the one it was given. */
  revisedPrompt: string | null;
};

export type GeneratedImages = {
  images: GeneratedImage[];
  model: string;
  usage: TokenUsage | null;
};

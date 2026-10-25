import { Controller, Get, Inject, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { AiHealthResponse } from "@paperboy/contracts";
import { AI, type Ai } from "./ai.token";

/**
 * Kept tiny because every call is a real model call (and costs money on OpenAI): a few words of
 * instructions, and a hard cap on output that still leaves room for a reasoning model's thinking.
 */
export const AI_HEALTH_REQUEST = {
  instructions: "Write a haiku.",
  prompt: "Any topic.",
  maxOutputTokens: 200,
};

@Controller("ai-health")
export class AiHealthController {
  private readonly logger = new Logger(AiHealthController.name);

  constructor(@Inject(AI) private readonly ai: Ai) {}

  /** Checks the configured model end to end by asking it for a haiku. */
  @Get()
  async check(): Promise<AiHealthResponse> {
    try {
      const result = await this.ai.generateText(AI_HEALTH_REQUEST);
      return { status: "ok", model: result.model, haiku: result.text.trim() };
    } catch (error) {
      this.logger.warn(`AI check failed: ${String(error)}`);
      const body: AiHealthResponse = { status: "down" };
      throw new ServiceUnavailableException(body);
    }
  }
}

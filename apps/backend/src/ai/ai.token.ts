import type { Ai } from "@paperboy/ai";

/** Injection token for the `Ai` client. Tests replace it with a fake: they never call a model. */
export const AI = Symbol("AI");

export type { Ai };

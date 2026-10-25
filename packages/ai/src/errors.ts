/** OpenAI answered, but not with a usable result. API and network failures are the SDK's own errors. */
export class AiError extends Error {
  constructor(
    readonly reason: "refused" | "incomplete" | "failed" | "empty",
    message: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

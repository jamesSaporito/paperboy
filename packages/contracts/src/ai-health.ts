import { z } from "zod";

export const aiHealthResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), model: z.string(), haiku: z.string() }),
  z.object({ status: z.literal("down") }),
]);

export type AiHealthResponse = z.infer<typeof aiHealthResponseSchema>;

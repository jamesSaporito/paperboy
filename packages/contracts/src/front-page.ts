import { z } from "zod";

/** The result of a front page run (POST /jobs/front-page, or the Sunday schedule). */
export const frontPageRunSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    generationId: z.string(),
    /** Submissions used. Any that didn't fit wait for the next run. */
    submissionCount: z.number().int(),
    remainingCount: z.number().int(),
  }),
  z.object({
    status: z.literal("skipped"),
    reason: z.enum(["no new submissions", "already running"]),
  }),
  z.object({ status: z.literal("failed") }),
]);

export type FrontPageRun = z.infer<typeof frontPageRunSchema>;

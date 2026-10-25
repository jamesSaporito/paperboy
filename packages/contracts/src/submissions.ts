import { z } from "zod";

/** Text fields of a submission. Images arrive as multipart files under `images`, not here. */
export const createSubmissionSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

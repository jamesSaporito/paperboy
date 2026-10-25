import { Injectable } from "@nestjs/common";
import type { CreateSubmissionInput } from "@paperboy/contracts";

/** An image already in memory, whether uploaded directly, downloaded from a Twilio MMS, or emailed. */
export type SubmissionImage = {
  filename: string;
  contentType: string;
  data: Buffer;
};

export type SubmissionInput = CreateSubmissionInput & {
  /** The sender, when the submission came from a known contact (email). */
  contactId?: string;
};

@Injectable()
export class SubmissionsService {
  /** Placeholder for the submission business logic. */
  async create(_input: SubmissionInput, _images: SubmissionImage[]): Promise<void> {}
}

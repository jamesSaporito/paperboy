import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type { GeneratedImage, GeneratedText, TokenUsage } from "@paperboy/ai";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { imageExtension } from "../submissions/images";

/** What was asked for, alongside what came back, so a generation can be reproduced. */
export type GenerationInput = {
  /** The submissions the content was made from: at least one. */
  submissionIds: string[];
  text: Pick<GeneratedText, "text" | "model" | "usage"> & { prompt: string; instructions?: string };
  image?: Pick<GeneratedImage, "data" | "contentType"> & {
    model: string;
    prompt: string;
    usage: TokenUsage | null;
  };
};

@Injectable()
export class GenerationsService {
  private readonly logger = new Logger(GenerationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Saves generated content: the image (if any) to S3 first, then the generation and its links to
   * submissions in one insert. Throws if any of that fails; at worst that leaves an unreferenced
   * object in S3, never a half-saved generation.
   */
  async save({ submissionIds, text, image }: GenerationInput): Promise<{ id: string }> {
    const uniqueIds = [...new Set(submissionIds)];
    if (uniqueIds.length === 0) throw new Error("A generation needs at least one submission");

    let imageColumns = {};
    if (image) {
      const imageS3Key = `generations/${randomUUID()}.${imageExtension(image.contentType)}`;
      await this.storage.putObject(imageS3Key, image.data, image.contentType);
      imageColumns = {
        imageS3Key,
        imageContentType: image.contentType,
        imageSizeBytes: image.data.length,
        imageModel: image.model,
        imagePrompt: image.prompt,
        imageInputTokens: image.usage?.inputTokens,
        imageOutputTokens: image.usage?.outputTokens,
      };
    }

    const generation = await this.prisma.client.generation.create({
      data: {
        text: text.text,
        textModel: text.model,
        textInstructions: text.instructions,
        textPrompt: text.prompt,
        textInputTokens: text.usage?.inputTokens,
        textOutputTokens: text.usage?.outputTokens,
        ...imageColumns,
        submissions: { create: uniqueIds.map((submissionId) => ({ submissionId })) },
      },
      select: { id: true },
    });
    this.logger.log(
      `Saved generation ${generation.id} from ${uniqueIds.length} submission(s)${image ? " with an image" : ""}`,
    );
    return generation;
  }
}

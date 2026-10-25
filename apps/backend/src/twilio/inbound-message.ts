import { z } from "zod";
import { MAX_IMAGES } from "../submissions/images";

export type InboundMedia = { url: string; contentType: string };

/**
 * Twilio's incoming-message webhook payload (form-encoded). Attachments arrive as numbered
 * MediaUrl0…/MediaContentType0… fields, NumMedia of them; this collects them into `media`.
 */
export const inboundMessageSchema = z
  .looseObject({
    MessageSid: z.string().regex(/^(SM|MM)[0-9a-f]{32}$/),
    From: z.string().min(1),
    To: z.string().min(1),
    Body: z.string().default(""),
    NumMedia: z.coerce.number().int().min(0).max(MAX_IMAGES).default(0),
  })
  .transform((params, ctx) => {
    const media: InboundMedia[] = [];
    for (let i = 0; i < params.NumMedia; i++) {
      const url = z.url().safeParse(params[`MediaUrl${i}`]);
      const contentType = z.string().min(1).safeParse(params[`MediaContentType${i}`]);
      if (!url.success || !contentType.success) {
        ctx.addIssue({ code: "custom", message: `MediaUrl${i}/MediaContentType${i} missing` });
        return z.NEVER;
      }
      media.push({ url: url.data, contentType: contentType.data });
    }
    return {
      messageSid: params.MessageSid,
      from: params.From,
      to: params.To,
      body: params.Body,
      media,
    };
  });

export type InboundMessage = z.output<typeof inboundMessageSchema>;

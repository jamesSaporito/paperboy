import { fileTypeFromBuffer } from "file-type";

/** Limits shared by every way images arrive: direct uploads, Twilio MMS, and email. */
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif)$/;

/** The file's real type, from its contents rather than its declared type, if it's an allowed image. */
export async function detectImageType(data: Buffer): Promise<{ mime: string; ext: string } | null> {
  const detected = await fileTypeFromBuffer(data);
  return detected && IMAGE_TYPES.test(detected.mime) ? detected : null;
}

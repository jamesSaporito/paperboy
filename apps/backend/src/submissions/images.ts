import { fileTypeFromBuffer } from "file-type";

/** Limits for images in a submission. */
export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif)$/;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** The file extension for an image's content type, for building S3 keys. */
export function imageExtension(contentType: string): string {
  return EXTENSIONS[contentType] ?? "bin";
}

/** The file's real type, from its contents rather than its declared type, if it's an allowed image. */
export async function detectImageType(data: Buffer): Promise<{ mime: string; ext: string } | null> {
  const detected = await fileTypeFromBuffer(data);
  return detected && IMAGE_TYPES.test(detected.mime) ? detected : null;
}

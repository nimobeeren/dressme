import type { Sharp } from "sharp";
import { getSettings } from "./settings";

async function getSharp() {
  return (await import("sharp")).default;
}

export async function safeOpenImage(data: Buffer): Promise<Sharp> {
  const sharp = await getSharp();
  const settings = getSettings();

  try {
    const img = sharp(data, {
      limitInputPixels: settings.MAX_IMAGE_PIXELS,
    });
    const metadata = await img.metadata();
    if (!metadata.format) {
      throw new Error("Could not determine image format");
    }
    return img.rotate().resize(2048, 2048, {
      fit: "inside",
      withoutEnlargement: true,
    });
  } catch {
    throw new UnprocessableImageError("Could not read the uploaded file as an image.");
  }
}

export async function compressToJpeg(img: Sharp, quality = 75): Promise<Buffer> {
  return img.jpeg({ quality }).toBuffer();
}

/**
 * Reads all files uploaded under `name` in a server action's `FormData`,
 * enforcing the per-file size cap, and returns their bytes.
 */
export async function readFormFiles(formData: FormData, name: string): Promise<Buffer[]> {
  const maxFileSize = getSettings().MAX_UPLOAD_SIZE;

  const buffers: Buffer[] = [];
  for (const value of formData.getAll(name)) {
    if (typeof value === "string") {
      throw new BadRequestError(`Expected a file for field "${name}".`);
    }
    if (value.size > maxFileSize) {
      throw new UploadTooLargeError(
        `Upload must be smaller than ${maxFileSize / (1024 * 1024)} MB.`,
      );
    }
    buffers.push(Buffer.from(await value.arrayBuffer()));
  }
  return buffers;
}

/**
 * Reads the single file uploaded under `name` in a server action's `FormData`,
 * enforcing the per-file size cap.
 */
export async function readFormFile(formData: FormData, name: string): Promise<Buffer> {
  const [buffer] = await readFormFiles(formData, name);
  if (!buffer) {
    throw new BadRequestError(`Missing file for field "${name}".`);
  }
  return buffer;
}

/**
 * Reads the single `image` file field of a server action's `FormData` and
 * returns it as compressed JPEG bytes.
 */
export async function readFormImageAsJpeg(formData: FormData): Promise<Buffer> {
  const img = await safeOpenImage(await readFormFile(formData, "image"));
  return compressToJpeg(img);
}

export class UploadTooLargeError extends Error {}
export class UnprocessableImageError extends Error {}
export class BadRequestError extends Error {}

/** True for errors a server action should surface as a returned error value
 * rather than rethrowing to an error boundary. */
export function isExpectedUploadError(
  error: unknown,
): error is UploadTooLargeError | UnprocessableImageError | BadRequestError {
  return (
    error instanceof UploadTooLargeError ||
    error instanceof UnprocessableImageError ||
    error instanceof BadRequestError
  );
}

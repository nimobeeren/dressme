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

export interface UploadedFile {
  filename: string | undefined;
  contentType: string | undefined;
  data: Buffer;
}

export interface ParsedUpload {
  fields: Map<string, string[]>;
  files: Map<string, UploadedFile[]>;
}

/**
 * Parse a `FormData` (as received by a server action) into the same shape as
 * `parseUpload`, applying the same per-file size cap.
 */
export async function parseUpload(
  formData: FormData,
  options: { maxFileSize?: number } = {},
): Promise<ParsedUpload> {
  const settings = getSettings();
  const maxFileSize = options.maxFileSize ?? settings.MAX_UPLOAD_SIZE;

  const fields = new Map<string, string[]>();
  const files = new Map<string, UploadedFile[]>();

  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") {
      const arr = fields.get(name) ?? [];
      arr.push(value);
      fields.set(name, arr);
    } else {
      if (value.size > maxFileSize) {
        throw new UploadTooLargeError(
          `Upload must be smaller than ${maxFileSize / (1024 * 1024)} MB.`,
        );
      }
      const arr = files.get(name) ?? [];
      arr.push({
        filename: value.name,
        contentType: value.type,
        data: Buffer.from(await value.arrayBuffer()),
      });
      files.set(name, arr);
    }
  }

  return { fields, files };
}

/**
 * Reads the single `image` file field of a server action's `FormData`,
 * rejecting invalid or oversized uploads, and returns it as compressed JPEG
 * bytes.
 */
export async function readFormImageAsJpeg(formData: FormData): Promise<Buffer> {
  const upload = await parseUpload(formData);
  const image = upload.files.get("image")?.[0];
  if (!image) {
    throw new BadRequestError("Missing image file");
  }
  const img = await safeOpenImage(image.data);
  return compressToJpeg(img);
}

export class UploadTooLargeError extends Error {
  status = 413;
}
export class UnprocessableImageError extends Error {
  status = 422;
}
export class BadRequestError extends Error {
  status = 400;
}

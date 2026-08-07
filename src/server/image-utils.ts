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

export async function readUpload(data: Buffer): Promise<Buffer> {
  const settings = getSettings();
  if (data.length > settings.MAX_UPLOAD_SIZE) {
    throw new UploadTooLargeError(
      `Upload must be smaller than ${settings.MAX_UPLOAD_SIZE / (1024 * 1024)} MB.`,
    );
  }
  return data;
}

export class UploadTooLargeError extends Error {
  status = 413;
}
export class UnprocessableImageError extends Error {
  status = 422;
}

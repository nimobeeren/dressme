import type { Sharp } from "sharp";
import type { NextRequest } from "next/server";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Readable } from "node:stream";
import Busboy from "busboy";
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
 * Read a streaming upload, aborting once it exceeds `maxBytes` so that an
 * oversized body never fully materializes in memory.
 */
export async function readUpload(
  source: Readable,
  maxBytes: number = getSettings().MAX_UPLOAD_SIZE,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of source) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buf.length;
      if (total > maxBytes) {
        throw new UploadTooLargeError(
          `Upload must be smaller than ${maxBytes / (1024 * 1024)} MB.`,
        );
      }
      chunks.push(buf);
    }
  } finally {
    source.destroy();
  }
  return Buffer.concat(chunks, total);
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
 * Parse a multipart/form-data request by streaming the body through busboy,
 * applying `readUpload`'s per-file size cap to each file part. The request
 * body is never buffered in full: each file part is read incrementally and
 * the parse is aborted as soon as a single part exceeds the size limit, so
 * memory stays bounded regardless of upload size.
 */
export async function parseUpload(
  request: NextRequest,
  options: { maxFileSize?: number } = {},
): Promise<ParsedUpload> {
  const settings = getSettings();
  const maxFileSize = options.maxFileSize ?? settings.MAX_UPLOAD_SIZE;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new BadRequestError("Expected multipart/form-data");
  }
  if (!request.body) {
    throw new BadRequestError("Request body is empty");
  }

  const body = Readable.fromWeb(request.body as unknown as NodeReadableStream);
  const bb = Busboy({ headers: { "content-type": contentType } });
  const fields = new Map<string, string[]>();
  const files = new Map<string, UploadedFile[]>();
  const fileJobs: Promise<void>[] = [];

  return new Promise<ParsedUpload>((resolve, reject) => {
    let settled = false;
    const rejectOnce = (err: unknown) => {
      if (settled) return;
      settled = true;
      // Destroy busboy to stop parsing, but do NOT destroy `body` (the
      // Readable.fromWeb wrapper). Destroying it calls reader.cancel() on the
      // underlying web stream, which races with undici's internal enqueue in
      // Node 24+ and throws "ReadableStream is already closed". Letting the
      // pipe unpipe `body` naturally is safe — `body` drains or pauses, and
      // GC reclaims it when the request goes out of scope.
      try {
        bb.destroy();
      } catch {
        /* already closed */
      }
      reject(err);
    };

    bb.on("field", (name, value) => {
      const arr = fields.get(name) ?? [];
      arr.push(value);
      fields.set(name, arr);
    });

    bb.on("file", (name, stream, info) => {
      const job = readUpload(stream, maxFileSize)
        .then((data) => {
          const arr = files.get(name) ?? [];
          arr.push({ filename: info.filename, contentType: info.mimeType, data });
          files.set(name, arr);
        })
        .catch((err) => {
          rejectOnce(err);
        });
      fileJobs.push(job);
    });

    bb.on("close", () => {
      Promise.all(fileJobs)
        .then(() => {
          if (settled) return;
          settled = true;
          resolve({ fields, files });
        })
        .catch(rejectOnce);
    });
    bb.on("error", rejectOnce);
    body.on("error", rejectOnce);
    body.pipe(bb);
  });
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

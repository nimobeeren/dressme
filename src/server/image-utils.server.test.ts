import { Readable } from "node:stream";
import sharp from "sharp";
import { beforeEach, describe, expect, test } from "vitest";
import { compressToJpeg, readUpload, safeOpenImage } from "./image-utils";
import { getSettings, setSettings } from "./settings";

async function makePngImage(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

async function makeDecompressionBomb(): Promise<Buffer> {
  return sharp({
    create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

describe("readUpload", () => {
  beforeEach(() => {
    const settings = getSettings();
    setSettings({ ...settings, MAX_UPLOAD_SIZE: 100 });
  });

  function toStream(data: Buffer): Readable {
    return Readable.from([data]);
  }

  test("returns contents when within limit", async () => {
    const data = Buffer.from("some image data");
    const result = await readUpload(toStream(data));
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.equals(data)).toBe(true);
  });

  test("throws when over size limit", async () => {
    await expect(readUpload(toStream(Buffer.alloc(101)))).rejects.toThrow(
      "Upload must be smaller than",
    );
  });

  test("exact limit is allowed", async () => {
    const data = Buffer.alloc(100);
    const result = await readUpload(toStream(data));
    expect(result.equals(data)).toBe(true);
  });

  test("aborts an oversized stream instead of draining it", async () => {
    let stopped = false;
    async function* infinite() {
      try {
        while (true) yield Buffer.alloc(1000);
      } finally {
        stopped = true;
      }
    }
    const stream = Readable.from(infinite());
    await expect(readUpload(stream)).rejects.toThrow("Upload must be smaller than");
    expect(stopped).toBe(true);
  });
});

describe("safeOpenImage", () => {
  test("returns a sharp instance from valid image data", async () => {
    const img = await safeOpenImage(await makePngImage());
    const meta = await img.metadata();
    expect(meta.format).toBeDefined();
  });

  test("thumbnails to max dimension without enlarging smaller images", async () => {
    const img = await safeOpenImage(await makePngImage(100, 100));
    const meta = await img.metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  test("throws on invalid data", async () => {
    await expect(safeOpenImage(Buffer.from("not an image"))).rejects.toThrow(
      "Could not read the uploaded file as an image.",
    );
  });

  test("throws on a decompression-bomb image", async () => {
    await expect(safeOpenImage(await makeDecompressionBomb())).rejects.toThrow(
      "Could not read the uploaded file as an image.",
    );
  });
});

describe("compressToJpeg", () => {
  test("returns JPEG bytes from RGB image", async () => {
    const img = sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
    });
    const result = await compressToJpeg(img);
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);
    expect(result[2]).toBe(0xff);
  });

  test("flattens an RGBA image to JPEG", async () => {
    const img = sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 },
      },
    });
    const result = await compressToJpeg(img);
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8);
    expect(result[2]).toBe(0xff);
  });
});

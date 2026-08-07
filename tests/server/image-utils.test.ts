import { describe, expect, test, beforeEach } from "vitest";
import { safeOpenImage, compressToJpeg, readUpload } from "../../src/server/image-utils";
import { getSettings, setSettings } from "../../src/server/settings";
import sharp from "sharp";

async function makePngImage(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

// A valid PNG whose decoded pixel count (64M) exceeds MAX_IMAGE_PIXELS (50M),
// exercising sharp's `limitInputPixels` decompression-bomb guard. PNG deflates
// the solid color to a tiny file, so this proves the guard is on decoded
// dimensions, not encoded file size.
async function makeDecompressionBomb(): Promise<Buffer> {
  return sharp({
    create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();
}

describe("image-utils", () => {
  describe("readUpload", () => {
    beforeEach(() => {
      const s = getSettings();
      setSettings({ ...s, MAX_UPLOAD_SIZE: 100 });
    });
    test("returns contents when within limit", async () => {
      const data = Buffer.from("some image data");
      const result = await readUpload(data);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    test("throws when over size limit", async () => {
      const data = Buffer.alloc(101);
      await expect(readUpload(data)).rejects.toThrow("Upload must be smaller than");
    });

    test("exact limit is allowed", async () => {
      const data = Buffer.alloc(100);
      const result = await readUpload(data);
      expect(result).toEqual(data);
    });
  });

  describe("safeOpenImage", () => {
    test("returns a sharp instance from valid image data", async () => {
      const data = await makePngImage();
      const img = await safeOpenImage(data);
      const meta = await img.metadata();
      expect(meta.format).toBeDefined();
    });

    test("thumbnails to max dimension without enlarging smaller images", async () => {
      const data = await makePngImage(100, 100);
      const img = await safeOpenImage(data);
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
      // 8000x8000 = 64M pixels, over the 50M default MAX_IMAGE_PIXELS. The
      // encoded PNG stays tiny, so this proves the guard is on decoded
      // dimensions, not file size.
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
      // JPEG files start with FF D8 FF
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
});

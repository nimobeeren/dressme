"use server";

import { wearableCategorySchema, type ClassifyResponse } from "@/shared/schemas";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "../auth";
import { uploadBlob } from "../blob-storage";
import { db, schema } from "../db";
import {
  compressToJpeg,
  isExpectedUploadError,
  readFormFile,
  readFormImageAsJpeg,
  safeOpenImage,
} from "../image-utils";
import { CACHE_TAGS, getWearables } from "../queries";
import { getSettings } from "../settings";

/**
 * Adds the wearable from the `category`/`image` form field pair and schedules
 * WOA generation. Returns the user-facing error, if any.
 */
export async function createWearable(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();

  if (!user.avatarImageKey) {
    return { error: "Avatar generation must be completed before adding wearables." };
  }

  const settings = getSettings();

  try {
    const image = await readFormFile(formData, "image");

    const parsed = wearableCategorySchema.safeParse(formData.get("category"));
    if (!parsed.success) {
      return { error: "Invalid category." };
    }
    const category = parsed.data;

    const jpegData = await compressToJpeg(await safeOpenImage(image));

    const key = `${randomUUID()}.jpg`;
    await uploadBlob(settings.WEARABLES_BUCKET, key, jpegData, "image/jpeg");

    const [wearable] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category,
        imageKey: key,
      })
      .returning();

    if (!wearable) {
      throw new Error("Failed to create wearable");
    }

    // Schedule generation after the DB commit so the wearable exists.
    after(async () => {
      const { generateWoaTask } = await import("../background-tasks");
      await generateWoaTask(wearable.id, user.id);
    });
  } catch (error) {
    if (isExpectedUploadError(error)) {
      return { error: error.message };
    }
    throw error;
  }

  updateTag(CACHE_TAGS.wearables);
  return {};
}

/**
 * Classifies a wearable image into a category suggestion. A pure read — no
 * revalidation. Returns the user-facing error, if any.
 */
export async function classifyWearable(formData: FormData): Promise<ClassifyResponse> {
  await getCurrentUser();

  let jpegData: Buffer;
  try {
    jpegData = await readFormImageAsJpeg(formData);
  } catch (error) {
    if (isExpectedUploadError(error)) {
      return { category: null, error: error.message };
    }
    throw error;
  }

  try {
    const { classifyWearableImage } = await import("../wearable-classification");
    const category = wearableCategorySchema.nullable().parse(await classifyWearableImage(jpegData));
    return { category };
  } catch (error) {
    console.error("Wearable classification failed:", error);
    return { category: null, error: "Wearable classification failed" };
  }
}

/**
 * Re-reads wearables via the shared query and re-renders the route. Called on
 * an interval by the client while WOA generation is pending.
 */
export async function refreshWearables(): Promise<void> {
  await getWearables();
  updateTag(CACHE_TAGS.wearables);
}

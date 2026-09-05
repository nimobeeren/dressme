"use server";

import { wearableCategorySchema, type ClassifyResponse } from "@/shared/schemas";
import type { WearableCategory } from "@/shared/wearable-categories";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "../auth";
import { uploadBlob } from "../blob-storage";
import { db, schema } from "../db";
import {
  compressToJpeg,
  parseFormUpload,
  readFormImageAsJpeg,
  safeOpenImage,
} from "../image-utils";
import { CACHE_TAGS, getWearables } from "../queries";
import { getSettings } from "../settings";

/**
 * Adds wearables from `category`/`image` form field pairs and schedules WOA
 * generation for each.
 */
// TODO: return structured error response instead of throwing (see: https://nextjs.org/docs/app/getting-started/error-handling#server-functions)
export async function createWearables(formData: FormData): Promise<void> {
  const user = await getCurrentUser();

  if (!user.avatarImageKey) {
    throw new Error("Avatar generation must be completed before adding wearables.");
  }

  const upload = await parseFormUpload(formData);
  const categories = upload.fields.get("category") ?? [];
  const images = upload.files.get("image") ?? [];

  if (categories.length !== images.length) {
    throw new Error("The category and image fields should occur the same number of times.");
  }

  const validCategories = categories.map((category) => wearableCategorySchema.parse(category));
  const settings = getSettings();

  const wearables: Array<{ id: string; category: WearableCategory; imageKey: string }> = [];

  for (let i = 0; i < validCategories.length; i++) {
    const category = validCategories[i];
    const image = images[i];

    const jpegData = await compressToJpeg(await safeOpenImage(image.data));

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

    wearables.push({ id: wearable.id, category, imageKey: key });
  }

  // Schedule generation after the DB commit so the wearables exist.
  for (const wearable of wearables) {
    after(async () => {
      const { generateWoaTask } = await import("../background-tasks");
      await generateWoaTask(wearable.id, user.id);
    });
  }

  updateTag(CACHE_TAGS.wearables);
}

/**
 * Classifies a wearable image into a category suggestion. A pure read — no
 * revalidation.
 */
export async function classifyWearable(formData: FormData): Promise<ClassifyResponse> {
  await getCurrentUser();

  const jpegData = await readFormImageAsJpeg(formData);

  try {
    const { classifyWearableImage } = await import("../wearable-classification");
    const category = wearableCategorySchema.nullable().parse(await classifyWearableImage(jpegData));
    return { category };
  } catch (error) {
    console.error("Wearable classification failed:", error);
    throw new Error("Wearable classification failed");
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

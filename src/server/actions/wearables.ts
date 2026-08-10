"use server";

import { randomUUID } from "node:crypto";
import type { ClassifyResponse } from "@/shared/schemas";
import { updateTag } from "next/cache";
import { getCurrentUser } from "../dal";
import { getDb, schema } from "../db";
import {
  compressToJpeg,
  parseFormUpload,
  readFormImageAsJpeg,
  safeOpenImage,
} from "../image-utils";
import { CACHE_TAGS, getWearables } from "../queries";
import { getAfter, getBlobStorage } from "../services";
import { getSettings } from "../settings";

/**
 * Adds wearables from `category`/`image` form field pairs and schedules WOA
 * generation for each. Replaces POST /api/wearables.
 */
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

  const settings = getSettings();
  const blobStorage = getBlobStorage();
  const db = getDb();

  const wearables: Array<{ id: string; category: string; imageKey: string }> = [];

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const image = images[i];

    const jpegData = await compressToJpeg(await safeOpenImage(image.data));

    const key = `${randomUUID()}.jpg`;
    await blobStorage.upload(settings.WEARABLES_BUCKET, key, jpegData, "image/jpeg");

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

  // Create WearableOnAvatar (WOA) images
  // Do this after DB commit to ensure the wearables exist
  const after = getAfter();
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
 * revalidation. Replaces POST /api/wearables/classify.
 */
export async function classifyWearable(formData: FormData): Promise<ClassifyResponse> {
  await getCurrentUser();

  const jpegData = await readFormImageAsJpeg(formData);

  try {
    const { classifyWearableImage } = await import("../wearable-classification");
    const category = await classifyWearableImage(jpegData);
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

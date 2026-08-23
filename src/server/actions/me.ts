"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb, schema } from "../db";
import { readFormImageAsJpeg } from "../image-utils";
import { CACHE_TAGS, getMe } from "../queries";
import { getAfter, getBlobStorage } from "../services";
import { getSettings } from "../settings";

/**
 * Uploads the user's selfie (one-time) and kicks off avatar generation.
 * Replaces PUT /api/images/avatars/me.
 */
export async function uploadSelfie(formData: FormData): Promise<void> {
  const user = await getCurrentUser();

  if (user.selfieImageKey !== null) {
    throw new Error("It's currently not possible to replace an existing avatar image.");
  }

  const jpegData = await readFormImageAsJpeg(formData);
  const settings = getSettings();
  const blobStorage = getBlobStorage();
  const db = getDb();

  // Upload selfie to blob storage
  const key = `${randomUUID()}.jpg`;
  await blobStorage.upload(settings.SELFIES_BUCKET, key, jpegData, "image/jpeg");

  // Update user and trigger avatar generation
  await db.update(schema.users).set({ selfieImageKey: key }).where(eq(schema.users.id, user.id));

  const after = getAfter();
  after(async () => {
    const { generateAvatarTask } = await import("../background-tasks");
    await generateAvatarTask(user.id);
  });

  updateTag(CACHE_TAGS.me);
}

/**
 * Re-reads the current user via the shared query and re-renders the route.
 * Called on an interval by the client while avatar generation is pending.
 */
export async function refreshMe(): Promise<void> {
  await getMe();
  updateTag(CACHE_TAGS.me);
}

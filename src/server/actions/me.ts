"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { after } from "next/server";
import { getCurrentUser } from "../auth";
import { uploadBlob } from "../blob-storage";
import { db, schema } from "../db";
import { readFormImageAsJpeg, isExpectedUploadError } from "../image-utils";
import { CACHE_TAGS, getMe } from "../queries";
import { getSettings } from "../settings";

/**
 * Uploads the user's selfie (one-time) and kicks off avatar generation.
 * Returns the user-facing error, if any.
 */
export async function uploadSelfie(formData: FormData): Promise<{ error?: string }> {
  const user = await getCurrentUser();

  if (user.selfieImageKey !== null) {
    return { error: "It's currently not possible to replace an existing avatar image." };
  }

  let jpegData: Buffer;
  try {
    jpegData = await readFormImageAsJpeg(formData);
  } catch (error) {
    if (isExpectedUploadError(error)) {
      return { error: error.message };
    }
    throw error;
  }

  const settings = getSettings();

  const key = `${randomUUID()}.jpg`;
  await uploadBlob(settings.SELFIES_BUCKET, key, jpegData, "image/jpeg");

  await db.update(schema.users).set({ selfieImageKey: key }).where(eq(schema.users.id, user.id));

  after(async () => {
    const { generateAvatarTask } = await import("../background-tasks");
    await generateAvatarTask(user.id);
  });

  updateTag(CACHE_TAGS.me);
  return {};
}

/**
 * Re-reads the current user via the shared query and re-renders the route.
 * Called on an interval by the client while avatar generation is pending.
 */
export async function refreshMe(): Promise<void> {
  await getMe();
  updateTag(CACHE_TAGS.me);
}

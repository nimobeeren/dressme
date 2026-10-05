import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { env } from "@/env/server";
import { downloadBlob, uploadBlob } from "./blob-storage";
import { logger } from "./logger";
import { db, schema } from "./db";

// TODO: add a test for this
export async function generateAvatarTask(userId: string): Promise<void> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });

    if (!user || !user.selfieImageKey) {
      throw new Error("User does not have a selfie image");
    }

    const selfieData = await downloadBlob(env.SELFIES_BUCKET, user.selfieImageKey);

    const { generateAvatar } = await import("./avatar-generation");
    const avatarData = await generateAvatar(selfieData);

    const avatarKey = `${randomUUID()}.jpg`;
    await uploadBlob(env.AVATARS_BUCKET, avatarKey, avatarData, "image/jpeg");

    await db
      .update(schema.users)
      .set({ avatarImageKey: avatarKey })
      .where(eq(schema.users.id, userId));

    logger.info({ userId }, "Avatar generation succeeded");
  } catch (error) {
    logger.error({ userId, err: error }, "Avatar generation failed");
  }
}

// TODO: add a test for this
export async function generateWoaTask(wearableId: string, userId: string): Promise<void> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, userId),
    });
    if (!user) throw new Error(`User '${userId}' not found`);
    if (!user.avatarImageKey) {
      throw new Error(`User '${userId}' does not have an avatar image`);
    }

    const wearable = await db.query.wearables.findFirst({
      where: eq(schema.wearables.id, wearableId),
    });
    if (!wearable) throw new Error(`Wearable '${wearableId}' not found`);

    const wearableImageData = await downloadBlob(env.WEARABLES_BUCKET, wearable.imageKey);
    const avatarImageData = await downloadBlob(env.AVATARS_BUCKET, user.avatarImageKey);

    const { generateWoaImage, generateMask } = await import("./woa-generation");

    // Generate an image of the avatar wearing the wearable
    const woaImageData = await generateWoaImage({
      avatarImage: avatarImageData,
      wearableImage: wearableImageData,
      category: wearable.category,
    });

    // Get a mask of the wearable on the avatar using an image segmentation model
    const maskImageData = await generateMask({
      woaImage: woaImageData,
      category: wearable.category,
    });

    const woaKey = `${randomUUID()}.jpg`;
    const maskKey = `${randomUUID()}.jpg`;

    // Upload results to blob storage
    await uploadBlob(env.WOA_BUCKET, woaKey, woaImageData, "image/jpeg");
    await uploadBlob(env.WOA_MASKS_BUCKET, maskKey, maskImageData, "image/jpeg");

    await db.insert(schema.wearableOnAvatarImages).values({
      userId: user.id,
      avatarImageKey: user.avatarImageKey,
      wearableImageKey: wearable.imageKey,
      imageKey: woaKey,
      maskImageKey: maskKey,
    });

    logger.info({ wearableId, userId }, "WOA generation succeeded");
  } catch (error) {
    logger.error({ wearableId, userId, err: error }, "WOA generation failed");
  }
}

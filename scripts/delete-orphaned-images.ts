import "dotenv/config";
import { db, schema } from "../src/server/db";
import { deleteBlobs, listBlobs } from "../src/server/blob-storage";
import { env } from "../src/env/server";

// Keys referenced by the database are considered live; anything else in the
// buckets is an orphan. All key columns count as live references, including
// the image version pins on wearableonavatarimage.
async function getLiveKeys(): Promise<Map<string, Set<string>>> {
  const users = await db
    .select({
      selfieImageKey: schema.users.selfieImageKey,
      avatarImageKey: schema.users.avatarImageKey,
    })
    .from(schema.users);
  const wearables = await db.select({ imageKey: schema.wearables.imageKey }).from(schema.wearables);
  const woaImages = await db
    .select({
      avatarImageKey: schema.wearableOnAvatarImages.avatarImageKey,
      wearableImageKey: schema.wearableOnAvatarImages.wearableImageKey,
      imageKey: schema.wearableOnAvatarImages.imageKey,
      maskImageKey: schema.wearableOnAvatarImages.maskImageKey,
    })
    .from(schema.wearableOnAvatarImages);

  const live = new Map<string, Set<string>>([
    [env.SELFIES_BUCKET, new Set<string>()],
    [env.AVATARS_BUCKET, new Set<string>()],
    [env.WEARABLES_BUCKET, new Set<string>()],
    [env.WOA_BUCKET, new Set<string>()],
  ]);
  const add = (bucket: string, key: string | null) => {
    if (key) live.get(bucket)!.add(key);
  };

  for (const user of users) {
    add(env.SELFIES_BUCKET, user.selfieImageKey);
    add(env.AVATARS_BUCKET, user.avatarImageKey);
  }
  for (const wearable of wearables) {
    add(env.WEARABLES_BUCKET, wearable.imageKey);
  }
  for (const woa of woaImages) {
    add(env.AVATARS_BUCKET, woa.avatarImageKey);
    add(env.WEARABLES_BUCKET, woa.wearableImageKey);
    add(env.WOA_BUCKET, woa.imageKey);
    add(env.WOA_BUCKET, woa.maskImageKey);
  }
  return live;
}

async function main() {
  const deleteMode = process.argv.includes("--delete");
  const live = await getLiveKeys();

  let totalOrphans = 0;
  for (const [bucket, liveKeys] of live) {
    const keys = await listBlobs(bucket);
    const orphans = keys.filter((key) => !liveKeys.has(key));
    totalOrphans += orphans.length;

    console.info(
      `${bucket}: ${keys.length} objects, ${liveKeys.size} referenced, ${orphans.length} orphaned`,
    );
    for (const key of orphans) {
      console.info(`  ${deleteMode ? "deleting" : "orphaned"}: ${key}`);
    }

    if (deleteMode && orphans.length > 0) {
      await deleteBlobs(bucket, orphans);
    }
  }

  if (deleteMode) {
    console.info(`Deleted ${totalOrphans} orphaned images.`);
  } else {
    console.info(`Found ${totalOrphans} orphaned images. Run again with --delete to remove them.`);
  }
}

main().catch((err) => {
  console.error("Failed to delete orphaned images:", err);
  process.exit(1);
});

import "dotenv/config";
import { db, schema } from "../src/server/db";
import { deleteBlobs, downloadBlob, listBlobs, uploadBlob } from "../src/server/blob-storage";
import { env } from "../src/env/server";

/**
 * One-time migration that splits the legacy shared WOA bucket into the WearableOnAvatar
 * image bucket (`WOA_BUCKET`) and the mask bucket (`WOA_MASKS_BUCKET`). The database
 * decides where each object goes: `image_key` columns migrate to `WOA_BUCKET`,
 * `mask_image_key` columns to `WOA_MASKS_BUCKET`.
 *
 * Idempotent: objects already present in the destination are skipped. Pass `--delete`
 * to remove migrated objects from the source bucket afterwards (orphaned objects in
 * the source are left alone; the source bucket is retired as a whole).
 *
 * Usage: pnpm migrate-woa-buckets -- [--from dressme-woa] [--delete]
 */
const DEFAULT_SOURCE_BUCKET = "dressme-woa";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const sourceBucket = argValue("--from") ?? DEFAULT_SOURCE_BUCKET;
  const deleteSource = process.argv.includes("--delete");

  if (sourceBucket === env.WOA_BUCKET || sourceBucket === env.WOA_MASKS_BUCKET) {
    throw new Error(
      `Source bucket '${sourceBucket}' is also a destination. Pass --from with the name of the legacy shared bucket.`,
    );
  }

  const woaImages = await db
    .select({
      imageKey: schema.wearableOnAvatarImages.imageKey,
      maskImageKey: schema.wearableOnAvatarImages.maskImageKey,
    })
    .from(schema.wearableOnAvatarImages);

  const targets = new Map<string, Set<string>>([
    [env.WOA_BUCKET, new Set(woaImages.map((w) => w.imageKey))],
    [env.WOA_MASKS_BUCKET, new Set(woaImages.map((w) => w.maskImageKey))],
  ]);

  // Keys verified to be in a destination bucket, either already there or copied
  // by this run. Only these are safe to remove from the source.
  const migrated = new Set<string>();
  const missing: string[] = [];

  for (const [destBucket, keys] of targets) {
    const existing = new Set(await listBlobs(destBucket));
    let copied = 0;
    for (const key of keys) {
      if (existing.has(key)) {
        migrated.add(key);
        continue;
      }
      try {
        const data = await downloadBlob(sourceBucket, key);
        await uploadBlob(destBucket, key, data, "image/jpeg");
      } catch {
        missing.push(key);
        continue;
      }
      migrated.add(key);
      copied += 1;
    }
    console.info(`${destBucket}: ${keys.size} referenced, ${copied} copied from ${sourceBucket}`);
  }

  if (deleteSource) {
    await deleteBlobs(sourceBucket, [...migrated]);
    console.info(`Deleted ${migrated.size} migrated objects from ${sourceBucket}.`);
  }

  if (missing.length > 0) {
    console.error(`${missing.length} referenced objects are missing from ${sourceBucket}:`);
    for (const key of missing) console.error(`  ${key}`);
    process.exit(1);
  }

  console.info("Migration complete.");
}

main().catch((err) => {
  console.error("Failed to migrate WOA buckets:", err);
  process.exit(1);
});

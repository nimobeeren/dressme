import "dotenv/config";
import { eq } from "drizzle-orm";
import { lookup } from "mime-types";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, schema } from "../src/server/db";
import { getBlobStorage } from "../src/server/services";
import { getSettings } from "../src/server/settings";

const settings = getSettings();

// Path to the repo root
const ROOT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SELFIE_PATH = "images/humans/selfie_4.jpg";
const AVATAR_PATH = "images/avatars/avatar_4.jpg";

interface WearableSeedData {
  name: string;
  category: string;
  imagePath: string;
}

const WEARABLES: Record<string, WearableSeedData> = {
  tshirt: {
    name: "tshirt",
    category: "t-shirt",
    imagePath: "images/wearables/tops/t-shirt/purple-tshirt-product.webp",
  },
  shirt: {
    name: "shirt",
    category: "shirt",
    imagePath: "images/wearables/tops/shirt/button-down-casual.jpeg",
  },
  sweater: {
    name: "sweater",
    category: "sweater",
    imagePath: "images/wearables/tops/sweater/pullover-casual.webp",
  },
  jacket: {
    name: "jacket",
    category: "jacket",
    imagePath: "images/wearables/tops/jacket/blazer-casual.webp",
  },
  top: {
    name: "top",
    category: "top",
    imagePath: "images/wearables/tops/top/basic-top-product.webp",
  },
  pants: {
    name: "pants",
    category: "pants",
    imagePath: "images/wearables/bottoms/pants/jeans-product.webp",
  },
  shorts: {
    name: "shorts",
    category: "shorts",
    imagePath: "images/wearables/bottoms/shorts/gym-shorts-product.webp",
  },
  skirt: {
    name: "skirt",
    category: "skirt",
    imagePath: "images/wearables/bottoms/skirt/mini-skirt-product.webp",
  },
};

async function seed() {
  const seedUserId = settings.AUTH0_SEED_USER_ID;
  if (!seedUserId) {
    throw new Error(
      "AUTH0_SEED_USER_ID is not set, but this is required to determine which user " +
        "should own the data added during seeding.",
    );
  }

  const db = getDb();
  const blobStorage = getBlobStorage();

  // Upload selfie image
  const selfiePath = path.join(ROOT_PATH, SELFIE_PATH);
  const selfieData = fs.readFileSync(selfiePath);
  const selfieKey = `${randomUUID()}.jpg`;
  await blobStorage.upload(
    settings.SELFIES_BUCKET,
    selfieKey,
    selfieData,
    lookup(selfiePath) || "image/jpeg",
  );

  // Upload avatar image
  const avatarPath = path.join(ROOT_PATH, AVATAR_PATH);
  const avatarData = fs.readFileSync(avatarPath);
  const avatarKey = `${randomUUID()}.jpg`;
  await blobStorage.upload(
    settings.AVATARS_BUCKET,
    avatarKey,
    avatarData,
    lookup(avatarPath) || "image/jpeg",
  );

  // Check if user already exists
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.auth0UserId, seedUserId),
  });

  if (existing) {
    console.info(
      `User with auth0_user_id '${settings.AUTH0_SEED_USER_ID}' already exists, skipping creation.`,
    );
  }

  let userId = existing?.id;

  // Only create user if they don't exist
  if (!existing) {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: seedUserId,
        selfieImageKey: selfieKey,
        avatarImageKey: avatarKey,
      })
      .returning();

    if (!user) throw new Error("Failed to create user");
    console.info(`Created user: ${user.id}`);
    userId = user.id;
  } else if (userId) {
    // Update existing user's images
    await db
      .update(schema.users)
      .set({ selfieImageKey: selfieKey, avatarImageKey: avatarKey })
      .where(eq(schema.users.id, userId));
    console.info(`Updated user ${userId} with new images`);
  }

  if (!userId) throw new Error("No user ID available");

  // Add wearables
  for (const [name, data] of Object.entries(WEARABLES)) {
    // Upload wearable image
    const imagePath = path.join(ROOT_PATH, data.imagePath);
    const imageData = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath);
    const imageKey = `${randomUUID()}${ext}`;
    await blobStorage.upload(
      settings.WEARABLES_BUCKET,
      imageKey,
      imageData,
      lookup(imagePath) || "image/jpeg",
    );

    // Add wearable
    const [wearable] = await db
      .insert(schema.wearables)
      .values({
        userId,
        category: data.category,
        imageKey,
      })
      .returning();

    if (!wearable) throw new Error(`Failed to create wearable: ${name}`);

    // Upload WOA image
    const woaPath = path.join(ROOT_PATH, "images", "results", "human_4", "single", `${name}.jpg`);
    if (fs.existsSync(woaPath)) {
      const woaData = fs.readFileSync(woaPath);
      const woaKey = `${randomUUID()}.jpg`;
      await blobStorage.upload(settings.WOA_BUCKET, woaKey, woaData, "image/jpeg");

      // Upload mask image
      const maskPath = path.join(ROOT_PATH, "images", "masks", "human_4", "post", `${name}.jpg`);
      if (fs.existsSync(maskPath)) {
        const maskData = fs.readFileSync(maskPath);
        const maskKey = `${randomUUID()}.jpg`;
        await blobStorage.upload(settings.WOA_BUCKET, maskKey, maskData, "image/jpeg");

        // Add WearableOnAvatarImage
        await db.insert(schema.wearableOnAvatarImages).values({
          userId,
          avatarImageKey: avatarKey,
          wearableImageKey: imageKey,
          imageKey: woaKey,
          maskImageKey: maskKey,
        });
      }
    }

    console.info(`Added wearable: ${name} (${wearable.id})`);
  }

  console.info("Seeding complete!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

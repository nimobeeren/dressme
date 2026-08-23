import "server-only";

import { getBodyPart, parseWearableCategory } from "@/shared/wearable-categories";
import type { Outfit, User, Wearable } from "@/shared/schemas";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "./auth";
import { db, schema } from "./db";
import { getSignedBlobUrl } from "./blob-storage";
import { getSettings } from "./settings";

/**
 * Cache tags for the shared queries below. The routes reading these queries are
 * dynamic (they read the session cookie), so nothing is actually cached — the
 * tags exist purely as revalidation signals: server actions call `updateTag`
 * with them to trigger the same-roundtrip re-render of the current route.
 */
export const CACHE_TAGS = {
  me: "me",
  wearables: "wearables",
  outfits: "outfits",
} as const;

/** Maps a wearable DB row to the API shape, resolving its generation status. */
function toWearable(
  w: { id: string; category: string; imageKey: string },
  completedKeys: ReadonlySet<string>,
  settings: ReturnType<typeof getSettings>,
): Promise<Wearable> {
  const category = parseWearableCategory(w.category);
  return getSignedBlobUrl(settings.WEARABLES_BUCKET, w.imageKey).then(
    (wearable_image_url): Wearable => ({
      id: w.id,
      category,
      body_part: getBodyPart(category),
      wearable_image_url,
      generation_status: completedKeys.has(w.imageKey) ? "success" : "pending",
    }),
  );
}

/** Wearable image keys that have a WOA image for the user's current avatar. */
async function getCompletedWearableImageKeys(
  userId: string,
  avatarImageKey: string | null,
): Promise<Set<string>> {
  if (!avatarImageKey) return new Set();
  const woaImages = await db.query.wearableOnAvatarImages.findMany({
    where: eq(schema.wearableOnAvatarImages.userId, userId),
  });
  return new Set(
    woaImages.filter((w) => w.avatarImageKey === avatarImageKey).map((w) => w.wearableImageKey),
  );
}

export async function getMe(): Promise<User> {
  const user = await getCurrentUser();
  return {
    id: user.id,
    has_selfie_image: user.selfieImageKey !== null,
    has_avatar_image: user.avatarImageKey !== null,
  };
}

export async function getWearables(): Promise<Wearable[]> {
  const user = await getCurrentUser();
  const settings = getSettings();

  const userWearables = await db.query.wearables.findMany({
    where: eq(schema.wearables.userId, user.id),
  });

  const completedKeys = await getCompletedWearableImageKeys(user.id, user.avatarImageKey);

  return Promise.all(userWearables.map((w) => toWearable(w, completedKeys, settings)));
}

export async function getOutfits(): Promise<Outfit[]> {
  const user = await getCurrentUser();
  const settings = getSettings();

  const completedWearableImageKeys = await getCompletedWearableImageKeys(
    user.id,
    user.avatarImageKey,
  );

  // Fetch outfits along with the top and bottom wearables
  const outfits = await db.query.outfits.findMany({
    where: eq(schema.outfits.userId, user.id),
    with: {
      top: true,
      bottom: true,
    },
  });

  return Promise.all(
    outfits.map(async (outfit): Promise<Outfit> => {
      const [top, bottom] = await Promise.all([
        toWearable(outfit.top!, completedWearableImageKeys, settings),
        toWearable(outfit.bottom!, completedWearableImageKeys, settings),
      ]);
      return { id: outfit.id, top, bottom };
    }),
  );
}

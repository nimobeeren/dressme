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

/** Keys of a cached wear-on-avatar result. */
type WoaKeys = { imageKey: string; maskImageKey: string };

/**
 * Maps a wearable DB row to the API shape, resolving its generation status and
 * the signed URLs of its wear-on-avatar image and mask (if generated).
 */
async function toWearable(
  w: { id: string; category: string; imageKey: string },
  woaByWearableImageKey: ReadonlyMap<string, WoaKeys>,
  settings: ReturnType<typeof getSettings>,
): Promise<Wearable> {
  const category = parseWearableCategory(w.category);
  const woa = woaByWearableImageKey.get(w.imageKey);
  const [wearable_image_url, woa_image_url, woa_mask_url] = await Promise.all([
    getSignedBlobUrl(settings.WEARABLES_BUCKET, w.imageKey),
    woa ? getSignedBlobUrl(settings.WOA_BUCKET, woa.imageKey) : null,
    woa ? getSignedBlobUrl(settings.WOA_BUCKET, woa.maskImageKey) : null,
  ]);
  return {
    id: w.id,
    category,
    body_part: getBodyPart(category),
    wearable_image_url,
    generation_status: woa ? "success" : "pending",
    woa_image_url,
    woa_mask_url,
  };
}

/**
 * Wear-on-avatar images keyed by the wearable image key they were generated
 * from, for the user's current avatar only. A cached result from a previous
 * avatar is deliberately ignored: the layers it would produce no longer line up
 * with the current avatar, so the wearable simply reads as pending again.
 */
async function getWoaKeysByWearableImageKey(
  userId: string,
  avatarImageKey: string | null,
): Promise<Map<string, WoaKeys>> {
  if (!avatarImageKey) return new Map();
  const woaImages = await db.query.wearableOnAvatarImages.findMany({
    where: eq(schema.wearableOnAvatarImages.userId, userId),
  });
  return new Map(
    woaImages
      .filter((w) => w.avatarImageKey === avatarImageKey)
      .map((w) => [w.wearableImageKey, { imageKey: w.imageKey, maskImageKey: w.maskImageKey }]),
  );
}

export async function getMe(): Promise<User> {
  const user = await getCurrentUser();
  const settings = getSettings();
  return {
    id: user.id,
    has_selfie_image: user.selfieImageKey !== null,
    avatar_image_url:
      user.avatarImageKey === null
        ? null
        : await getSignedBlobUrl(settings.AVATARS_BUCKET, user.avatarImageKey),
  };
}

export async function getWearables(): Promise<Wearable[]> {
  const user = await getCurrentUser();
  const settings = getSettings();

  const userWearables = await db.query.wearables.findMany({
    where: eq(schema.wearables.userId, user.id),
  });

  const woaKeys = await getWoaKeysByWearableImageKey(user.id, user.avatarImageKey);

  return Promise.all(userWearables.map((w) => toWearable(w, woaKeys, settings)));
}

export async function getOutfits(): Promise<Outfit[]> {
  const user = await getCurrentUser();
  const settings = getSettings();

  const woaKeys = await getWoaKeysByWearableImageKey(user.id, user.avatarImageKey);

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
        toWearable(outfit.top!, woaKeys, settings),
        toWearable(outfit.bottom!, woaKeys, settings),
      ]);
      return { id: outfit.id, top, bottom };
    }),
  );
}

"use server";

import { eq } from "drizzle-orm";
import { getBodyPart } from "@/shared/wearable-categories";
import { updateTag } from "next/cache";
import { getCurrentUser } from "../auth";
import { getDb, schema } from "../db";
import { CACHE_TAGS } from "../queries";

/**
 * Favorites the outfit made up of the given top and bottom. Replaces
 * POST /api/outfits.
 */
export async function createOutfit(params: { topId: string; bottomId: string }): Promise<void> {
  const user = await getCurrentUser();
  const db = getDb();

  const topId = params.topId;
  const bottomId = params.bottomId;

  // Ensure that the top and bottom wearables exist AND belong to the current user
  const top = await db.query.wearables.findFirst({
    where: eq(schema.wearables.id, topId),
  });

  if (!top || top.userId !== user.id) {
    throw new Error(`Top wearable with ID '${topId}' not found or not owned by user.`);
  }
  if (getBodyPart(top.category) !== "top") {
    throw new Error('Top wearable must have "body_part": "top".');
  }

  const bottom = await db.query.wearables.findFirst({
    where: eq(schema.wearables.id, bottomId),
  });

  if (!bottom || bottom.userId !== user.id) {
    throw new Error(`Bottom wearable with ID '${bottomId}' not found or not owned by user.`);
  }
  if (getBodyPart(bottom.category) !== "bottom") {
    throw new Error('Bottom wearable must have "body_part": "bottom".');
  }

  // Check if the outfit already exists
  const existing = await db.query.outfits.findFirst({
    where: eq(schema.outfits.userId, user.id),
  });

  if (existing?.topId === topId && existing?.bottomId === bottomId) {
    return;
  }

  // Create the outfit
  await db.insert(schema.outfits).values({
    userId: user.id,
    topId,
    bottomId,
  });

  updateTag(CACHE_TAGS.outfits);
}

/**
 * Unfavorites an outfit. Replaces DELETE /api/outfits.
 */
export async function deleteOutfit(id: string): Promise<void> {
  const user = await getCurrentUser();
  const db = getDb();

  // Check if the outfit exists and is owned by the current user
  const outfit = await db.query.outfits.findFirst({
    where: eq(schema.outfits.id, id),
  });

  if (!outfit || outfit.userId !== user.id) {
    throw new Error("Outfit not found.");
  }

  // Delete the outfit
  await db.delete(schema.outfits).where(eq(schema.outfits.id, id));

  updateTag(CACHE_TAGS.outfits);
}

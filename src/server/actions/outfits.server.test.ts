import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import { randomUUID, schema, TEST_USER_ID, type TestDb, test } from "@/test/server";
import { createOutfit, deleteOutfit } from "./outfits";

async function createOutfitFixtures(db: TestDb) {
  const [user] = await db
    .insert(schema.users)
    .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
    .returning();
  const [top] = await db
    .insert(schema.wearables)
    .values({ userId: user.id, category: "t-shirt", imageKey: "top.jpg" })
    .returning();
  const [bottom] = await db
    .insert(schema.wearables)
    .values({ userId: user.id, category: "pants", imageKey: "bottom.jpg" })
    .returning();
  return { user, top, bottom };
}

describe("createOutfit", () => {
  test("creates the outfit and revalidates 'outfits'", async ({ db }) => {
    const { user, top, bottom } = await createOutfitFixtures(db);
    const { updateTag } = await import("next/cache");

    await createOutfit({ topId: top.id, bottomId: bottom.id });
    expect(updateTag).toHaveBeenCalledWith("outfits");

    const outfits = await db.query.outfits.findMany({
      where: eq(schema.outfits.userId, user.id),
    });
    expect(outfits).toHaveLength(1);
  });

  test("rejects a non-existent top", async ({ db }) => {
    const { bottom } = await createOutfitFixtures(db);
    const topId = randomUUID();
    await expect(createOutfit({ topId, bottomId: bottom.id })).rejects.toThrow(
      `Top wearable with ID '${topId}' not found or not owned by user.`,
    );
  });

  test("rejects a non-existent bottom", async ({ db }) => {
    const { top } = await createOutfitFixtures(db);
    const bottomId = randomUUID();
    await expect(createOutfit({ topId: top.id, bottomId })).rejects.toThrow(
      `Bottom wearable with ID '${bottomId}' not found or not owned by user.`,
    );
  });

  test("does not duplicate the exact outfit when it already exists", async ({ db }) => {
    const { user, top, bottom } = await createOutfitFixtures(db);
    await db.insert(schema.outfits).values({
      userId: user.id,
      topId: top.id,
      bottomId: bottom.id,
    });

    await createOutfit({ topId: top.id, bottomId: bottom.id });

    const outfits = await db.query.outfits.findMany({
      where: eq(schema.outfits.userId, user.id),
    });
    expect(outfits).toHaveLength(1);
  });

  test("rejects when top has the wrong body part", async ({ db }) => {
    const { bottom } = await createOutfitFixtures(db);
    await expect(createOutfit({ topId: bottom.id, bottomId: bottom.id })).rejects.toThrow(
      'Top wearable must have "body_part": "top".',
    );
  });

  test("rejects when bottom has the wrong body part", async ({ db }) => {
    const { top } = await createOutfitFixtures(db);
    await expect(createOutfit({ topId: top.id, bottomId: top.id })).rejects.toThrow(
      'Bottom wearable must have "body_part": "bottom".',
    );
  });

  test("rejects when the bottom wearable belongs to another user", async ({ db }) => {
    const { user, top } = await createOutfitFixtures(db);
    const [otherUser] = await db
      .insert(schema.users)
      .values({ auth0UserId: "auth0|2", avatarImageKey: "avatar2.jpg" })
      .returning();
    const [otherBottom] = await db
      .insert(schema.wearables)
      .values({ userId: otherUser.id, category: "pants", imageKey: "bottom2.jpg" })
      .returning();

    await expect(createOutfit({ topId: top.id, bottomId: otherBottom.id })).rejects.toThrow(
      `Bottom wearable with ID '${otherBottom.id}' not found or not owned by user.`,
    );
    const outfits = await db.query.outfits.findMany({
      where: eq(schema.outfits.userId, user.id),
    });
    expect(outfits).toHaveLength(0);
  });
});

async function createDeleteFixtures(db: TestDb) {
  const [user] = await db
    .insert(schema.users)
    .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
    .returning();
  const [top] = await db
    .insert(schema.wearables)
    .values({ userId: user.id, category: "t-shirt", imageKey: "top.jpg" })
    .returning();
  const [bottom] = await db
    .insert(schema.wearables)
    .values({ userId: user.id, category: "pants", imageKey: "bottom.jpg" })
    .returning();
  const [outfit] = await db
    .insert(schema.outfits)
    .values({ userId: user.id, topId: top.id, bottomId: bottom.id })
    .returning();
  return { user, outfit };
}

describe("deleteOutfit", () => {
  test("deletes the outfit and revalidates 'outfits'", async ({ db }) => {
    const { outfit } = await createDeleteFixtures(db);
    const { updateTag } = await import("next/cache");

    await deleteOutfit(outfit.id);
    expect(updateTag).toHaveBeenCalledWith("outfits");
    const existing = await db.query.outfits.findFirst({
      where: eq(schema.outfits.id, outfit.id),
    });
    expect(existing).toBeUndefined();
  });

  test("rejects a non-existent id", async () => {
    await expect(deleteOutfit(randomUUID())).rejects.toThrow("Outfit not found.");
  });

  test("rejects when the outfit belongs to another user", async ({ db }) => {
    const [otherUser] = await db
      .insert(schema.users)
      .values({ auth0UserId: "auth0|2", avatarImageKey: "avatar2.jpg" })
      .returning();
    const [otherTop] = await db
      .insert(schema.wearables)
      .values({ userId: otherUser.id, category: "t-shirt", imageKey: "top2.jpg" })
      .returning();
    const [otherBottom] = await db
      .insert(schema.wearables)
      .values({ userId: otherUser.id, category: "pants", imageKey: "bottom2.jpg" })
      .returning();
    const [outfit] = await db
      .insert(schema.outfits)
      .values({ userId: otherUser.id, topId: otherTop.id, bottomId: otherBottom.id })
      .returning();

    await expect(deleteOutfit(outfit.id)).rejects.toThrow("Outfit not found.");
    const stillExists = await db.query.outfits.findFirst({
      where: eq(schema.outfits.id, outfit.id),
    });
    expect(stillExists).toBeDefined();
  });
});

import { describe, expect, vi } from "vitest";
import { eq, schema, setSessionUser, TEST_USER_ID, test } from "@/test/server";
import { getCurrentUser } from "./auth";
import { getMe, getOutfits, getWearables } from "./queries";

describe("getMe", () => {
  test("returns user info for existing user", async ({ db }) => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        selfieImageKey: "selfie.jpg",
        avatarImageKey: "avatar.jpg",
      })
      .returning();

    const me = await getMe();
    expect(me).toEqual({
      id: user.id,
      has_selfie_image: true,
      has_avatar_image: true,
    });
  });

  test("returns user info without avatar", async ({ db }) => {
    const [user] = await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID }).returning();

    const me = await getMe();
    expect(me).toEqual({
      id: user.id,
      has_selfie_image: false,
      has_avatar_image: false,
    });
  });

  test("auto-creates and persists a new user on first request", async ({ db }) => {
    const newSub = "auth0|new";
    setSessionUser(newSub);

    const me = await getMe();
    expect(me.has_selfie_image).toBe(false);
    expect(me.has_avatar_image).toBe(false);

    const persisted = await db.query.users.findFirst({
      where: eq(schema.users.auth0UserId, newSub),
    });
    expect(persisted).toBeDefined();
    expect(persisted?.id).toBe(me.id);
  });

  test("returns the existing user when another request creates it after the initial lookup", async ({
    db,
  }) => {
    const [existingUser] = await db
      .insert(schema.users)
      .values({ auth0UserId: TEST_USER_ID })
      .returning();

    const { db: prodDb } = await import("./db");
    const findFirstSpy = vi.spyOn(prodDb.query.users, "findFirst");
    findFirstSpy.mockResolvedValueOnce(undefined);

    const me = await getMe();
    expect(me.id).toBe(existingUser.id);

    findFirstSpy.mockRestore();
  });

  test("getCurrentUser redirects when unauthenticated", async () => {
    setSessionUser(null);
    await expect(getCurrentUser()).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });
});

describe("getWearables", () => {
  test("returns only the current user's wearables with signed URLs and pending status when no WOA images exist", async ({
    db,
  }) => {
    const [user] = await db
      .insert(schema.users)
      .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
      .returning();
    const [w1] = await db
      .insert(schema.wearables)
      .values({ userId: user.id, category: "t-shirt", imageKey: "w1.jpg" })
      .returning();
    const [w2] = await db
      .insert(schema.wearables)
      .values({ userId: user.id, category: "pants", imageKey: "w2.jpg" })
      .returning();

    const [otherUser] = await db
      .insert(schema.users)
      .values({ auth0UserId: "auth0|2", avatarImageKey: "avatar2.jpg" })
      .returning();
    await db.insert(schema.wearables).values({
      userId: otherUser.id,
      category: "t-shirt",
      imageKey: "w3.jpg",
    });

    const wearables = await getWearables();
    expect(wearables).toEqual([
      {
        id: w1.id,
        category: "t-shirt",
        body_part: "top",
        wearable_image_url: "https://signed-url/dressme-wearables/w1.jpg",
        generation_status: "pending",
      },
      {
        id: w2.id,
        category: "pants",
        body_part: "bottom",
        wearable_image_url: "https://signed-url/dressme-wearables/w2.jpg",
        generation_status: "pending",
      },
    ]);
  });

  test("reports success for wearables with a WOA image matching the current avatar, and pending for the rest", async ({
    db,
  }) => {
    const [user] = await db
      .insert(schema.users)
      .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
      .returning();
    const [w1] = await db
      .insert(schema.wearables)
      .values({ userId: user.id, category: "t-shirt", imageKey: "w1.jpg" })
      .returning();
    const [w2] = await db
      .insert(schema.wearables)
      .values({ userId: user.id, category: "pants", imageKey: "w2.jpg" })
      .returning();
    await db.insert(schema.wearableOnAvatarImages).values({
      userId: user.id,
      avatarImageKey: "avatar.jpg",
      wearableImageKey: "w1.jpg",
      imageKey: "woa_w1.jpg",
      maskImageKey: "mask_w1.jpg",
    });

    const wearables = await getWearables();
    expect(wearables).toEqual([
      {
        id: w1.id,
        category: "t-shirt",
        body_part: "top",
        wearable_image_url: "https://signed-url/dressme-wearables/w1.jpg",
        generation_status: "success",
      },
      {
        id: w2.id,
        category: "pants",
        body_part: "bottom",
        wearable_image_url: "https://signed-url/dressme-wearables/w2.jpg",
        generation_status: "pending",
      },
    ]);
  });

  test("returns signed URLs and pending status when the user has no avatar", async ({ db }) => {
    const [user] = await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID }).returning();
    const [w1] = await db
      .insert(schema.wearables)
      .values({ userId: user.id, category: "t-shirt", imageKey: "w1.jpg" })
      .returning();
    const [w2] = await db
      .insert(schema.wearables)
      .values({ userId: user.id, category: "pants", imageKey: "w2.jpg" })
      .returning();
    await db.insert(schema.wearableOnAvatarImages).values({
      userId: user.id,
      avatarImageKey: "old-avatar.jpg",
      wearableImageKey: "w1.jpg",
      imageKey: "woa_w1.jpg",
      maskImageKey: "mask_w1.jpg",
    });

    const wearables = await getWearables();
    expect(wearables).toEqual([
      {
        id: w1.id,
        category: "t-shirt",
        body_part: "top",
        wearable_image_url: "https://signed-url/dressme-wearables/w1.jpg",
        generation_status: "pending",
      },
      {
        id: w2.id,
        category: "pants",
        body_part: "bottom",
        wearable_image_url: "https://signed-url/dressme-wearables/w2.jpg",
        generation_status: "pending",
      },
    ]);
  });
});

describe("getOutfits", () => {
  test("returns outfits with generation status", async ({ db }) => {
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
    await db.insert(schema.wearableOnAvatarImages).values({
      userId: user.id,
      avatarImageKey: "avatar.jpg",
      wearableImageKey: "top.jpg",
      imageKey: "woa_top.jpg",
      maskImageKey: "mask_top.jpg",
    });
    const [outfit] = await db
      .insert(schema.outfits)
      .values({ userId: user.id, topId: top.id, bottomId: bottom.id })
      .returning();

    const outfits = await getOutfits();
    expect(outfits).toHaveLength(1);
    expect(outfits[0].id).toBe(outfit.id);
    expect(outfits[0].top.id).toBe(top.id);
    expect(outfits[0].top.category).toBe("t-shirt");
    expect(outfits[0].top.generation_status).toBe("success");
    expect(outfits[0].top.wearable_image_url).toContain("signed-url");
    expect(outfits[0].bottom.id).toBe(bottom.id);
    expect(outfits[0].bottom.category).toBe("pants");
    expect(outfits[0].bottom.generation_status).toBe("pending");
    expect(outfits[0].bottom.wearable_image_url).toContain("signed-url");
  });

  test("returns an empty array when user has no outfits", async ({ db }) => {
    await db
      .insert(schema.users)
      .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
      .returning();

    expect(await getOutfits()).toEqual([]);
  });
});

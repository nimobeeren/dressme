import { NextRequest } from "next/server";
import { describe, expect } from "vitest";
import {
  makeValidJpeg,
  mockBlobStorage,
  randomUUID,
  schema,
  setSessionUser,
  TEST_USER_ID,
  test,
} from "@/test/server";
import { GET } from "./route";

describe("GET", () => {
  test("returns 401 when unauthenticated", async () => {
    setSessionUser(null);
    const req = new NextRequest("http://localhost/api/images/outfit?top_id=x&bottom_id=y");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("returns 400 when a wearable id is not a UUID", async ({ db }) => {
    await db
      .insert(schema.users)
      .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" });

    const req = new NextRequest(
      "http://localhost/api/images/outfit?top_id=not-a-uuid&bottom_id=also-not-a-uuid",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  test("returns 200 with JPEG image", async ({ db }) => {
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
    await db.insert(schema.wearableOnAvatarImages).values([
      {
        userId: user.id,
        avatarImageKey: "avatar.jpg",
        wearableImageKey: "top.jpg",
        imageKey: "woa_top.jpg",
        maskImageKey: "mask_top.jpg",
      },
      {
        userId: user.id,
        avatarImageKey: "avatar.jpg",
        wearableImageKey: "bottom.jpg",
        imageKey: "woa_bottom.jpg",
        maskImageKey: "mask_bottom.jpg",
      },
    ]);

    const image = await makeValidJpeg();
    await mockBlobStorage.upload("dressme-avatars", "avatar.jpg", image, "image/jpeg");
    await mockBlobStorage.upload("dressme-woa", "woa_top.jpg", image, "image/jpeg");
    await mockBlobStorage.upload("dressme-woa", "woa_bottom.jpg", image, "image/jpeg");
    await mockBlobStorage.upload("dressme-woa", "mask_top.jpg", image, "image/jpeg");
    await mockBlobStorage.upload("dressme-woa", "mask_bottom.jpg", image, "image/jpeg");

    const req = new NextRequest(
      `http://localhost/api/images/outfit?top_id=${top.id}&bottom_id=${bottom.id}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
  });

  test("returns 404 when the top wearable is missing", async ({ db }) => {
    const [user] = await db
      .insert(schema.users)
      .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
      .returning();
    const [bottom] = await db
      .insert(schema.wearables)
      .values({ userId: user.id, category: "pants", imageKey: "bottom.jpg" })
      .returning();
    const missingId = randomUUID();

    const req = new NextRequest(
      `http://localhost/api/images/outfit?top_id=${missingId}&bottom_id=${bottom.id}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.detail).toContain(missingId);
  });

  test("returns 404 when the top WOA image is missing", async ({ db }) => {
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
      wearableImageKey: "bottom.jpg",
      imageKey: "woa_bottom.jpg",
      maskImageKey: "mask_bottom.jpg",
    });
    const image = await makeValidJpeg();
    await mockBlobStorage.upload("dressme-woa", "woa_bottom.jpg", image, "image/jpeg");
    await mockBlobStorage.upload("dressme-woa", "mask_bottom.jpg", image, "image/jpeg");

    const req = new NextRequest(
      `http://localhost/api/images/outfit?top_id=${top.id}&bottom_id=${bottom.id}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});

import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import * as schema from "../../src/server/db/schema";
import { setTestDb } from "../../src/server/db";
import { setServices, resetServices } from "../../src/server/services";
import type { JwtPayload } from "../../src/server/auth";
import type { BlobStorage } from "../../src/server/blob-storage";

const TEST_USER_ID = "auth0|1";

// Create a valid JPEG image programmatically
async function makeValidJpeg(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg()
    .toBuffer();
}

// Another valid JPEG for testing multiple items
async function makeValidJpeg2(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

// Mock avatar generation to avoid real API calls
vi.mock("../../src/server/avatar-generation", () => ({
  generateAvatar: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff])),
}));

// Mock WOA generation to avoid real API calls
vi.mock("../../src/server/woa-generation", () => ({
  generateWoaImage: vi.fn().mockResolvedValue(Buffer.from("fake_woa")),
  generateMask: vi.fn().mockResolvedValue(Buffer.from("fake_mask")),
}));

class MockBlobStorage implements BlobStorage {
  private _data = new Map<string, Buffer>();

  async upload(bucket: string, key: string, data: Buffer | Uint8Array, _contentType: string) {
    this._data.set(`${bucket}/${key}`, Buffer.from(data));
  }

  async download(bucket: string, key: string): Promise<Buffer> {
    const d = this._data.get(`${bucket}/${key}`);
    if (!d) throw new Error(`No data for ${bucket}/${key}`);
    return d;
  }

  async getSignedUrl(bucket: string, key: string, _expiresIn?: number) {
    return `https://signed-url/${bucket}/${key}`;
  }
}

async function setupSchema(db: ReturnType<typeof drizzle>) {
  await db.$client.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      auth0_user_id VARCHAR NOT NULL UNIQUE,
      selfie_image_key VARCHAR,
      avatar_image_key VARCHAR
    );
    CREATE TABLE IF NOT EXISTS "wearable" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES "user"(id),
      category VARCHAR NOT NULL,
      image_key VARCHAR NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "wearableonavatarimage" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES "user"(id),
      avatar_image_key VARCHAR NOT NULL,
      wearable_image_key VARCHAR NOT NULL,
      image_key VARCHAR NOT NULL,
      mask_image_key VARCHAR NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "outfit" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES "user"(id),
      top_id UUID NOT NULL REFERENCES "wearable"(id),
      bottom_id UUID NOT NULL REFERENCES "wearable"(id)
    );
  `);
}

let mockBlobStorage: MockBlobStorage;
let db: ReturnType<typeof drizzle<typeof schema>>;
let pendingBgTasks: Promise<unknown>[] = [];

function mockWaitUntil(p: Promise<unknown>) {
  pendingBgTasks.push(p);
}

async function flushBackgroundTasks() {
  await Promise.all(pendingBgTasks);
  pendingBgTasks = [];
}

function makeToken(sub = TEST_USER_ID): JwtPayload {
  return { sub };
}

beforeAll(async () => {
  const pg = new PGlite();
  db = drizzle({ client: pg, schema });
  await setupSchema(db);
  setTestDb(db);

  mockBlobStorage = new MockBlobStorage();

  setServices({
    blobStorage: mockBlobStorage,
    verifyToken: async (_token) => makeToken(),
    waitUntil: mockWaitUntil,
  });
});

afterAll(() => {
  resetServices();
  setTestDb(null as any);
});

beforeEach(async () => {
  // Flush any pending background tasks before truncating tables
  await flushBackgroundTasks();
  pendingBgTasks = [];
  // Truncate all tables between tests (order matters for FK constraints)
  await db.$client.exec("DELETE FROM outfit");
  await db.$client.exec("DELETE FROM wearableonavatarimage");
  await db.$client.exec("DELETE FROM wearable");
  await db.$client.exec('DELETE FROM "user"');
});

afterEach(() => {
  resetServices();
});

// Re-apply services after reset
beforeEach(async () => {
  setServices({
    blobStorage: mockBlobStorage,
    verifyToken: async (_token) => makeToken(),
    waitUntil: mockWaitUntil,
  });
});

describe("GET /api/healthz", () => {
  test("returns 200 ok", async () => {
    const { GET } = await import("../../src/app/api/healthz/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });
});

describe("GET /api/users/me", () => {
  test("returns user info for existing user", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        selfieImageKey: "selfie.jpg",
        avatarImageKey: "avatar.jpg",
      })
      .returning();

    const { GET } = await import("../../src/app/api/users/me/route");
    const req = new NextRequest("http://localhost/api/users/me");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(user.id);
    expect(body.has_selfie_image).toBe(true);
    expect(body.has_avatar_image).toBe(true);
  });

  test("returns user info without avatar", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
      })
      .returning();

    const { GET } = await import("../../src/app/api/users/me/route");
    const req = new NextRequest("http://localhost/api/users/me");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(user.id);
    expect(body.has_selfie_image).toBe(false);
    expect(body.has_avatar_image).toBe(false);
  });
});

describe("PUT /api/images/avatars/me", () => {
  test("returns 202 and creates selfie + triggers avatar generation", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
      })
      .returning();

    const { PUT } = await import("../../src/app/api/images/avatars/me/route");
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([await makeValidJpeg()], { type: "image/webp" }),
      "avatar.webp",
    );
    const req = new NextRequest("http://localhost/api/images/avatars/me", {
      method: "PUT",
      body: formData,
    });

    const res = await PUT(req);
    expect(res.status).toBe(202);

    // Background task should have run
    await flushBackgroundTasks();

    // Check DB state
    const updated = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
    });
    expect(updated?.selfieImageKey).toBeTruthy();
    expect(updated?.selfieImageKey).toMatch(/\.jpg$/);
    expect(updated?.avatarImageKey).toBeTruthy();
  });

  test("returns 400 when user already has selfie", async () => {
    await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        selfieImageKey: "existing.jpg",
      })
      .returning();

    const { PUT } = await import("../../src/app/api/images/avatars/me/route");
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([await makeValidJpeg()], { type: "image/webp" }),
      "avatar.webp",
    );
    const req = new NextRequest("http://localhost/api/images/avatars/me", {
      method: "PUT",
      body: formData,
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  test("returns 422 for invalid image", async () => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    const { PUT } = await import("../../src/app/api/images/avatars/me/route");
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([Buffer.from("not an image")], { type: "text/plain" }),
      "bad.txt",
    );
    const req = new NextRequest("http://localhost/api/images/avatars/me", {
      method: "PUT",
      body: formData,
    });
    const res = await PUT(req);
    expect(res.status).toBe(422);
  });
});

describe("GET /api/wearables", () => {
  test("returns wearables owned by current user", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        avatarImageKey: "avatar.jpg",
      })
      .returning();

    const [w1] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "t-shirt",
        imageKey: "w1.jpg",
      })
      .returning();
    const [w2] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "pants",
        imageKey: "w2.jpg",
      })
      .returning();

    // Create another user's wearable (should not be returned)
    const [otherUser] = await db
      .insert(schema.users)
      .values({
        auth0UserId: "auth0|2",
        avatarImageKey: "avatar2.jpg",
      })
      .returning();
    await db.insert(schema.wearables).values({
      userId: otherUser.id,
      category: "t-shirt",
      imageKey: "w3.jpg",
    });

    const { GET } = await import("../../src/app/api/wearables/route");
    const req = new NextRequest("http://localhost/api/wearables");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe(w1.id);
    expect(body[0].category).toBe("t-shirt");
    expect(body[1].id).toBe(w2.id);
    expect(body[1].category).toBe("pants");
  });
});

describe("POST /api/wearables", () => {
  async function createUserWithAvatar() {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        avatarImageKey: "avatar.jpg",
      })
      .returning();
    mockBlobStorage.upload("dressme-avatars", "avatar.jpg", await makeValidJpeg(), "image/webp");
    return user;
  }

  test("returns 201 and creates wearables", async () => {
    const user = await createUserWithAvatar();

    const { POST } = await import("../../src/app/api/wearables/route");
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([await makeValidJpeg()], { type: "image/webp" }),
      "test1.webp",
    );
    formData.append(
      "image",
      new Blob([await makeValidJpeg2()], { type: "image/webp" }),
      "test2.webp",
    );
    formData.append("category", "t-shirt");
    formData.append("category", "pants");

    const req = new NextRequest("http://localhost/api/wearables", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].category).toBe("t-shirt");
    expect(body[1].category).toBe("pants");

    // Verify DB state
    const wearables = await db.query.wearables.findMany({
      where: eq(schema.wearables.userId, user.id),
    });
    expect(wearables).toHaveLength(2);
  });

  test("returns 422 when category and image counts don't match", async () => {
    await createUserWithAvatar();
    const { POST } = await import("../../src/app/api/wearables/route");
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([await makeValidJpeg()], { type: "image/webp" }),
      "test1.webp",
    );
    formData.append(
      "image",
      new Blob([await makeValidJpeg()], { type: "image/webp" }),
      "test2.webp",
    );
    formData.append("category", "t-shirt");
    const req = new NextRequest("http://localhost/api/wearables", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  test("returns 400 when user has no avatar", async () => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    const { POST } = await import("../../src/app/api/wearables/route");
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([await makeValidJpeg()], { type: "image/webp" }),
      "test.webp",
    );
    formData.append("category", "t-shirt");
    const req = new NextRequest("http://localhost/api/wearables", {
      method: "POST",
      body: formData,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/outfits", () => {
  test("returns outfits with generation status", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        avatarImageKey: "avatar.jpg",
      })
      .returning();

    const [top] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "t-shirt",
        imageKey: "top.jpg",
      })
      .returning();
    const [bottom] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "pants",
        imageKey: "bottom.jpg",
      })
      .returning();

    // WOA image for top (completed)
    await db.insert(schema.wearableOnAvatarImages).values({
      userId: user.id,
      avatarImageKey: "avatar.jpg",
      wearableImageKey: "top.jpg",
      imageKey: "woa_top.jpg",
      maskImageKey: "mask_top.jpg",
    });

    const [outfit] = await db
      .insert(schema.outfits)
      .values({
        userId: user.id,
        topId: top.id,
        bottomId: bottom.id,
      })
      .returning();

    const { GET } = await import("../../src/app/api/outfits/route");
    const req = new NextRequest("http://localhost/api/outfits");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(outfit.id);
    expect(body[0].top.generation_status).toBe("success");
    expect(body[0].bottom.generation_status).toBe("pending");
  });
});

describe("POST /api/outfits", () => {
  async function createOutfitFixtures() {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        avatarImageKey: "avatar.jpg",
      })
      .returning();
    const [top] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "t-shirt",
        imageKey: "top.jpg",
      })
      .returning();
    const [bottom] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "pants",
        imageKey: "bottom.jpg",
      })
      .returning();
    return { user, top, bottom };
  }

  test("returns 201 on successful creation", async () => {
    const { top, bottom } = await createOutfitFixtures();
    const { POST } = await import("../../src/app/api/outfits/route");
    const req = new NextRequest("http://localhost/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top_id: top.id, bottom_id: bottom.id }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  test("returns 404 for non-existent top", async () => {
    const { bottom } = await createOutfitFixtures();
    const { POST } = await import("../../src/app/api/outfits/route");
    const req = new NextRequest("http://localhost/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top_id: randomUUID(), bottom_id: bottom.id }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/outfits", () => {
  test("returns 200 and deletes outfit", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        avatarImageKey: "avatar.jpg",
      })
      .returning();
    const [top] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "t-shirt",
        imageKey: "top.jpg",
      })
      .returning();
    const [bottom] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "pants",
        imageKey: "bottom.jpg",
      })
      .returning();
    const [outfit] = await db
      .insert(schema.outfits)
      .values({
        userId: user.id,
        topId: top.id,
        bottomId: bottom.id,
      })
      .returning();

    const { DELETE } = await import("../../src/app/api/outfits/route");
    const req = new NextRequest(`http://localhost/api/outfits?id=${outfit.id}`, {
      method: "DELETE",
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);

    const existing = await db.query.outfits.findFirst({
      where: eq(schema.outfits.id, outfit.id),
    });
    expect(existing).toBeUndefined();
  });
});

describe("GET /api/images/outfit", () => {
  test("returns 200 with JPEG image", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        avatarImageKey: "avatar.jpg",
      })
      .returning();

    const [top] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "t-shirt",
        imageKey: "top.jpg",
      })
      .returning();
    const [bottom] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "pants",
        imageKey: "bottom.jpg",
      })
      .returning();

    await db.insert(schema.wearableOnAvatarImages).values({
      userId: user.id,
      avatarImageKey: "avatar.jpg",
      wearableImageKey: "top.jpg",
      imageKey: "woa_top.jpg",
      maskImageKey: "mask_top.jpg",
    });
    await db.insert(schema.wearableOnAvatarImages).values({
      userId: user.id,
      avatarImageKey: "avatar.jpg",
      wearableImageKey: "bottom.jpg",
      imageKey: "woa_bottom.jpg",
      maskImageKey: "mask_bottom.jpg",
    });

    // Upload blob data needed by the handler
    mockBlobStorage.upload("dressme-avatars", "avatar.jpg", await makeValidJpeg(), "image/webp");
    mockBlobStorage.upload("dressme-woa", "woa_top.jpg", await makeValidJpeg(), "image/webp");
    mockBlobStorage.upload("dressme-woa", "woa_bottom.jpg", await makeValidJpeg(), "image/webp");
    mockBlobStorage.upload("dressme-woa", "mask_top.jpg", await makeValidJpeg(), "image/webp");
    mockBlobStorage.upload("dressme-woa", "mask_bottom.jpg", await makeValidJpeg(), "image/webp");

    const { GET } = await import("../../src/app/api/images/outfit/route");
    const req = new NextRequest(
      `http://localhost/api/images/outfit?top_id=${top.id}&bottom_id=${bottom.id}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  test("returns 404 for missing top", async () => {
    const [user] = await db
      .insert(schema.users)
      .values({
        auth0UserId: TEST_USER_ID,
        avatarImageKey: "avatar.jpg",
      })
      .returning();
    const [bottom] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category: "pants",
        imageKey: "bottom.jpg",
      })
      .returning();

    const { GET } = await import("../../src/app/api/images/outfit/route");
    const req = new NextRequest(
      `http://localhost/api/images/outfit?top_id=${randomUUID()}&bottom_id=${bottom.id}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});

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
import type { AfterFn } from "../../src/server/services";
import type { JwtPayload } from "../../src/server/auth";
import type { BlobStorage } from "../../src/server/blob-storage";

const TEST_USER_ID = "auth0|1";

// Create a valid JPEG image programmatically
async function makeValidJpeg(width = 10, height = 10): Promise<Buffer<ArrayBuffer>> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg()
    .toBuffer() as Promise<Buffer<ArrayBuffer>>;
}

// Another valid JPEG for testing multiple items
async function makeValidJpeg2(width = 10, height = 10): Promise<Buffer<ArrayBuffer>> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer() as Promise<Buffer<ArrayBuffer>>;
}

// A valid PNG that decodes to more pixels than MAX_IMAGE_PIXELS (50M), which
// sharp's `limitInputPixels` guard rejects. PNG deflates the solid color, so
// the encoded file stays small while the decoded pixel count (64M) is huge.
async function makeDecompressionBomb(): Promise<Buffer<ArrayBuffer>> {
  return sharp({
    create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .png()
    .toBuffer() as Promise<Buffer<ArrayBuffer>>;
}

// Bytes larger than MAX_UPLOAD_SIZE (10 MiB); content does not need to be a
// real image since `readUpload` rejects before `safeOpenImage` ever runs.
function makeOversizedUpload(): Buffer<ArrayBuffer> {
  return Buffer.alloc(10 * 1024 * 1024 + 1, 0);
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

  clear() {
    this._data.clear();
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

const mockAfter: AfterFn = (callback) => {
  pendingBgTasks.push(Promise.resolve(callback()));
};

async function flushBackgroundTasks() {
  await Promise.all(pendingBgTasks);
  pendingBgTasks = [];
}

function makeToken(sub = TEST_USER_ID): JwtPayload {
  return { sub };
}

function applyServiceOverrides() {
  setServices({
    blobStorage: mockBlobStorage,
    verifyToken: async (_token) => makeToken(),
    after: mockAfter,
  });
}

beforeAll(async () => {
  const pg = new PGlite();
  db = drizzle({ client: pg, schema });
  await setupSchema(db);
  setTestDb(db);

  mockBlobStorage = new MockBlobStorage();

  applyServiceOverrides();
});

afterAll(() => {
  resetServices();
  setTestDb(null as any);
});

beforeEach(async () => {
  // Re-apply overrides before flushing so any background tasks scheduled by the
  // previous test (via the mocked `after`) see the mock blob storage
  // instead of constructing a real R2Storage.
  applyServiceOverrides();
  await flushBackgroundTasks();
  pendingBgTasks = [];
  // Reset the in-memory blob store between tests. Upstream uses a per-test
  // MockBlobStorage fixture; here we reuse one instance but clear its data so
  // uploads from one test can't satisfy downloads in another.
  mockBlobStorage.clear();
  // Truncate all tables between tests (order matters for FK constraints)
  await db.$client.exec("DELETE FROM outfit");
  await db.$client.exec("DELETE FROM wearableonavatarimage");
  await db.$client.exec("DELETE FROM wearable");
  await db.$client.exec('DELETE FROM "user"');
});

afterEach(() => {
  resetServices();
});

describe("api", () => {
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

    test("auto-creates and persists a new user on first request", async () => {
      // No user row exists for TEST_USER_ID yet — authenticate as a brand-new
      // auth0 sub so withAuth's getCurrentUserForPayload must create one. Verify
      // the row is committed (visible to a separate query afterwards).
      const newSub = "auth0|new";
      setServices({
        blobStorage: mockBlobStorage,
        verifyToken: async () => ({ sub: newSub }),
        after: mockAfter,
      });

      const { GET } = await import("../../src/app/api/users/me/route");
      const req = new NextRequest("http://localhost/api/users/me");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.has_selfie_image).toBe(false);
      expect(body.has_avatar_image).toBe(false);

      const persisted = await db.query.users.findFirst({
        where: eq(schema.users.auth0UserId, newSub),
      });
      expect(persisted).toBeDefined();
      expect(persisted?.id).toBe(body.id);
    });

    test("recovers from unique constraint violation when two requests race to create the same user", async () => {
      // Simulate a race condition: another request has already inserted a user
      // with the same auth0_user_id, but our findFirst ran before that insert
      // was committed. The subsequent INSERT will fail with 23505, and
      // getCurrentUserForPayload must recover by re-querying.
      const [existingUser] = await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID })
        .returning();

      const findFirstSpy = vi.spyOn(db.query.users, "findFirst");
      findFirstSpy.mockResolvedValueOnce(undefined);

      const { GET } = await import("../../src/app/api/users/me/route");
      const req = new NextRequest("http://localhost/api/users/me");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(existingUser.id);

      findFirstSpy.mockRestore();
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
      expect(updated?.avatarImageKey).toMatch(/\.jpg$/);
      expect(updated?.avatarImageKey).toBeTruthy();

      // The selfie (uploaded) and the generated avatar were both persisted to
      // blob storage as JPEGs, at the keys recorded on the user row.
      const selfieData = await mockBlobStorage.download(
        "dressme-selfies",
        updated!.selfieImageKey!,
      );
      expect(selfieData.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      const avatarData = await mockBlobStorage.download(
        "dressme-avatars",
        updated!.avatarImageKey!,
      );
      expect(avatarData.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
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

    test("returns 422 for a decompression-bomb image", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { PUT } = await import("../../src/app/api/images/avatars/me/route");
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([await makeDecompressionBomb()], { type: "image/png" }),
        "bomb.png",
      );
      const req = new NextRequest("http://localhost/api/images/avatars/me", {
        method: "PUT",
        body: formData,
      });
      const res = await PUT(req);
      expect(res.status).toBe(422);
    });

    test("returns 413 for an oversized upload", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { PUT } = await import("../../src/app/api/images/avatars/me/route");
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([makeOversizedUpload()], { type: "image/jpeg" }),
        "huge.jpg",
      );
      const req = new NextRequest("http://localhost/api/images/avatars/me", {
        method: "PUT",
        body: formData,
      });
      const res = await PUT(req);
      expect(res.status).toBe(413);
    });
  });

  describe("GET /api/wearables", () => {
    test("returns only the current user's wearables with signed URLs and pending status when no WOA images exist", async () => {
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
      expect(body).toEqual([
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

    test("reports success for wearables with a WOA image matching the current avatar, and pending for the rest", async () => {
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

      // WOA image for w1 only — w2 stays pending
      await db.insert(schema.wearableOnAvatarImages).values({
        userId: user.id,
        avatarImageKey: "avatar.jpg",
        wearableImageKey: "w1.jpg",
        imageKey: "woa_w1.jpg",
        maskImageKey: "mask_w1.jpg",
      });

      const { GET } = await import("../../src/app/api/wearables/route");
      const req = new NextRequest("http://localhost/api/wearables");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([
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

    test("returns signed URLs and pending status when the user has no avatar", async () => {
      const [user] = await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID })
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

      // A stale WOA row from a previous avatar must not influence the result
      // when the user currently has no avatar.
      await db.insert(schema.wearableOnAvatarImages).values({
        userId: user.id,
        avatarImageKey: "old-avatar.jpg",
        wearableImageKey: "w1.jpg",
        imageKey: "woa_w1.jpg",
        maskImageKey: "mask_w1.jpg",
      });

      const { GET } = await import("../../src/app/api/wearables/route");
      const req = new NextRequest("http://localhost/api/wearables");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([
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
      expect(body[0].body_part).toBe("top");
      expect(body[1].category).toBe("pants");
      expect(body[1].body_part).toBe("bottom");

      // Both wearables get a signed URL in the response (the GET handler does
      // this via Promise.all; the POST handler must too — the response is JSON,
      // so a raw Promise would serialize to `{}`).
      expect(typeof body[0].wearable_image_url).toBe("string");
      expect(body[0].wearable_image_url).toContain("signed-url");
      expect(typeof body[1].wearable_image_url).toBe("string");
      expect(body[1].generation_status).toBe("pending");

      // Verify DB state
      const wearables = await db.query.wearables.findMany({
        where: eq(schema.wearables.userId, user.id),
      });
      expect(wearables).toHaveLength(2);
      expect(wearables[0].imageKey).toMatch(/\.jpg$/);
      expect(wearables[1].imageKey).toMatch(/\.jpg$/);

      // The uploaded wearables were converted to JPEGs in blob storage.
      const w1Data = await mockBlobStorage.download("dressme-wearables", wearables[0].imageKey);
      expect(w1Data.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

      // WOA generation ran for both wearables (mocked, so it completes
      // synchronously once the scheduled tasks are flushed).
      await flushBackgroundTasks();
      const woaImages = await db.query.wearableOnAvatarImages.findMany({
        where: eq(schema.wearableOnAvatarImages.userId, user.id),
      });
      expect(woaImages).toHaveLength(2);
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

    test("returns 400 when avatar is still generating (selfie but no avatar)", async () => {
      await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID, selfieImageKey: "selfie.jpg" });
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

    test("returns 413 for an oversized upload", async () => {
      await createUserWithAvatar();
      const { POST } = await import("../../src/app/api/wearables/route");
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([makeOversizedUpload()], { type: "image/jpeg" }),
        "huge.jpg",
      );
      formData.append("category", "t-shirt");
      const req = new NextRequest("http://localhost/api/wearables", {
        method: "POST",
        body: formData,
      });
      const res = await POST(req);
      expect(res.status).toBe(413);
    });

    test("returns 422 for a decompression-bomb image", async () => {
      await createUserWithAvatar();
      const { POST } = await import("../../src/app/api/wearables/route");
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([await makeDecompressionBomb()], { type: "image/png" }),
        "bomb.png",
      );
      formData.append("category", "t-shirt");
      const req = new NextRequest("http://localhost/api/wearables", {
        method: "POST",
        body: formData,
      });
      const res = await POST(req);
      expect(res.status).toBe(422);
    });

    test("returns 422 for an invalid image", async () => {
      await createUserWithAvatar();
      const { POST } = await import("../../src/app/api/wearables/route");
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([Buffer.from("this is not an image")], { type: "text/plain" }),
        "not_an_image.txt",
      );
      formData.append("category", "t-shirt");
      const req = new NextRequest("http://localhost/api/wearables", {
        method: "POST",
        body: formData,
      });
      const res = await POST(req);
      expect(res.status).toBe(422);
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
      expect(body[0].top.id).toBe(top.id);
      expect(body[0].top.category).toBe("t-shirt");
      expect(body[0].top.generation_status).toBe("success");
      expect(body[0].top.wearable_image_url).toContain("signed-url");
      expect(body[0].bottom.id).toBe(bottom.id);
      expect(body[0].bottom.category).toBe("pants");
      expect(body[0].bottom.generation_status).toBe("pending");
      expect(body[0].bottom.wearable_image_url).toContain("signed-url");
    });

    test("returns an empty array when user has no outfits", async () => {
      await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
        .returning();

      const { GET } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest("http://localhost/api/outfits");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
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

    test("returns 404 for non-existent bottom", async () => {
      const { top } = await createOutfitFixtures();
      const { POST } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest("http://localhost/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ top_id: top.id, bottom_id: randomUUID() }),
      });
      const res = await POST(req);
      expect(res.status).toBe(404);
    });

    test("returns 200 when the exact outfit already exists", async () => {
      const { user, top, bottom } = await createOutfitFixtures();
      await db.insert(schema.outfits).values({
        userId: user.id,
        topId: top.id,
        bottomId: bottom.id,
      });
      const { POST } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest("http://localhost/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ top_id: top.id, bottom_id: bottom.id }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);

      // Creating the same outfit twice must not duplicate it.
      const outfits = await db.query.outfits.findMany({
        where: eq(schema.outfits.userId, user.id),
      });
      expect(outfits).toHaveLength(1);
    });

    test("returns 400 when top has the wrong body part", async () => {
      const { bottom } = await createOutfitFixtures();
      const { POST } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest("http://localhost/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Use the (pants) bottom as the top — its body_part is "bottom".
        body: JSON.stringify({ top_id: bottom.id, bottom_id: bottom.id }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.detail).toBe('Top wearable must have "body_part": "top".');
    });

    test("returns 400 when bottom has the wrong body part", async () => {
      const { top } = await createOutfitFixtures();
      const { POST } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest("http://localhost/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Use the (t-shirt) top as the bottom — its body_part is "top".
        body: JSON.stringify({ top_id: top.id, bottom_id: top.id }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.detail).toBe('Bottom wearable must have "body_part": "bottom".');
    });

    test("returns 404 when the bottom wearable belongs to another user", async () => {
      const { user, top } = await createOutfitFixtures();
      const [otherUser] = await db
        .insert(schema.users)
        .values({ auth0UserId: "auth0|2", avatarImageKey: "avatar2.jpg" })
        .returning();
      const [otherBottom] = await db
        .insert(schema.wearables)
        .values({
          userId: otherUser.id,
          category: "pants",
          imageKey: "bottom2.jpg",
        })
        .returning();
      const { POST } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest("http://localhost/api/outfits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ top_id: top.id, bottom_id: otherBottom.id }),
      });
      const res = await POST(req);
      expect(res.status).toBe(404);

      // No outfit should be created for the authenticated user.
      const outfits = await db.query.outfits.findMany({
        where: eq(schema.outfits.userId, user.id),
      });
      expect(outfits).toHaveLength(0);
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

    test("returns 404 for a non-existent id", async () => {
      const { DELETE } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest(`http://localhost/api/outfits?id=${randomUUID()}`, {
        method: "DELETE",
      });
      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });

    test("returns 404 when the outfit belongs to another user", async () => {
      // Create an outfit as a different user.
      const [otherUser] = await db
        .insert(schema.users)
        .values({ auth0UserId: "auth0|2", avatarImageKey: "avatar2.jpg" })
        .returning();
      const [otherTop] = await db
        .insert(schema.wearables)
        .values({
          userId: otherUser.id,
          category: "t-shirt",
          imageKey: "top2.jpg",
        })
        .returning();
      const [otherBottom] = await db
        .insert(schema.wearables)
        .values({
          userId: otherUser.id,
          category: "pants",
          imageKey: "bottom2.jpg",
        })
        .returning();
      const [outfit] = await db
        .insert(schema.outfits)
        .values({
          userId: otherUser.id,
          topId: otherTop.id,
          bottomId: otherBottom.id,
        })
        .returning();

      // The authenticated user (auth0|1) must not be able to delete it.
      const { DELETE } = await import("../../src/app/api/outfits/route");
      const req = new NextRequest(`http://localhost/api/outfits?id=${outfit.id}`, {
        method: "DELETE",
      });
      const res = await DELETE(req);
      expect(res.status).toBe(404);

      // The outfit still exists.
      const stillExists = await db.query.outfits.findFirst({
        where: eq(schema.outfits.id, outfit.id),
      });
      expect(stillExists).toBeDefined();
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

      const missingId = randomUUID();
      const { GET } = await import("../../src/app/api/images/outfit/route");
      const req = new NextRequest(
        `http://localhost/api/images/outfit?top_id=${missingId}&bottom_id=${bottom.id}`,
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.detail).toContain(missingId);
    });

    test("returns 404 for missing bottom", async () => {
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

      const missingId = randomUUID();
      const { GET } = await import("../../src/app/api/images/outfit/route");
      const req = new NextRequest(
        `http://localhost/api/images/outfit?top_id=${top.id}&bottom_id=${missingId}`,
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.detail).toContain(missingId);
    });

    test("returns 404 when the top WOA image is missing", async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          auth0UserId: TEST_USER_ID,
          avatarImageKey: "avatar.jpg",
        })
        .returning();

      // Top wearable has no WOA image.
      const [top] = await db
        .insert(schema.wearables)
        .values({
          userId: user.id,
          category: "t-shirt",
          imageKey: "top.jpg",
        })
        .returning();

      // Bottom wearable has a WOA image and the matching blob data.
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
        wearableImageKey: "bottom.jpg",
        imageKey: "woa_bottom.jpg",
        maskImageKey: "mask_bottom.jpg",
      });
      mockBlobStorage.upload("dressme-woa", "woa_bottom.jpg", await makeValidJpeg(), "image/webp");
      mockBlobStorage.upload("dressme-woa", "mask_bottom.jpg", await makeValidJpeg(), "image/webp");

      const { GET } = await import("../../src/app/api/images/outfit/route");
      const req = new NextRequest(
        `http://localhost/api/images/outfit?top_id=${top.id}&bottom_id=${bottom.id}`,
      );
      const res = await GET(req);
      expect(res.status).toBe(404);
    });
  });
});

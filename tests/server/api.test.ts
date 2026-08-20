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
import type { BlobStorage } from "../../src/server/blob-storage";

const TEST_USER_ID = "auth0|1";

// Mock the Auth0 client so the DAL resolves the session from a test-controlled
// value instead of the real session cookie.
const auth0Mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/server/auth0", () => ({
  getAuth0: () => ({ getSession: auth0Mocks.getSession }),
}));

// Server actions call `updateTag` to re-render the current route; outside a
// Next.js request context that throws, so mock it and assert on the calls.
vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
}));

// Mock avatar generation to avoid real API calls
vi.mock("../../src/server/avatar-generation", () => ({
  generateAvatar: vi.fn().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff])),
}));

// Mock WOA generation to avoid real API calls
vi.mock("../../src/server/woa-generation", () => ({
  generateWoaImage: vi.fn().mockResolvedValue(Buffer.from("fake_woa")),
  generateMask: vi.fn().mockResolvedValue(Buffer.from("fake_mask")),
}));

// Mock wearable classification to avoid real API calls
vi.mock("../../src/server/wearable-classification", () => ({
  classifyWearableImage: vi.fn().mockResolvedValue("t-shirt"),
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

function setSessionUser(sub: string | null) {
  auth0Mocks.getSession.mockImplementation(async () => (sub ? { user: { sub } } : null));
}

function applyServiceOverrides() {
  setServices({
    blobStorage: mockBlobStorage,
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
  setSessionUser(TEST_USER_ID);
  vi.mocked(await import("next/cache")).updateTag.mockClear();

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

describe("queries", () => {
  describe("getMe", () => {
    test("returns user info for existing user", async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          auth0UserId: TEST_USER_ID,
          selfieImageKey: "selfie.jpg",
          avatarImageKey: "avatar.jpg",
        })
        .returning();

      const { getMe } = await import("../../src/server/queries");
      const me = await getMe();
      expect(me).toEqual({
        id: user.id,
        has_selfie_image: true,
        has_avatar_image: true,
      });
    });

    test("returns user info without avatar", async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          auth0UserId: TEST_USER_ID,
        })
        .returning();

      const { getMe } = await import("../../src/server/queries");
      const me = await getMe();
      expect(me).toEqual({
        id: user.id,
        has_selfie_image: false,
        has_avatar_image: false,
      });
    });

    test("auto-creates and persists a new user on first request", async () => {
      // No user row exists for TEST_USER_ID yet — authenticate as a brand-new
      // auth0 sub so the DAL must create one. Verify the row is committed
      // (visible to a separate query afterwards).
      const newSub = "auth0|new";
      setSessionUser(newSub);

      const { getMe } = await import("../../src/server/queries");
      const me = await getMe();
      expect(me.has_selfie_image).toBe(false);
      expect(me.has_avatar_image).toBe(false);

      const persisted = await db.query.users.findFirst({
        where: eq(schema.users.auth0UserId, newSub),
      });
      expect(persisted).toBeDefined();
      expect(persisted?.id).toBe(me.id);
    });

    test("recovers from unique constraint violation when two requests race to create the same user", async () => {
      // Simulate a race condition: another request has already inserted a user
      // with the same auth0_user_id, but our findFirst ran before that insert
      // was committed. The subsequent INSERT will fail with 23505, and
      // getCurrentUserForAuth0UserId must recover by re-querying.
      const [existingUser] = await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID })
        .returning();

      const findFirstSpy = vi.spyOn(db.query.users, "findFirst");
      findFirstSpy.mockResolvedValueOnce(undefined);

      const { getMe } = await import("../../src/server/queries");
      const me = await getMe();
      expect(me.id).toBe(existingUser.id);

      findFirstSpy.mockRestore();
    });

    test("getCurrentUser redirects when unauthenticated", async () => {
      setSessionUser(null);
      const { getCurrentUser } = await import("../../src/server/dal");
      await expect(getCurrentUser()).rejects.toMatchObject({
        digest: expect.stringContaining("NEXT_REDIRECT"),
      });
    });
  });

  describe("getWearables", () => {
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

      const { getWearables } = await import("../../src/server/queries");
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

      const { getWearables } = await import("../../src/server/queries");
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

      const { getWearables } = await import("../../src/server/queries");
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

      const { getOutfits } = await import("../../src/server/queries");
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

    test("returns an empty array when user has no outfits", async () => {
      await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
        .returning();

      const { getOutfits } = await import("../../src/server/queries");
      const outfits = await getOutfits();
      expect(outfits).toEqual([]);
    });
  });
});

describe("actions", () => {
  describe("uploadSelfie", () => {
    async function makeSelfieFormData(buffer: Buffer, name: string, type: string) {
      const formData = new FormData();
      formData.append("image", new Blob([new Uint8Array(buffer)], { type }), name);
      return formData;
    }

    test("creates selfie, triggers avatar generation and revalidates 'me'", async () => {
      const [user] = await db
        .insert(schema.users)
        .values({
          auth0UserId: TEST_USER_ID,
        })
        .returning();

      const { uploadSelfie } = await import("@/server/actions/me");
      const { updateTag } = await import("next/cache");

      await uploadSelfie(
        await makeSelfieFormData(await makeValidJpeg(), "avatar.webp", "image/webp"),
      );
      expect(updateTag).toHaveBeenCalledWith("me");

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

    test("rejects when user already has selfie", async () => {
      await db
        .insert(schema.users)
        .values({
          auth0UserId: TEST_USER_ID,
          selfieImageKey: "existing.jpg",
        })
        .returning();

      const { uploadSelfie } = await import("@/server/actions/me");
      await expect(
        uploadSelfie(await makeSelfieFormData(await makeValidJpeg(), "avatar.webp", "image/webp")),
      ).rejects.toThrow("It's currently not possible to replace an existing avatar image.");
    });

    test("rejects invalid image", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { uploadSelfie } = await import("@/server/actions/me");
      await expect(
        uploadSelfie(
          await makeSelfieFormData(Buffer.from("not an image"), "bad.txt", "text/plain"),
        ),
      ).rejects.toThrow("Could not read the uploaded file as an image.");
    });

    test("rejects a decompression-bomb image", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { uploadSelfie } = await import("@/server/actions/me");
      await expect(
        uploadSelfie(
          await makeSelfieFormData(await makeDecompressionBomb(), "bomb.png", "image/png"),
        ),
      ).rejects.toThrow("Could not read the uploaded file as an image.");
    });

    test("rejects an oversized upload", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { uploadSelfie } = await import("@/server/actions/me");
      await expect(
        uploadSelfie(await makeSelfieFormData(makeOversizedUpload(), "huge.jpg", "image/jpeg")),
      ).rejects.toThrow("Upload must be smaller than 10 MB.");
    });

    test("rejects when missing the image file", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { uploadSelfie } = await import("@/server/actions/me");
      await expect(uploadSelfie(new FormData())).rejects.toThrow("Missing image file");
    });
  });

  describe("createWearables", () => {
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

    function makeWearablesFormData(
      entries: Array<{ buffer: Buffer; name: string; type: string; category: string }>,
    ) {
      const formData = new FormData();
      for (const entry of entries) {
        formData.append(
          "image",
          new Blob([new Uint8Array(entry.buffer)], { type: entry.type }),
          entry.name,
        );
        formData.append("category", entry.category);
      }
      return formData;
    }

    test("creates wearables, schedules WOA generation and revalidates 'wearables'", async () => {
      const user = await createUserWithAvatar();

      const { createWearables } = await import("@/server/actions/wearables");
      const { updateTag } = await import("next/cache");

      await createWearables(
        makeWearablesFormData([
          {
            buffer: await makeValidJpeg(),
            name: "test1.webp",
            type: "image/webp",
            category: "t-shirt",
          },
          {
            buffer: await makeValidJpeg2(),
            name: "test2.webp",
            type: "image/webp",
            category: "pants",
          },
        ]),
      );
      expect(updateTag).toHaveBeenCalledWith("wearables");

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

    test("rejects when category and image counts don't match", async () => {
      await createUserWithAvatar();
      const { createWearables } = await import("@/server/actions/wearables");
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
      await expect(createWearables(formData)).rejects.toThrow(
        "The category and image fields should occur the same number of times.",
      );
    });

    test("rejects when user has no avatar", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { createWearables } = await import("@/server/actions/wearables");
      await expect(
        createWearables(
          makeWearablesFormData([
            {
              buffer: await makeValidJpeg(),
              name: "test.webp",
              type: "image/webp",
              category: "t-shirt",
            },
          ]),
        ),
      ).rejects.toThrow("Avatar generation must be completed before adding wearables.");
    });

    test("rejects when avatar is still generating (selfie but no avatar)", async () => {
      await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID, selfieImageKey: "selfie.jpg" });
      const { createWearables } = await import("@/server/actions/wearables");
      await expect(
        createWearables(
          makeWearablesFormData([
            {
              buffer: await makeValidJpeg(),
              name: "test.webp",
              type: "image/webp",
              category: "t-shirt",
            },
          ]),
        ),
      ).rejects.toThrow("Avatar generation must be completed before adding wearables.");
    });

    test("rejects an oversized upload", async () => {
      await createUserWithAvatar();
      const { createWearables } = await import("@/server/actions/wearables");
      await expect(
        createWearables(
          makeWearablesFormData([
            {
              buffer: makeOversizedUpload(),
              name: "huge.jpg",
              type: "image/jpeg",
              category: "t-shirt",
            },
          ]),
        ),
      ).rejects.toThrow("Upload must be smaller than 10 MB.");
    });

    test("rejects a decompression-bomb image", async () => {
      await createUserWithAvatar();
      const { createWearables } = await import("@/server/actions/wearables");
      await expect(
        createWearables(
          makeWearablesFormData([
            {
              buffer: await makeDecompressionBomb(),
              name: "bomb.png",
              type: "image/png",
              category: "t-shirt",
            },
          ]),
        ),
      ).rejects.toThrow("Could not read the uploaded file as an image.");
    });

    test("rejects an invalid image", async () => {
      await createUserWithAvatar();
      const { createWearables } = await import("@/server/actions/wearables");
      await expect(
        createWearables(
          makeWearablesFormData([
            {
              buffer: Buffer.from("this is not an image"),
              name: "not_an_image.txt",
              type: "text/plain",
              category: "t-shirt",
            },
          ]),
        ),
      ).rejects.toThrow("Could not read the uploaded file as an image.");
    });
  });

  describe("classifyWearable", () => {
    function makeClassifyFormData(buffer: Buffer) {
      const formData = new FormData();
      formData.append(
        "image",
        new Blob([new Uint8Array(buffer)], { type: "image/webp" }),
        "test.webp",
      );
      return formData;
    }

    test("returns the classified category", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { classifyWearable } = await import("@/server/actions/wearables");
      const result = await classifyWearable(makeClassifyFormData(await makeValidJpeg()));
      expect(result).toEqual({ category: "t-shirt" });
    });

    test("rethrows with a friendly message when classification fails", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { classifyWearableImage } = await import("../../src/server/wearable-classification");
      vi.mocked(classifyWearableImage).mockRejectedValueOnce(new Error("Gemini is down"));

      const { classifyWearable } = await import("@/server/actions/wearables");
      await expect(classifyWearable(makeClassifyFormData(await makeValidJpeg()))).rejects.toThrow(
        "Wearable classification failed",
      );
    });
  });

  describe("createOutfit", () => {
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

    test("creates the outfit and revalidates 'outfits'", async () => {
      const { user, top, bottom } = await createOutfitFixtures();
      const { createOutfit } = await import("@/server/actions/outfits");
      const { updateTag } = await import("next/cache");

      await createOutfit({ topId: top.id, bottomId: bottom.id });
      expect(updateTag).toHaveBeenCalledWith("outfits");

      const outfits = await db.query.outfits.findMany({
        where: eq(schema.outfits.userId, user.id),
      });
      expect(outfits).toHaveLength(1);
    });

    test("rejects a non-existent top", async () => {
      const { bottom } = await createOutfitFixtures();
      const { createOutfit } = await import("@/server/actions/outfits");
      const topId = randomUUID();
      await expect(createOutfit({ topId, bottomId: bottom.id })).rejects.toThrow(
        `Top wearable with ID '${topId}' not found or not owned by user.`,
      );
    });

    test("rejects a non-existent bottom", async () => {
      const { top } = await createOutfitFixtures();
      const { createOutfit } = await import("@/server/actions/outfits");
      const bottomId = randomUUID();
      await expect(createOutfit({ topId: top.id, bottomId })).rejects.toThrow(
        `Bottom wearable with ID '${bottomId}' not found or not owned by user.`,
      );
    });

    test("does not duplicate the exact outfit when it already exists", async () => {
      const { user, top, bottom } = await createOutfitFixtures();
      await db.insert(schema.outfits).values({
        userId: user.id,
        topId: top.id,
        bottomId: bottom.id,
      });
      const { createOutfit } = await import("@/server/actions/outfits");

      await createOutfit({ topId: top.id, bottomId: bottom.id });

      // Creating the same outfit twice must not duplicate it.
      const outfits = await db.query.outfits.findMany({
        where: eq(schema.outfits.userId, user.id),
      });
      expect(outfits).toHaveLength(1);
    });

    test("rejects when top has the wrong body part", async () => {
      const { bottom } = await createOutfitFixtures();
      const { createOutfit } = await import("@/server/actions/outfits");
      // Use the (pants) bottom as the top — its body_part is "bottom".
      await expect(createOutfit({ topId: bottom.id, bottomId: bottom.id })).rejects.toThrow(
        'Top wearable must have "body_part": "top".',
      );
    });

    test("rejects when bottom has the wrong body part", async () => {
      const { top } = await createOutfitFixtures();
      const { createOutfit } = await import("@/server/actions/outfits");
      // Use the (t-shirt) top as the bottom — its body_part is "top".
      await expect(createOutfit({ topId: top.id, bottomId: top.id })).rejects.toThrow(
        'Bottom wearable must have "body_part": "bottom".',
      );
    });

    test("rejects when the bottom wearable belongs to another user", async () => {
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
      const { createOutfit } = await import("@/server/actions/outfits");

      await expect(createOutfit({ topId: top.id, bottomId: otherBottom.id })).rejects.toThrow(
        `Bottom wearable with ID '${otherBottom.id}' not found or not owned by user.`,
      );

      // No outfit should be created for the authenticated user.
      const outfits = await db.query.outfits.findMany({
        where: eq(schema.outfits.userId, user.id),
      });
      expect(outfits).toHaveLength(0);
    });
  });

  describe("deleteOutfit", () => {
    async function createDeleteFixtures() {
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
      return { user, outfit };
    }

    test("deletes the outfit and revalidates 'outfits'", async () => {
      const { outfit } = await createDeleteFixtures();
      const { deleteOutfit } = await import("@/server/actions/outfits");
      const { updateTag } = await import("next/cache");

      await deleteOutfit(outfit.id);
      expect(updateTag).toHaveBeenCalledWith("outfits");

      const existing = await db.query.outfits.findFirst({
        where: eq(schema.outfits.id, outfit.id),
      });
      expect(existing).toBeUndefined();
    });

    test("rejects a non-existent id", async () => {
      const { deleteOutfit } = await import("@/server/actions/outfits");
      await expect(deleteOutfit(randomUUID())).rejects.toThrow("Outfit not found.");
    });

    test("rejects when the outfit belongs to another user", async () => {
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
      const { deleteOutfit } = await import("@/server/actions/outfits");
      await expect(deleteOutfit(outfit.id)).rejects.toThrow("Outfit not found.");

      // The outfit still exists.
      const stillExists = await db.query.outfits.findFirst({
        where: eq(schema.outfits.id, outfit.id),
      });
      expect(stillExists).toBeDefined();
    });
  });

  describe("refresh actions", () => {
    test("refreshMe re-runs getMe and revalidates 'me'", async () => {
      await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
      const { refreshMe } = await import("@/server/actions/me");
      const { updateTag } = await import("next/cache");

      await refreshMe();
      expect(updateTag).toHaveBeenCalledWith("me");
    });

    test("refreshWearables re-runs getWearables and revalidates 'wearables'", async () => {
      await db
        .insert(schema.users)
        .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" });
      const { refreshWearables } = await import("@/server/actions/wearables");
      const { updateTag } = await import("next/cache");

      await refreshWearables();
      expect(updateTag).toHaveBeenCalledWith("wearables");
    });
  });
});

describe("GET /api/images/outfit", () => {
  test("returns 401 when unauthenticated", async () => {
    setSessionUser(null);
    const { GET } = await import("../../src/app/api/images/outfit/route");
    const req = new NextRequest("http://localhost/api/images/outfit?top_id=x&bottom_id=y");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

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
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
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
// real image since the size check rejects before `safeOpenImage` ever runs.
function makeOversizedUpload(): Buffer<ArrayBuffer> {
  return Buffer.alloc(10 * 1024 * 1024 + 1, 0);
}

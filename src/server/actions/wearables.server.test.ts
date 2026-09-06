import { eq } from "drizzle-orm";
import { describe, expect, vi } from "vitest";
import {
  flushBackgroundTasks,
  makeDecompressionBomb,
  makeOversizedUpload,
  makeValidJpeg,
  makeValidJpeg2,
  mockBlobStorage,
  schema,
  TEST_USER_ID,
  type TestDb,
  test,
} from "@/test/server";
import { classifyWearable, createWearable, refreshWearables } from "./wearables";

async function createUserWithAvatar(db: TestDb) {
  const [user] = await db
    .insert(schema.users)
    .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
    .returning();
  mockBlobStorage.upload("dressme-avatars", "avatar.jpg", await makeValidJpeg(), "image/webp");
  return user;
}

function makeWearableFormData(entry: {
  buffer: Buffer;
  name: string;
  type: string;
  category: string;
}) {
  const formData = new FormData();
  formData.append(
    "image",
    new Blob([new Uint8Array(entry.buffer)], { type: entry.type }),
    entry.name,
  );
  formData.append("category", entry.category);
  return formData;
}

describe("createWearable", () => {
  test("creates wearables, schedules WOA generation and revalidates 'wearables'", async ({
    db,
  }) => {
    const user = await createUserWithAvatar(db);
    const { updateTag } = await import("next/cache");

    await createWearable(
      makeWearableFormData({
        buffer: await makeValidJpeg(),
        name: "test1.webp",
        type: "image/webp",
        category: "t-shirt",
      }),
    );
    await createWearable(
      makeWearableFormData({
        buffer: await makeValidJpeg2(),
        name: "test2.webp",
        type: "image/webp",
        category: "pants",
      }),
    );
    expect(updateTag).toHaveBeenCalledWith("wearables");

    const wearables = await db.query.wearables.findMany({
      where: eq(schema.wearables.userId, user.id),
    });
    expect(wearables).toHaveLength(2);
    expect(wearables[0].imageKey).toMatch(/\.jpg$/);
    expect(wearables[1].imageKey).toMatch(/\.jpg$/);

    const w1Data = await mockBlobStorage.download("dressme-wearables", wearables[0].imageKey);
    expect(w1Data.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    await flushBackgroundTasks();
    const woaImages = await db.query.wearableOnAvatarImages.findMany({
      where: eq(schema.wearableOnAvatarImages.userId, user.id),
    });
    expect(woaImages).toHaveLength(2);
  });

  test("returns an error for invalid categories before persisting anything", async ({ db }) => {
    const user = await createUserWithAvatar(db);

    expect(
      await createWearable(
        makeWearableFormData({
          buffer: await makeValidJpeg(),
          name: "test.webp",
          type: "image/webp",
          category: "not-a-category",
        }),
      ),
    ).toEqual({ error: "Invalid category." });

    await expect(
      db.query.wearables.findMany({ where: eq(schema.wearables.userId, user.id) }),
    ).resolves.toEqual([]);
  });

  test("returns an error when user has no avatar", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    expect(
      await createWearable(
        makeWearableFormData({
          buffer: await makeValidJpeg(),
          name: "test.webp",
          type: "image/webp",
          category: "t-shirt",
        }),
      ),
    ).toEqual({ error: "Avatar generation must be completed before adding wearables." });
  });

  test("returns an error when avatar is still generating (selfie but no avatar)", async ({
    db,
  }) => {
    await db.insert(schema.users).values({
      auth0UserId: TEST_USER_ID,
      selfieImageKey: "selfie.jpg",
    });
    expect(
      await createWearable(
        makeWearableFormData({
          buffer: await makeValidJpeg(),
          name: "test.webp",
          type: "image/webp",
          category: "t-shirt",
        }),
      ),
    ).toEqual({ error: "Avatar generation must be completed before adding wearables." });
  });

  test("returns an error for an oversized upload", async ({ db }) => {
    await createUserWithAvatar(db);
    expect(
      await createWearable(
        makeWearableFormData({
          buffer: makeOversizedUpload(),
          name: "huge.jpg",
          type: "image/jpeg",
          category: "t-shirt",
        }),
      ),
    ).toEqual({ error: "Upload must be smaller than 10 MB." });
  });

  test("returns an error for a decompression-bomb image", async ({ db }) => {
    await createUserWithAvatar(db);
    expect(
      await createWearable(
        makeWearableFormData({
          buffer: await makeDecompressionBomb(),
          name: "bomb.png",
          type: "image/png",
          category: "t-shirt",
        }),
      ),
    ).toEqual({ error: "Could not read the uploaded file as an image." });
  });

  test("returns an error for an invalid image", async ({ db }) => {
    await createUserWithAvatar(db);
    expect(
      await createWearable(
        makeWearableFormData({
          buffer: Buffer.from("this is not an image"),
          name: "not_an_image.txt",
          type: "text/plain",
          category: "t-shirt",
        }),
      ),
    ).toEqual({ error: "Could not read the uploaded file as an image." });
  });
});

function makeClassifyFormData(buffer: Buffer) {
  const formData = new FormData();
  formData.append("image", new Blob([new Uint8Array(buffer)], { type: "image/webp" }), "test.webp");
  return formData;
}

describe("classifyWearable", () => {
  test("returns the classified category", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    await expect(classifyWearable(makeClassifyFormData(await makeValidJpeg()))).resolves.toEqual({
      category: "t-shirt",
    });
  });

  test("returns a friendly error when classification fails", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    const { classifyWearableImage } = await import("../wearable-classification");
    vi.mocked(classifyWearableImage).mockRejectedValueOnce(new Error("Gemini is down"));

    await expect(classifyWearable(makeClassifyFormData(await makeValidJpeg()))).resolves.toEqual({
      category: null,
      error: "Wearable classification failed",
    });
  });

  test("returns an error for an invalid classifier category", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    const { classifyWearableImage } = await import("../wearable-classification");
    vi.mocked(classifyWearableImage).mockResolvedValueOnce("not-a-category" as never);

    await expect(classifyWearable(makeClassifyFormData(await makeValidJpeg()))).resolves.toEqual({
      category: null,
      error: "Wearable classification failed",
    });
  });
});

describe("refreshWearables", () => {
  test("re-runs getWearables and revalidates 'wearables'", async ({ db }) => {
    await db.insert(schema.users).values({
      auth0UserId: TEST_USER_ID,
      avatarImageKey: "avatar.jpg",
    });
    const { updateTag } = await import("next/cache");

    await refreshWearables();
    expect(updateTag).toHaveBeenCalledWith("wearables");
  });
});

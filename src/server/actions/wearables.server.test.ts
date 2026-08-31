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
import { classifyWearable, createWearables, refreshWearables } from "./wearables";

async function createUserWithAvatar(db: TestDb) {
  const [user] = await db
    .insert(schema.users)
    .values({ auth0UserId: TEST_USER_ID, avatarImageKey: "avatar.jpg" })
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

describe("createWearables", () => {
  test("creates wearables, schedules WOA generation and revalidates 'wearables'", async ({
    db,
  }) => {
    const user = await createUserWithAvatar(db);
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

  test("rejects when category and image counts don't match", async ({ db }) => {
    await createUserWithAvatar(db);
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

  test("rejects when user has no avatar", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
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

  test("rejects when avatar is still generating (selfie but no avatar)", async ({ db }) => {
    await db.insert(schema.users).values({
      auth0UserId: TEST_USER_ID,
      selfieImageKey: "selfie.jpg",
    });
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

  test("rejects an oversized upload", async ({ db }) => {
    await createUserWithAvatar(db);
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

  test("rejects a decompression-bomb image", async ({ db }) => {
    await createUserWithAvatar(db);
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

  test("rejects an invalid image", async ({ db }) => {
    await createUserWithAvatar(db);
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

  test("rethrows with a friendly message when classification fails", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    const { classifyWearableImage } = await import("../wearable-classification");
    vi.mocked(classifyWearableImage).mockRejectedValueOnce(new Error("Gemini is down"));

    await expect(classifyWearable(makeClassifyFormData(await makeValidJpeg()))).rejects.toThrow(
      "Wearable classification failed",
    );
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

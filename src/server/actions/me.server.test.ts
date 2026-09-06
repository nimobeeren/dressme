import { eq } from "drizzle-orm";
import { describe, expect } from "vitest";
import {
  flushBackgroundTasks,
  makeDecompressionBomb,
  makeOversizedUpload,
  makeValidJpeg,
  mockBlobStorage,
  schema,
  TEST_USER_ID,
  test,
} from "@/test/server";
import { uploadSelfie, refreshMe } from "./me";

async function makeSelfieFormData(buffer: Buffer, name: string, type: string) {
  const formData = new FormData();
  formData.append("image", new Blob([new Uint8Array(buffer)], { type }), name);
  return formData;
}

describe("uploadSelfie", () => {
  test("creates selfie, triggers avatar generation and revalidates 'me'", async ({ db }) => {
    const [user] = await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID }).returning();
    const { updateTag } = await import("next/cache");

    await uploadSelfie(
      await makeSelfieFormData(await makeValidJpeg(), "avatar.webp", "image/webp"),
    );
    expect(updateTag).toHaveBeenCalledWith("me");
    await flushBackgroundTasks();

    const updated = await db.query.users.findFirst({
      where: eq(schema.users.id, user.id),
    });
    expect(updated?.selfieImageKey).toMatch(/\.jpg$/);
    expect(updated?.avatarImageKey).toMatch(/\.jpg$/);

    const selfieData = await mockBlobStorage.download("dressme-selfies", updated!.selfieImageKey!);
    expect(selfieData.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    const avatarData = await mockBlobStorage.download("dressme-avatars", updated!.avatarImageKey!);
    expect(avatarData.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  });

  test("returns an error when user already has selfie", async ({ db }) => {
    await db.insert(schema.users).values({
      auth0UserId: TEST_USER_ID,
      selfieImageKey: "existing.jpg",
    });

    expect(
      await uploadSelfie(
        await makeSelfieFormData(await makeValidJpeg(), "avatar.webp", "image/webp"),
      ),
    ).toEqual({ error: "It's currently not possible to replace an existing avatar image." });
  });

  test("returns an error for an invalid image", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    expect(
      await uploadSelfie(
        await makeSelfieFormData(Buffer.from("not an image"), "bad.txt", "text/plain"),
      ),
    ).toEqual({ error: "Could not read the uploaded file as an image." });
  });

  test("returns an error for a decompression-bomb image", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    expect(
      await uploadSelfie(
        await makeSelfieFormData(await makeDecompressionBomb(), "bomb.png", "image/png"),
      ),
    ).toEqual({ error: "Could not read the uploaded file as an image." });
  });

  test("returns an error for an oversized upload", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    expect(
      await uploadSelfie(await makeSelfieFormData(makeOversizedUpload(), "huge.jpg", "image/jpeg")),
    ).toEqual({ error: "Upload must be smaller than 10 MB." });
  });

  test("returns an error when missing the image file", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    expect(await uploadSelfie(new FormData())).toEqual({
      error: 'Missing file for field "image".',
    });
  });
});

describe("refreshMe", () => {
  test("re-runs getMe and revalidates 'me'", async ({ db }) => {
    await db.insert(schema.users).values({ auth0UserId: TEST_USER_ID });
    const { updateTag } = await import("next/cache");

    await refreshMe();
    expect(updateTag).toHaveBeenCalledWith("me");
  });
});

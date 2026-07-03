import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/server/route-utils";
import { getBlobStorage, getWaitUntil } from "@/server/services";
import { getSettings } from "@/server/settings";
import { readUpload, safeOpenImage, compressToJpeg } from "@/server/image-utils";
import { getDb, schema } from "@/server/db";
import { getBodyPart, type WearableCategory } from "@/shared/wearable-categories";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  const settings = getSettings();
  const blobStorage = getBlobStorage();
  const db = getDb();

  const userWearables = await db.query.wearables.findMany({
    where: eq(schema.wearables.userId, user.id),
  });

  if (!user.avatarImageKey) {
    return NextResponse.json(
      userWearables.map((w) => ({
        id: w.id,
        category: w.category,
        body_part: getBodyPart(w.category as WearableCategory),
        wearable_image_url: "",
        generation_status: "pending",
      })),
    );
  }

  const woaImages = await db.query.wearableOnAvatarImages.findMany({
    where: eq(schema.wearableOnAvatarImages.userId, user.id),
  });

  const completedKeys = new Set(
    woaImages
      .filter((w) => w.avatarImageKey === user.avatarImageKey)
      .map((w) => w.wearableImageKey),
  );

  const result = await Promise.all(
    userWearables.map(async (w) => ({
      id: w.id,
      category: w.category,
      body_part: getBodyPart(w.category as WearableCategory),
      wearable_image_url: completedKeys.has(w.imageKey)
        ? await blobStorage.getSignedUrl(settings.WEARABLES_BUCKET, w.imageKey)
        : "",
      generation_status: completedKeys.has(w.imageKey) ? "success" : "pending" as const,
    })),
  );

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);

  if (!user.avatarImageKey) {
    return NextResponse.json(
      { detail: "Avatar generation must be completed before adding wearables." },
      { status: 400 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { detail: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const formData = await request.formData();
  const categories = formData.getAll("category") as string[];
  const images = formData.getAll("image") as File[];

  if (categories.length !== images.length) {
    return NextResponse.json(
      { detail: "The category and image fields should occur the same number of times." },
      { status: 422 },
    );
  }

  const settings = getSettings();
  const blobStorage = getBlobStorage();
  const db = getDb();

  const wearables: Array<{ id: string; category: string; imageKey: string }> = [];

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const image = images[i];

    const buffer = Buffer.from(await image.arrayBuffer());

    try {
      await readUpload(buffer);
    } catch (err: any) {
      return NextResponse.json(
        { detail: err.message },
        { status: err.status || 413 },
      );
    }

    let img;
    try {
      img = await safeOpenImage(buffer);
    } catch {
      return NextResponse.json(
        { detail: "Could not read the uploaded file as an image." },
        { status: 422 },
      );
    }

    const jpegData = await compressToJpeg(img);
    const key = `${randomUUID()}.jpg`;
    await blobStorage.upload(settings.WEARABLES_BUCKET, key, jpegData, "image/jpeg");

    const [wearable] = await db
      .insert(schema.wearables)
      .values({
        userId: user.id,
        category,
        imageKey: key,
      })
      .returning();

    if (!wearable) {
      throw new Error("Failed to create wearable");
    }

    wearables.push({ id: wearable.id, category, imageKey: key });
  }

  const waitUntil = getWaitUntil();
  for (const wearable of wearables) {
    waitUntil(
      (async () => {
        const { generateWoaTask } = await import("@/server/background-tasks");
        await generateWoaTask(wearable.id, user.id);
      })(),
    );
  }

  return NextResponse.json(
    wearables.map((w) => ({
      id: w.id,
      category: w.category,
      body_part: getBodyPart(w.category as WearableCategory),
      wearable_image_url: blobStorage.getSignedUrl(
        settings.WEARABLES_BUCKET,
        w.imageKey,
      ),
      generation_status: "pending",
    })),
    { status: 201 },
  );
}

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/server/route-utils";
import { getBlobStorage, getAfter } from "@/server/services";
import { getSettings } from "@/server/settings";
import { parseUpload, safeOpenImage, compressToJpeg } from "@/server/image-utils";
import { getDb, schema } from "@/server/db";
import { getBodyPart } from "@/shared/wearable-categories";

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const settings = getSettings();
    const blobStorage = getBlobStorage();
    const db = getDb();

    const userWearables = await db.query.wearables.findMany({
      where: eq(schema.wearables.userId, user.id),
    });

    const completedKeys = new Set<string>();
    if (user.avatarImageKey) {
      const woaImages = await db.query.wearableOnAvatarImages.findMany({
        where: eq(schema.wearableOnAvatarImages.userId, user.id),
      });
      for (const w of woaImages) {
        if (w.avatarImageKey === user.avatarImageKey) {
          completedKeys.add(w.wearableImageKey);
        }
      }
    }

    const result = await Promise.all(
      userWearables.map(async (w) => ({
        id: w.id,
        category: w.category,
        body_part: getBodyPart(w.category),
        wearable_image_url: await blobStorage.getSignedUrl(settings.WEARABLES_BUCKET, w.imageKey),
        generation_status: completedKeys.has(w.imageKey)
          ? ("success" as const)
          : ("pending" as const),
      })),
    );

    return NextResponse.json(result);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    if (!user.avatarImageKey) {
      return NextResponse.json(
        { detail: "Avatar generation must be completed before adding wearables." },
        { status: 400 },
      );
    }

    let upload;
    try {
      upload = await parseUpload(request);
    } catch (err: any) {
      return NextResponse.json({ detail: err.message }, { status: err.status ?? 500 });
    }

    const categories = upload.fields.get("category") ?? [];
    const images = upload.files.get("image") ?? [];

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

      const buffer = image.data;

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

    // Create WearableOnAvatar (WOA) images
    // Do this after DB commit to ensure the wearables exist
    const after = getAfter();
    for (const wearable of wearables) {
      after(async () => {
        const { generateWoaTask } = await import("@/server/background-tasks");
        await generateWoaTask(wearable.id, user.id);
      });
    }

    const result = await Promise.all(
      wearables.map(async (w) => ({
        id: w.id,
        category: w.category,
        body_part: getBodyPart(w.category),
        wearable_image_url: await blobStorage.getSignedUrl(settings.WEARABLES_BUCKET, w.imageKey),
        generation_status: "pending" as const, // since the generation of the WOA image happens in the background
      })),
    );

    return NextResponse.json(result, { status: 201 });
  });
}

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/server/route-utils";
import { getBlobStorage, getWaitUntil } from "@/server/services";
import { getSettings } from "@/server/settings";
import { parseUpload, safeOpenImage, compressToJpeg } from "@/server/image-utils";
import { getDb, schema } from "@/server/db";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest) {
  return withAuth(request, async (user) => {
    if (user.selfieImageKey !== null) {
      return NextResponse.json(
        { detail: "It's currently not possible to replace an existing avatar image." },
        { status: 400 },
      );
    }

    let upload;
    try {
      upload = await parseUpload(request);
    } catch (err: any) {
      return NextResponse.json(
        { detail: err.message },
        { status: err.status ?? 500 },
      );
    }

    const image = upload.files.get("image")?.[0];
    if (!image) {
      return NextResponse.json(
        { detail: "Missing image file" },
        { status: 400 },
      );
    }

    let img;
    try {
      img = await safeOpenImage(image.data);
    } catch {
      return NextResponse.json(
        { detail: "Could not read the uploaded file as an image." },
        { status: 422 },
      );
    }

    const jpegData = await compressToJpeg(img);
    const settings = getSettings();
    const blobStorage = getBlobStorage();
    const db = getDb();

    const key = `${randomUUID()}.jpg`;
    await blobStorage.upload(settings.SELFIES_BUCKET, key, jpegData, "image/jpeg");

    await db
      .update(schema.users)
      .set({ selfieImageKey: key })
      .where(eq(schema.users.id, user.id));

    const waitUntil = getWaitUntil();
    waitUntil(
      (async () => {
        const { generateAvatarTask } = await import("@/server/background-tasks");
        await generateAvatarTask(user.id);
      })(),
    );

    return new NextResponse(null, { status: 202 });
  });
}

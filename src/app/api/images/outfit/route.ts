import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withCookieAuth } from "@/server/route-utils";
import { getBlobStorage } from "@/server/services";
import { getSettings } from "@/server/settings";
import { getDb, schema } from "@/server/db";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withCookieAuth(async (user) => {
    if (!user.avatarImageKey) {
      return NextResponse.json({ detail: "User has no avatar image." }, { status: 404 });
    }

    const url = new URL(request.url);
    const topId = url.searchParams.get("top_id");
    const bottomId = url.searchParams.get("bottom_id");

    if (!topId || !bottomId) {
      return NextResponse.json({ detail: "Missing top_id or bottom_id" }, { status: 400 });
    }

    const settings = getSettings();
    const blobStorage = getBlobStorage();
    const db = getDb();

    // Get the top and bottom wearables to get their image keys
    const topWearable = await db.query.wearables.findFirst({
      where: eq(schema.wearables.id, topId),
    });

    if (!topWearable || topWearable.userId !== user.id) {
      return NextResponse.json(
        { detail: `Wearable with ID '${topId}' not found.` },
        { status: 404 },
      );
    }

    const bottomWearable = await db.query.wearables.findFirst({
      where: eq(schema.wearables.id, bottomId),
    });

    if (!bottomWearable || bottomWearable.userId !== user.id) {
      return NextResponse.json(
        { detail: `Wearable with ID '${bottomId}' not found.` },
        { status: 404 },
      );
    }

    const woaImages = await db.query.wearableOnAvatarImages.findMany({
      where: eq(schema.wearableOnAvatarImages.userId, user.id),
    });

    // Find WOA images by matching user, avatar, and wearable image keys
    const topOnAvatar = woaImages.find(
      (w) =>
        w.avatarImageKey === user.avatarImageKey && w.wearableImageKey === topWearable.imageKey,
    );

    const bottomOnAvatar = woaImages.find(
      (w) =>
        w.avatarImageKey === user.avatarImageKey && w.wearableImageKey === bottomWearable.imageKey,
    );

    if (!topOnAvatar || !bottomOnAvatar) {
      return NextResponse.json({ detail: "Outfit image not found." }, { status: 404 });
    }

    // Download images from blob storage
    const avatarData = await blobStorage.download(settings.AVATARS_BUCKET, user.avatarImageKey);
    const topData = await blobStorage.download(settings.WOA_BUCKET, topOnAvatar.imageKey);
    const bottomData = await blobStorage.download(settings.WOA_BUCKET, bottomOnAvatar.imageKey);
    const topMaskData = await blobStorage.download(settings.WOA_BUCKET, topOnAvatar.maskImageKey);
    const bottomMaskData = await blobStorage.download(
      settings.WOA_BUCKET,
      bottomOnAvatar.maskImageKey,
    );

    const { combineWearables } = await import("@/server/combining");
    const outfitImage = await combineWearables(
      avatarData,
      topData,
      bottomData,
      topMaskData,
      bottomMaskData,
    );

    return new NextResponse(new Uint8Array(outfitImage), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
}

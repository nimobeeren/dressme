import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { withAuth } from "@/server/route-utils";
import { getBlobStorage } from "@/server/services";
import { getSettings } from "@/server/settings";
import { getDb, schema } from "@/server/db";
import { getBodyPart } from "@/shared/wearable-categories";

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    const settings = getSettings();
    const blobStorage = getBlobStorage();
    const db = getDb();

    const woaImages = await db.query.wearableOnAvatarImages.findMany({
      where: eq(schema.wearableOnAvatarImages.userId, user.id),
    });

    const completedWearableImageKeys = new Set(
      user.avatarImageKey
        ? woaImages
            .filter((w) => w.avatarImageKey === user.avatarImageKey)
            .map((w) => w.wearableImageKey)
        : [],
    );

    const outfits = await db.query.outfits.findMany({
      where: eq(schema.outfits.userId, user.id),
      with: {
        top: true,
        bottom: true,
      },
    });

    const result = await Promise.all(
      outfits.map(async (outfit) => {
        const top = outfit.top!;
        const bottom = outfit.bottom!;

        return {
          id: outfit.id,
          top: {
            id: top.id,
            category: top.category,
            body_part: getBodyPart(top.category),
            wearable_image_url: await blobStorage.getSignedUrl(
              settings.WEARABLES_BUCKET,
              top.imageKey,
            ),
            generation_status: completedWearableImageKeys.has(top.imageKey)
              ? ("success" as const)
              : ("pending" as const),
          },
          bottom: {
            id: bottom.id,
            category: bottom.category,
            body_part: getBodyPart(bottom.category),
            wearable_image_url: await blobStorage.getSignedUrl(
              settings.WEARABLES_BUCKET,
              bottom.imageKey,
            ),
            generation_status: completedWearableImageKeys.has(bottom.imageKey)
              ? ("success" as const)
              : ("pending" as const),
          },
        };
      }),
    );

    return NextResponse.json(result);
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (user) => {
    const db = getDb();

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json(
        { detail: "Expected application/json" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const topId = body.top_id;
    const bottomId = body.bottom_id;

    const top = await db.query.wearables.findFirst({
      where: eq(schema.wearables.id, topId),
    });

    if (!top || top.userId !== user.id) {
      return NextResponse.json(
        { detail: `Top wearable with ID '${topId}' not found or not owned by user.` },
        { status: 404 },
      );
    }
    if (getBodyPart(top.category) !== "top") {
      return NextResponse.json(
        { detail: 'Top wearable must have "body_part": "top".' },
        { status: 400 },
      );
    }

    const bottom = await db.query.wearables.findFirst({
      where: eq(schema.wearables.id, bottomId),
    });

    if (!bottom || bottom.userId !== user.id) {
      return NextResponse.json(
        { detail: `Bottom wearable with ID '${bottomId}' not found or not owned by user.` },
        { status: 404 },
      );
    }
    if (getBodyPart(bottom.category) !== "bottom") {
      return NextResponse.json(
        { detail: 'Bottom wearable must have "body_part": "bottom".' },
        { status: 400 },
      );
    }

    const existing = await db.query.outfits.findFirst({
      where: eq(schema.outfits.userId, user.id),
    });

    if (existing?.topId === topId && existing?.bottomId === bottomId) {
      return new NextResponse(null, { status: 200 });
    }

    await db.insert(schema.outfits).values({
      userId: user.id,
      topId,
      bottomId,
    });

    return new NextResponse(null, { status: 201 });
  });
}

export async function DELETE(request: NextRequest) {
  return withAuth(request, async (user) => {
    const db = getDb();

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { detail: "Missing id parameter" },
        { status: 400 },
      );
    }

    const outfit = await db.query.outfits.findFirst({
      where: eq(schema.outfits.id, id),
    });

    if (!outfit || outfit.userId !== user.id) {
      return NextResponse.json(
        { detail: "Outfit not found." },
        { status: 404 },
      );
    }

    await db.delete(schema.outfits).where(eq(schema.outfits.id, id));

    return new NextResponse(null, { status: 200 });
  });
}

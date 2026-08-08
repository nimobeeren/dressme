import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/route-utils";
import { parseUpload, safeOpenImage, compressToJpeg } from "@/server/image-utils";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withAuth(request, async (_user) => {
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

    try {
      const { classifyWearableImage } = await import("@/server/wearable-classification");
      const category = await classifyWearableImage(jpegData);
      return NextResponse.json({ category });
    } catch (error) {
      console.error("Wearable classification failed:", error);
      return NextResponse.json(
        { detail: "Wearable classification failed" },
        { status: 502 },
      );
    }
  });
}

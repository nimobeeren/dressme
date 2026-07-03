import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/route-utils";
import { readUpload, safeOpenImage, compressToJpeg } from "@/server/image-utils";

export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withAuth(request, async (_user) => {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { detail: "Expected multipart/form-data" },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { detail: "Missing image file" },
        { status: 400 },
      );
    }

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

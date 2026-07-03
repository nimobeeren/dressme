import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/server/route-utils";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  return NextResponse.json({
    id: user.id,
    has_selfie_image: user.selfieImageKey !== null,
    has_avatar_image: user.avatarImageKey !== null,
  });
}

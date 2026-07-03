import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/server/route-utils";

export async function GET(request: NextRequest) {
  return withAuth(request, async (user) => {
    return NextResponse.json({
      id: user.id,
      has_selfie_image: user.selfieImageKey !== null,
      has_avatar_image: user.avatarImageKey !== null,
    });
  });
}

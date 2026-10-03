import { NextResponse } from "next/server";
import { getCurrentUserMaybe, type UserRow } from "./auth";

export type { UserRow } from "./auth";

/** Calls the handler if the user is authenticated (via the session cookie), or returns an error response. */
export async function withCookieAuth(
  handler: (user: UserRow) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const user = await getCurrentUserMaybe();

    if (!user) {
      return NextResponse.json({ detail: "Requires authentication" }, { status: 401 });
    }

    return handler(user);
  } catch (error) {
    console.error("withCookieAuth error:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

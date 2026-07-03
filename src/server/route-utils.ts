import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { UnauthenticatedError } from "./auth";
import { getVerifyToken } from "./services";
import { getDb, schema } from "./db";

export interface UserRow {
  id: string;
  auth0UserId: string;
  selfieImageKey: string | null;
  avatarImageKey: string | null;
}

export async function extractBearerToken(request: NextRequest): Promise<string | undefined> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7);
}

/** Calls the handler if the user is authenticated, or returns an error response. */
export async function withAuth(
  request: NextRequest,
  handler: (user: UserRow) => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    const token = await extractBearerToken(request);

    let payload;
    try {
      payload = await getVerifyToken()(token);
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json({ detail: "Requires authentication" }, { status: 401 });
      }
      return NextResponse.json({ detail: String(error) }, { status: 403 });
    }

    const user = await getCurrentUserForPayload(payload.sub);
    return handler(user);
  } catch (error) {
    console.error("withAuth error:", error);
    return NextResponse.json({ detail: String(error) }, { status: 500 });
  }
}

async function getCurrentUserForPayload(auth0UserId: string): Promise<UserRow> {
  const db = getDb();

  const existing = await db.query.users.findFirst({
    where: eq(schema.users.auth0UserId, auth0UserId),
  });

  if (existing) return existing;

  try {
    const [newUser] = await db.insert(schema.users).values({ auth0UserId }).returning();

    if (!newUser) {
      throw new Error("Failed to create user");
    }

    return {
      id: newUser.id,
      auth0UserId: newUser.auth0UserId,
      selfieImageKey: newUser.selfieImageKey,
      avatarImageKey: newUser.avatarImageKey,
    };
  } catch (error: any) {
    if (error?.code === "23505") {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.auth0UserId, auth0UserId),
      });
      if (!user) throw new Error("User disappeared after race condition");
      return user;
    }
    throw error;
  }
}

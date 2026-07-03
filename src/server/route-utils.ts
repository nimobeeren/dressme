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

export class AuthErrorResponse extends NextResponse {
  constructor(status: number, detail: string) {
    super(JSON.stringify({ detail }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function extractBearerToken(request: NextRequest): Promise<string | undefined> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7);
}

export async function getCurrentUser(request: NextRequest): Promise<UserRow> {
  const token = await extractBearerToken(request);

  let payload;
  try {
    payload = await getVerifyToken()(token);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      throw new AuthErrorResponse(401, "Requires authentication");
    }
    throw new AuthErrorResponse(403, String(error));
  }

  const auth0UserId = payload.sub;

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

import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { getSettings } from "./settings";

let _client: Auth0Client | null = null;

export function getAuth0(): Auth0Client {
  if (!_client) {
    const settings = getSettings();
    _client = new Auth0Client({
      domain: settings.AUTH0_DOMAIN,
      clientId: settings.AUTH0_CLIENT_ID,
      clientSecret: settings.AUTH0_CLIENT_SECRET,
      secret: settings.AUTH0_SECRET,
    });
  }
  return _client;
}

import "server-only";

import { DrizzleQueryError, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "./db";

export interface UserRow {
  id: string;
  auth0UserId: string;
  selfieImageKey: string | null;
  avatarImageKey: string | null;
}

/**
 * The Data Access Layer for authentication. All server code that needs the
 * current user goes through here so the session is read and the DB user is
 * resolved exactly once per request.
 */
export const getCurrentUserMaybe = cache(async (): Promise<UserRow | null> => {
  const session = await getAuth0().getSession();
  const auth0UserId = session?.user?.sub;
  if (!auth0UserId) return null;
  return getCurrentUserForAuth0UserId(auth0UserId);
});

/** Like {@link getCurrentUserMaybe}, but redirects to the login page when unauthenticated. */
export async function getCurrentUser(): Promise<UserRow> {
  const user = await getCurrentUserMaybe();
  if (!user) redirect("/auth/login");
  return user;
}

async function getCurrentUserForAuth0UserId(auth0UserId: string): Promise<UserRow> {
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
  } catch (error: unknown) {
    // Another request could have created the user after the findFirst query but
    // before the insert query. In that case this error 23505 (PG_UNIQUE_VIOLATION)
    // will be thrown. We can safely ignore it and return the existing user.
    if (error instanceof DrizzleQueryError && (error.cause as any)?.code === "23505") {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.auth0UserId, auth0UserId),
      });
      if (!user) throw new Error("User disappeared after race condition");
      return user;
    }
    throw error;
  }
}

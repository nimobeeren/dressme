import "server-only";

import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "./db";
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

  // Another request could have created the user after the findFirst query but
  // before this write. The upsert atomically resolves the race by returning
  // the existing row instead of failing on the unique constraint.
  const [existing2] = await db
    .insert(schema.users)
    .values({ auth0UserId })
    .onConflictDoUpdate({ target: schema.users.auth0UserId, set: { auth0UserId } })
    .returning();

  return existing2;
}

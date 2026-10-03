import "server-only";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "./db";

export interface UserRow {
  id: string;
  clerkUserId: string;
  selfieImageKey: string | null;
  avatarImageKey: string | null;
}

/**
 * The Data Access Layer for authentication. All server code that needs the
 * current user goes through here so the session is read and the DB user is
 * resolved exactly once per request.
 */
export const getCurrentUserMaybe = cache(async (): Promise<UserRow | null> => {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;
  return getCurrentUserForClerkUserId(clerkUserId);
});

/** Like {@link getCurrentUserMaybe}, but redirects to the sign-in page when unauthenticated. */
export async function getCurrentUser(): Promise<UserRow> {
  const user = await getCurrentUserMaybe();
  if (!user) redirect("/sign-in");
  return user;
}

async function getCurrentUserForClerkUserId(clerkUserId: string): Promise<UserRow> {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.clerkUserId, clerkUserId),
  });

  if (existing) return existing;

  // Another request could have created the user after the findFirst query but
  // before this write. The upsert atomically resolves the race by returning
  // the existing row instead of failing on the unique constraint.
  const [existing2] = await db
    .insert(schema.users)
    .values({ clerkUserId })
    .onConflictDoUpdate({ target: schema.users.clerkUserId, set: { clerkUserId } })
    .returning();

  return existing2;
}

import type { NextProxy } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Origins whose session tokens `clerkMiddleware` accepts (the `azp` claim).
 * Only on production to fix redirect loops when using SSH tunnels
 * in development.
 */
const authorizedParties =
  process.env.NODE_ENV === "production"
    ? [
        "https://www.dressme.fashion",
        ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
        ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
      ]
    : undefined;

/**
 * Runs Clerk authentication on every request so `auth()` works in pages,
 * server actions and route handlers. Route protection itself lives in the
 * auth layer (`src/server/auth.ts`): pages redirect to `/sign-in` and API
 * routes respond with 401 via `withCookieAuth`.
 */
export const proxy: NextProxy = clerkMiddleware({ authorizedParties });

export const config = {
  // Match everything except Next.js internals and static assets. Every route
  // that calls auth() must be matched — including /api/images/outfit.
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

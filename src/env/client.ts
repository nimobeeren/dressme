import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Non-secret configuration the browser needs. Safe to import anywhere, including
 * server code. Next.js replaces each `process.env.NEXT_PUBLIC_*` reference below
 * with the build-time value before the bundle reaches the browser.
 */
export const env = createEnv({
  client: {
    /** Publishable key of the Clerk application. The Clerk SDK reads this in the browser. */
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
    /** Maximum accepted image upload size in bytes (default 4 MB, below Vercel's
     * 4.5 MB request-body limit for server actions). */
    NEXT_PUBLIC_MAX_UPLOAD_SIZE: z.coerce.number().default(4 * 1024 * 1024),
  },
  runtimeEnv: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_MAX_UPLOAD_SIZE: process.env.NEXT_PUBLIC_MAX_UPLOAD_SIZE,
  },
  emptyStringAsUndefined: true,
});

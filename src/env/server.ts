import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Secrets and server-only configuration. Validated when the module is first
 * imported (including at build time via `next.config.ts`).
 *
 * Never import this from client components — these variables are not shipped to
 * the browser, and reading one there throws. Use `@/env/client` for anything the
 * browser needs.
 */
export const env = createEnv({
  server: {
    /** Secret key of the Clerk application. */
    CLERK_SECRET_KEY: z.string(),
    /** Clerk User ID of the user who should own the data added during database seeding.
     * You can find this ID in the database. */
    CLERK_SEED_USER_ID: z.string().optional(),

    /** PostgreSQL connection string. */
    DATABASE_URL: z.string(),

    /** Replicate API token.
     * Found in Replicate → Account settings → API tokens. */
    REPLICATE_API_TOKEN: z.string(),
    /** Gemini API key for avatar generation and wearable classification. */
    GEMINI_API_KEY: z.string(),

    /** Access key ID for S3-compatible blob storage API (e.g. R2, MinIO). */
    S3_ACCESS_KEY_ID: z.string(),
    /** Secret access key for S3-compatible blob storage API (e.g. R2, MinIO). */
    S3_SECRET_ACCESS_KEY: z.string(),
    /** Endpoint URL for S3-compatible blob storage API (e.g. R2, MinIO). */
    S3_ENDPOINT_URL: z.string(),

    /** Maximum decoded image size in pixels to prevent decompression bombs (~8000x6000). */
    MAX_IMAGE_PIXELS: z.coerce.number().default(50_000_000),

    /** Bucket name for selfie images. */
    SELFIES_BUCKET: z.string().default("dressme-selfies"),
    /** Bucket name for avatar images. */
    AVATARS_BUCKET: z.string().default("dressme-avatars"),
    /** Bucket name for wearable images. */
    WEARABLES_BUCKET: z.string().default("dressme-wearables"),
    /** Bucket name for WearableOnAvatar images and masks. */
    WOA_BUCKET: z.string().default("dressme-woa"),
  },
  experimental__runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

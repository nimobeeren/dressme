import { z } from "zod";

export const settingsSchema = z.object({
  MODE: z.enum(["development", "production"]).default("production"),

  // Auth0
  /** Custom domain assigned to the Auth0 application. */
  AUTH0_DOMAIN: z.string(),
  /** Client ID of the Auth0 application (must be a Regular Web Application). */
  AUTH0_CLIENT_ID: z.string(),
  /** Client secret of the Auth0 application. */
  AUTH0_CLIENT_SECRET: z.string(),
  /** Secret used to encrypt the session cookie. Generate with `openssl rand -hex 32`. */
  AUTH0_SECRET: z.string(),
  /** Base URL of the app (e.g. http://localhost:3000). Used by the Auth0 SDK for redirects. */
  APP_BASE_URL: z.string(),
  /** Auth0 User ID of the user who should own the data added during database seeding.
   * You can find this ID in the database. */
  AUTH0_SEED_USER_ID: z.string().optional(),

  // Database
  /** PostgreSQL connection string. */
  DATABASE_URL: z.string(),

  // AI Services
  /** Replicate API token.
   * Found in Replicate → Account settings → API tokens. */
  REPLICATE_API_TOKEN: z.string(),
  /** Gemini API key for avatar generation. */
  GEMINI_API_KEY: z.string(),

  // Blob Storage
  /** Access key ID for S3-compatible blob storage API (e.g. R2, MinIO). */
  S3_ACCESS_KEY_ID: z.string(),
  /** Secret access key for S3-compatible blob storage API (e.g. R2, MinIO). */
  S3_SECRET_ACCESS_KEY: z.string(),
  /** Endpoint URL for S3-compatible blob storage API (e.g. R2, MinIO). */
  S3_ENDPOINT_URL: z.string(),

  // Image upload limits
  /** Maximum upload file size in bytes (default 10 MB). */
  MAX_UPLOAD_SIZE: z.coerce.number().default(10 * 1024 * 1024),
  /** Maximum decoded image size in pixels to prevent decompression bombs (~8000x6000). */
  MAX_IMAGE_PIXELS: z.coerce.number().default(50_000_000),

  // Bucket names
  /** Bucket name for selfie images. */
  SELFIES_BUCKET: z.string().default("dressme-selfies"),
  /** Bucket name for avatar images. */
  AVATARS_BUCKET: z.string().default("dressme-avatars"),
  /** Bucket name for wearable images. */
  WEARABLES_BUCKET: z.string().default("dressme-wearables"),
  /** Bucket name for WearableOnAvatar images and masks. */
  WOA_BUCKET: z.string().default("dressme-woa"),
});

export type Settings = z.infer<typeof settingsSchema>;

let _settings: Settings | null = null;

export function getSettings(): Settings {
  if (_settings) return _settings;

  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(settingsSchema.shape)) {
    raw[key] = process.env[key];
  }

  const result = settingsSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid settings: ${result.error.message}`);
  }

  _settings = result.data;
  return _settings;
}

export function setSettings(s: Settings): void {
  _settings = s;
}

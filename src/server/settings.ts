import { z } from "zod";

export const settingsSchema = z.object({
  MODE: z.enum(["development", "production"]).default("production"),

  AUTH0_ALGORITHMS: z.string(),
  AUTH0_API_AUDIENCE: z.string(),
  AUTH0_DOMAIN: z.string(),
  AUTH0_ISSUER: z.string(),
  AUTH0_SEED_USER_ID: z.string().optional(),

  DATABASE_URL: z.string(),

  REPLICATE_API_TOKEN: z.string(),
  GEMINI_API_KEY: z.string(),

  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_ENDPOINT_URL: z.string(),

  MAX_UPLOAD_SIZE: z.coerce.number().default(10 * 1024 * 1024),
  MAX_IMAGE_PIXELS: z.coerce.number().default(50_000_000),

  SELFIES_BUCKET: z.string().default("dressme-selfies"),
  AVATARS_BUCKET: z.string().default("dressme-avatars"),
  WEARABLES_BUCKET: z.string().default("dressme-wearables"),
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

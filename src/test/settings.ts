import { settingsSchema, type Settings } from "@/server/settings";

/** Full settings for tests: required vars are placeholders, everything with a
 * schema default (upload limits, bucket names) is left to settings.ts. */
export const testSettings: Settings = settingsSchema.parse({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
  CLERK_SECRET_KEY: "sk_test_placeholder",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  REPLICATE_API_TOKEN: "placeholder",
  GEMINI_API_KEY: "placeholder",
  S3_ACCESS_KEY_ID: "placeholder",
  S3_SECRET_ACCESS_KEY: "placeholder",
  S3_ENDPOINT_URL: "http://localhost:9100",
});

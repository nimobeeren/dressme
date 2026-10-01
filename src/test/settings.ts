import { settingsSchema, type Settings } from "@/server/settings";

/** Full settings for tests: required vars are placeholders, everything with a
 * schema default (upload limits, bucket names) is left to settings.ts. */
export const testSettings: Settings = settingsSchema.parse({
  AUTH0_DOMAIN: "test.auth0.com",
  AUTH0_CLIENT_ID: "test-client-id",
  AUTH0_CLIENT_SECRET: "test-client-secret",
  AUTH0_SECRET: "a".repeat(64),
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  REPLICATE_API_TOKEN: "placeholder",
  GEMINI_API_KEY: "placeholder",
  S3_ACCESS_KEY_ID: "placeholder",
  S3_SECRET_ACCESS_KEY: "placeholder",
  S3_ENDPOINT_URL: "http://localhost:9100",
});

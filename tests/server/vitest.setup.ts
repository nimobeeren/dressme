import { setSettings } from "../../src/server/settings";

// Provide valid placeholder settings for all server tests
setSettings({
  MODE: "development",
  AUTH0_ALGORITHMS: "RS256",
  AUTH0_API_AUDIENCE: "https://test.local",
  AUTH0_DOMAIN: "test.auth0.com",
  AUTH0_ISSUER: "https://test.auth0.com/",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  REPLICATE_API_TOKEN: "placeholder",
  GEMINI_API_KEY: "placeholder",
  S3_ACCESS_KEY_ID: "placeholder",
  S3_SECRET_ACCESS_KEY: "placeholder",
  S3_ENDPOINT_URL: "http://localhost:9100",
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024, // 10 MB — default, large enough for test images
  MAX_IMAGE_PIXELS: 50_000_000,
  SELFIES_BUCKET: "dressme-selfies",
  AVATARS_BUCKET: "dressme-avatars",
  WEARABLES_BUCKET: "dressme-wearables",
  WOA_BUCKET: "dressme-woa",
});

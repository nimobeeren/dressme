import "dotenv/config";
import { setSettings } from "../../src/server/settings";

const geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey) {
  throw new Error("GEMINI_API_KEY is required for evals. Set it in your .env file or environment.");
}

// Provide all required settings (only GEMINI_API_KEY matters for classification)
setSettings({
  MODE: "development",
  AUTH0_ALGORITHMS: "RS256",
  AUTH0_API_AUDIENCE: "https://test.local",
  AUTH0_DOMAIN: "test.auth0.com",
  AUTH0_ISSUER: "https://test.auth0.com/",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  REPLICATE_API_TOKEN: "placeholder",
  GEMINI_API_KEY: geminiKey,
  S3_ACCESS_KEY_ID: "placeholder",
  S3_SECRET_ACCESS_KEY: "placeholder",
  S3_ENDPOINT_URL: "http://localhost:9100",
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024,
  MAX_IMAGE_PIXELS: 50_000_000,
  SELFIES_BUCKET: "dressme-selfies",
  AVATARS_BUCKET: "dressme-avatars",
  WEARABLES_BUCKET: "dressme-wearables",
  WOA_BUCKET: "dressme-woa",
});

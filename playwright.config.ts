import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

config();

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,

  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "dot" : "html",

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: [
    {
      command: "uv run --directory api fastapi dev src/dressme/main.py",
      url: "http://localhost:8000/healthz",
      reuseExistingServer: !process.env.CI,
      env: {
        MODE: "test",
        DATABASE_URL: `sqlite:///${path.join(projectRoot, "e2e", "test.db")}`,
        // Auth0 config (real, for JWT verification)
        AUTH0_ALGORITHMS: process.env.AUTH0_ALGORITHMS ?? "",
        AUTH0_API_AUDIENCE: process.env.AUTH0_API_AUDIENCE ?? "",
        AUTH0_DOMAIN: process.env.AUTH0_DOMAIN ?? "",
        AUTH0_ISSUER: process.env.AUTH0_ISSUER ?? "",
        // Placeholders for unused services
        REPLICATE_API_TOKEN: "placeholder",
        GEMINI_API_KEY: "placeholder",
        S3_ACCESS_KEY_ID: "placeholder",
        S3_SECRET_ACCESS_KEY: "placeholder",
        S3_ENDPOINT_URL: "http://placeholder",
      },
    },
    {
      command: "pnpm vite --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_BASE_URL: "http://localhost:8000",
        VITE_AUTH0_DOMAIN: process.env.VITE_AUTH0_DOMAIN ?? "",
        VITE_AUTH0_CLIENT_ID: process.env.VITE_AUTH0_CLIENT_ID ?? "",
        VITE_AUTH0_API_AUDIENCE: process.env.VITE_AUTH0_API_AUDIENCE ?? "",
      },
    },
  ],
});

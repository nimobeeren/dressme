import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { lookup } from "mime-types";
import { defineConfig, type Plugin } from "vitest/config";
import { TEST_IMAGE_PREFIX } from "./src/test/constants";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "browser",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.server.test.{ts,tsx}"],
          setupFiles: ["./src/test/setup.tsx"],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: "chromium" }],
          },
        },
        plugins: [react(), testFixtureImages()],
        resolve: {
          alias: {
            "@": path.resolve(__dirname, "./src"),
            "server-only": path.resolve(__dirname, "./src/test/mocks/server-only.ts"),
            "next/link": path.resolve(__dirname, "./src/test/mocks/next-link"),
            "next/navigation": path.resolve(__dirname, "./src/test/mocks/next-navigation"),
          },
        },
      },
      {
        test: {
          name: "server",
          include: ["src/**/*.server.test.ts"],
          environment: "node",
          setupFiles: ["./src/test/server/setup.ts"],
          alias: {
            "@": path.resolve(__dirname, "./src"),
            "server-only": path.resolve(__dirname, "./src/test/mocks/server-only.ts"),
          },
        },
      },
      {
        test: {
          name: "evals",
          include: ["evals/**/*.eval.ts"],
          environment: "node",
          setupFiles: ["./evals/vitest.setup.ts"],
          alias: {
            "@": path.resolve(__dirname, "./src"),
          },
          maxConcurrency: 20,
        },
      },
    ],
  },
});

/**
 * Serves static fixture images from `src/test/fixtures/images/` at URLs under
 * `/test-images/<bucket>/<filename>`. Fixtures reference real files so that
 * `<img>` tags resolve to actual bytes in browser tests.
 */
function testFixtureImages(): Plugin {
  const root = path.resolve(__dirname, "src/test/fixtures/images");
  const bucketToDir: Record<string, string> = {
    "dressme-wearables": path.join(root, "wearables"),
    "dressme-avatars": path.join(root, "avatars"),
    "dressme-selfies": path.join(root, "selfies"),
  };
  return {
    name: "test-fixture-images",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? "";
        if (!url.startsWith(`${TEST_IMAGE_PREFIX}/`)) return next();

        const match = url.match(new RegExp(`^${TEST_IMAGE_PREFIX}/([^/]+)/([^?]+)`));
        if (!match) return next();

        const [, bucket, key] = match;
        const dir = bucketToDir[bucket];
        if (!dir) {
          res.statusCode = 404;
          return res.end();
        }

        const file = path.join(dir, decodeURIComponent(key));
        if (!file.startsWith(dir) || !fs.existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }

        const contentType = lookup(file);
        if (!contentType) {
          res.statusCode = 415;
          return res.end();
        }

        res.setHeader("content-type", contentType);
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { lookup } from "mime-types";
import { defineConfig, type Plugin } from "vitest/config";
import { TEST_IMAGE_PREFIX } from "./src/test/constants";

/**
 * Serves static fixture images from `src/test/fixtures/images/` at URLs under
 * `/test-images/<bucket>/<filename>`. Fixtures reference real files so that
 * `AuthenticatedImage` and `<img>` tags resolve to actual bytes in browser tests.
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

export default defineConfig({
  plugins: [react(), testFixtureImages()],
  // Force same-origin API URLs in tests so MSW can intercept with simple
  // `/wearables`-style paths instead of `/api/wearables`.
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(""),
  },
  optimizeDeps: {
    // Keep React and everything that touches it in a single pre-bundle so we
    // don't end up with multiple copies of React in the test browser.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-hook-form",
      "react-router",
      "@tanstack/react-query",
      "@auth0/auth0-react",
    ],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.tsx"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: "chromium" }],
    },
  },
});

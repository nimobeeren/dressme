import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // Must be the same as the port the API container runs on
    // Related issues:
    // - https://github.com/cloudflare/containers/issues/65
    // - https://github.com/cloudflare/workers-sdk/issues/9793
    // - https://github.com/cloudflare/workers-sdk/issues/10391
    // All are now closed but now we're getting a new error when setting this back to 5173:
    // Error checking if container is ready: The operation was aborted
    // Container error: [Error: Container exited with unexpected exit code: 94216] {
    //   exitCode: 94216
    // }
    // ...repeating with different error codes each time
    port: 8000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

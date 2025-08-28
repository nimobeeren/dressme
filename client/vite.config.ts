import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    // Must be the same as the port the API container runs on
    // Should be fixed after: https://github.com/cloudflare/containers/issues/65
    // See also: https://github.com/cloudflare/workers-sdk/issues/9793
    // See also: https://github.com/cloudflare/workers-sdk/issues/10391
    port: 8000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

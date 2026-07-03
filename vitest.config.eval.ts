import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "eval",
    include: ["tests/eval/**/*.eval.test.ts"],
    environment: "node",
    setupFiles: ["./tests/eval/vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

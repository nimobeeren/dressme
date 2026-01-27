import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch",
  input: "http://localhost:8000/openapi.json",
  output: "src/api",
  experimentalParser: true,
  plugins: [{ name: "@hey-api/sdk", throwOnError: true }, "@hey-api/typescript"],
});

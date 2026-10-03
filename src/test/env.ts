/**
 * Placeholder values for the variables `src/env/server.ts` and `src/env/client.ts`
 * require. Tests never call the real backing services (the database is PGlite,
 * blob storage is in-memory, AI calls are mocked), so these only need to satisfy
 * validation. Variables with schema defaults (upload limits, bucket names) are
 * left unset.
 *
 * `GEMINI_API_KEY` is deliberately missing. The server project adds its own
 * placeholder in `vitest.config.ts` (AI calls are mocked there), while evals
 * need the real key from `.env` (see `evals/vitest.setup.ts`).
 */
export const testEnv = {
  CLERK_SECRET_KEY: "sk_test_placeholder",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
  DATABASE_URL: "postgres://test:test@localhost:5432/test",
  REPLICATE_API_TOKEN: "placeholder",
  S3_ACCESS_KEY_ID: "placeholder",
  S3_SECRET_ACCESS_KEY: "placeholder",
  S3_ENDPOINT_URL: "http://localhost:9100",
} as const;

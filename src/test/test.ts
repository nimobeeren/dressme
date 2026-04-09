import { test as testBase } from "vitest";
import { worker } from "./worker";

/**
 * Vitest test extended with an MSW worker fixture. The worker is started once
 * per file in `setup.tsx`; this fixture just exposes it to tests so they can
 * call `worker.use(...)` to add per-test handlers. Handlers are reset in
 * `setup.tsx`'s afterEach.
 */
export const test = testBase.extend<{ worker: typeof worker }>({
  // eslint-disable-next-line no-empty-pattern
  worker: async ({}, provide) => {
    await provide(worker);
  },
});

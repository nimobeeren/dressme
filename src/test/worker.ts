import { setupWorker } from "msw/browser";

/**
 * No handlers are registered: fixture images are served directly by the
 * `testFixtureImages` plugin in `vitest.config.ts`. The worker is started
 * anyway so the `onUnhandledRequest` guard in `test-extend.ts` can fail tests
 * that make unexpected requests.
 */
export const worker = setupWorker();

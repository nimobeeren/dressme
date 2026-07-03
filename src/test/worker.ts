import { setupWorker, type StartOptions } from "msw/browser";
import { defaultHandlers } from "./handlers";

export const worker = setupWorker(...defaultHandlers);

let startPromise: Promise<unknown> | null = null;

/**
 * Starts the MSW worker exactly once across the entire test run. Subsequent
 * calls return the same promise.
 *
 * vitest-browser-react cleans up the previous render BEFORE the next test,
 * which means the last test in a file keeps its component mounted until the
 * next file runs. If we stop the worker in `afterAll`, that component's
 * background fetches (e.g. from mutation invalidations) leak to Vite's dev
 * server between files, returning HTML that React Query then caches as bogus
 * query data. Keeping the worker alive for the whole run avoids this race.
 */
export function ensureWorkerStarted(options: StartOptions): Promise<unknown> {
  if (!startPromise) {
    startPromise = worker.start(options);
  }
  return startPromise;
}

import { afterEach, beforeAll } from "vitest";
import { actionSpies } from "./actions-mock";
import { ensureWorkerStarted, worker } from "./worker";
import { mockRouter, resetPathname } from "./mocks/next-navigation";

afterEach(() => {
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.back.mockClear();
  mockRouter.forward.mockClear();
  mockRouter.refresh.mockClear();
  mockRouter.prefetch.mockClear();
  resetPathname();
  Object.values(actionSpies).forEach((spy) => spy.mockClear());
});

// Start MSW once for the whole test run (idempotent across files).
beforeAll(async () => {
  await ensureWorkerStarted({
    onUnhandledRequest: (req, print) => {
      const url = new URL(req.url);
      if (
        url.pathname.startsWith("/@") ||
        url.pathname.startsWith("/node_modules/") ||
        url.pathname.startsWith("/src/") ||
        url.pathname.startsWith("/test-images/") ||
        url.pathname === "/mockServiceWorker.js" ||
        url.pathname.startsWith("/__vitest") ||
        url.pathname === "/"
      ) {
        return;
      }
      print.warning();
      throw new Error(`Unhandled ${req.method} ${url.pathname}${url.search} in test`);
    },
    quiet: true,
  });
});

afterEach(() => {
  worker.resetHandlers();
});

import { test as testBase } from "vitest";
import { worker } from "./worker";

export const test = testBase.extend<{ worker: typeof worker }>({
  worker: [
    // eslint-disable-next-line no-empty-pattern -- the fixture does not need other context values
    async ({}, use) => {
      await worker.start({
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

      await use(worker);
      worker.resetHandlers();
    },
    { auto: true },
  ],
});

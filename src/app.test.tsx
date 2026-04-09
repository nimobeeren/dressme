import { ApiWarmupGate } from "@/app";
import { http, HttpResponse, delay } from "msw";
import { expect } from "vitest";
import { test } from "@/test/test";
import { renderWithProviders } from "@/test/utils";

test("shows warmup alert while /healthz is pending", async ({ worker }) => {
  worker.use(
    http.get("*/healthz", async () => {
      // Delay past the test's visibility assertion window — the request will
      // still be "pending" from React Query's perspective.
      await delay("infinite");
      return HttpResponse.json({ status: "ok" });
    }),
  );
  const screen = await renderWithProviders(
    <ApiWarmupGate>
      <div>app body</div>
    </ApiWarmupGate>,
  );
  await expect.element(screen.getByText(/we're getting ready/i)).toBeVisible();
  // Children should be hidden while pending.
  await expect.element(screen.getByText(/app body/i)).not.toBeInTheDocument();
});

test("shows warmup alert when /healthz errors", async ({ worker }) => {
  worker.use(http.get("*/healthz", () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
  const screen = await renderWithProviders(
    <ApiWarmupGate>
      <div>app body</div>
    </ApiWarmupGate>,
  );
  await expect.element(screen.getByText(/we're getting ready/i)).toBeVisible();
  await expect.element(screen.getByText(/app body/i)).not.toBeInTheDocument();
});

test("renders children once /healthz succeeds", async ({ worker }) => {
  worker.use(http.get("*/healthz", () => HttpResponse.json({ status: "ok" })));
  const screen = await renderWithProviders(
    <ApiWarmupGate>
      <div>app body</div>
    </ApiWarmupGate>,
  );
  await expect.element(screen.getByText(/app body/i)).toBeVisible();
});

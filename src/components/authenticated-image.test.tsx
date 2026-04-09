import { AuthenticatedImage } from "@/components/authenticated-image";
import { http, HttpResponse } from "msw";
import { expect, vi } from "vitest";
import { test } from "@/test/test";
import { renderWithProviders } from "@/test/utils";

// Tiny valid PNG (1x1 transparent)
const TINY_PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

test("fetches with Authorization header and renders a blob: URL", async ({ worker }) => {
  let receivedAuthHeader: string | null = null;
  worker.use(
    http.get("*/images/secret", ({ request }) => {
      receivedAuthHeader = request.headers.get("authorization");
      return HttpResponse.arrayBuffer(TINY_PNG_BYTES.buffer as ArrayBuffer, {
        headers: { "Content-Type": "image/png" },
      });
    }),
  );

  const screen = await renderWithProviders(
    <AuthenticatedImage src="/images/secret" alt="secret" />,
  );

  const img = screen.getByRole("img", { name: "secret" });
  await expect.element(img).toBeVisible();

  // Poll the `src` attribute since the effect sets it asynchronously after
  // the fetch resolves.
  await expect.poll(() => img.element().getAttribute("src")).toMatch(/^blob:/);

  expect(receivedAuthHeader).toBe("Bearer test-access-token");
});

test("logs an error when the fetch fails and does not set a blob URL", async ({ worker }) => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  worker.use(http.get("*/images/broken", () => HttpResponse.text("boom", { status: 500 })));

  const screen = await renderWithProviders(
    <AuthenticatedImage src="/images/broken" alt="broken" />,
  );
  const img = screen.getByRole("img", { name: "broken" });
  await expect.element(img).toBeVisible();

  // Give the fetch a chance to fail and the error to surface.
  await expect.poll(() => errorSpy.mock.calls.length).toBeGreaterThan(0);
  expect(img.element().getAttribute("src")).toBeFalsy();

  errorSpy.mockRestore();
});

test("revokes the blob URL on unmount", async ({ worker }) => {
  worker.use(
    http.get("*/images/revokeme", () =>
      HttpResponse.arrayBuffer(TINY_PNG_BYTES.buffer as ArrayBuffer, {
        headers: { "Content-Type": "image/png" },
      }),
    ),
  );

  const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

  const screen = await renderWithProviders(
    <AuthenticatedImage src="/images/revokeme" alt="revokeme" />,
  );
  const img = screen.getByRole("img", { name: "revokeme" });
  await expect.poll(() => img.element().getAttribute("src")).toMatch(/^blob:/);

  const blobUrl = img.element().getAttribute("src")!;
  screen.unmount();

  expect(revokeSpy).toHaveBeenCalledWith(blobUrl);
  revokeSpy.mockRestore();
});

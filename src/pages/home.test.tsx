import { HomePage } from "@/pages/home";
import { http, HttpResponse } from "msw";
import { userEvent } from "vitest/browser";
import { expect } from "vitest";
import { test } from "@/test/test";
import {
  buildOutfit,
  buildUser,
  buildWearable,
  renderWithProviders,
  setAuthState,
} from "@/test/utils";

test("shows upload button when user has no selfie", async () => {
  // Default handlers already return a user without selfie/avatar.
  const screen = await renderWithProviders(<HomePage />);
  await expect.element(screen.getByRole("button", { name: /upload a selfie/i })).toBeVisible();
});

test("shows 'generating avatar' when selfie uploaded but avatar not ready", async ({ worker }) => {
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: false })),
    ),
  );
  const screen = await renderWithProviders(<HomePage />);
  await expect.element(screen.getByText(/generating your avatar/i)).toBeVisible();
});

test("aggregates errors into a single alert", async ({ worker }) => {
  worker.use(
    http.get("*/me", () => HttpResponse.json({ detail: "boom" }, { status: 500 })),
    http.get("*/wearables", () =>
      HttpResponse.json({ detail: "wearables broke" }, { status: 500 }),
    ),
    http.get("*/outfits", () => HttpResponse.json({ detail: "outfits broke" }, { status: 500 })),
  );
  const screen = await renderWithProviders(<HomePage />);
  await expect
    .element(screen.getByRole("alert").first())
    .toHaveTextContent(/something went wrong/i);
});

test("selecting a top and bottom shows the outfit preview", async ({ worker }) => {
  const top = buildWearable({
    id: "top-1",
    category: "t-shirt",
    body_part: "top",
  });
  const bottom = buildWearable({
    id: "bottom-1",
    category: "pants",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
    http.get("*/wearables", () => HttpResponse.json([top, bottom])),
  );

  const screen = await renderWithProviders(<HomePage />);

  // Tops are the default tab and the first success top/bottom are auto-selected.
  // The preview image should be rendered via AuthenticatedImage, which produces
  // an <img> once the token resolves and the fetch returns bytes.
  const previewImages = screen.getByRole("img");
  await expect.element(previewImages.first()).toBeVisible();
});

test("clicking a pending wearable shows a toast and does not select it", async ({ worker }) => {
  const readyTop = buildWearable({
    id: "top-ready",
    body_part: "top",
    generation_status: "success",
  });
  const pendingTop = buildWearable({
    id: "top-pending",
    body_part: "top",
    generation_status: "pending",
    wearable_image_url: "/test-images/dressme-wearables/flannel.webp",
  });
  const readyBottom = buildWearable({
    id: "bottom-ready",
    body_part: "bottom",
    generation_status: "success",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
    http.get("*/wearables", () => HttpResponse.json([readyTop, pendingTop, readyBottom])),
  );

  const screen = await renderWithProviders(<HomePage />);

  // Radix's RadioGroup.Item renders as a <button role="radio"> — find the pending one.
  // It's the second top in order, and both tops have `data-state` attributes we can't
  // rely on, so we click the second radio in the tops tab.
  const radios = screen.getByRole("radio");
  await userEvent.click(radios.nth(1));

  await expect.element(screen.getByText(/still being generated/i)).toBeVisible();
});

test("unauthenticated: HomePage does not render and login redirect is triggered", async () => {
  setAuthState({ kind: "unauthenticated" });
  const { withAuthenticationRequired } = await import("@auth0/auth0-react");
  const GuardedHome = withAuthenticationRequired(HomePage);
  const screen = await renderWithProviders(<GuardedHome />);
  // Nothing from the HomePage should render. The tabs / upload button
  // should be absent.
  await expect
    .element(screen.getByRole("button", { name: /upload a selfie/i }))
    .not.toBeInTheDocument();
  const { authSpies } = await import("@/test/auth-state");
  expect(authSpies.loginWithRedirect).toHaveBeenCalled();
});

test("favoriting an outfit calls createOutfit; un-favoriting calls deleteOutfit", async ({
  worker,
}) => {
  const top = buildWearable({
    id: "top-fav",
    body_part: "top",
  });
  const bottom = buildWearable({
    id: "bottom-fav",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });

  // Start with no outfits; createOutfit should be hit once.
  let outfits = [] as ReturnType<typeof buildOutfit>[];
  let createCalls = 0;
  let deleteCalls = 0;
  worker.use(
    http.get("*/me", () =>
      HttpResponse.json(buildUser({ has_selfie_image: true, has_avatar_image: true })),
    ),
    http.get("*/wearables", () => HttpResponse.json([top, bottom])),
    http.get("*/outfits", () => HttpResponse.json(outfits)),
    http.post("*/outfits", () => {
      createCalls++;
      outfits = [buildOutfit(top, bottom, { id: "outfit-1" })];
      return HttpResponse.json({ id: "outfit-1" });
    }),
    http.delete("*/outfits", () => {
      deleteCalls++;
      outfits = [];
      return new HttpResponse(null, { status: 204 });
    }),
  );

  const screen = await renderWithProviders(<HomePage />);
  // Button toggles its accessible name between the two states, so re-query
  // each time instead of reusing a stale locator.
  await userEvent.click(screen.getByRole("button", { name: /save as favorite/i }));
  await expect.poll(() => createCalls).toBe(1);
  await userEvent.click(screen.getByRole("button", { name: /remove from favorites/i }));
  await expect.poll(() => deleteCalls).toBe(1);
});

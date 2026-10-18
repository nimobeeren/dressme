import { OutfitTransition } from "@/components/outfit";
import { buildWearable, fixtureImageUrl, renderWithProviders } from "@/test/utils";
import { Component, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { http, passthrough } from "msw";
import { expect } from "vitest";
import { test } from "@/test/test-extend";

// Unique per call so images always hit the network and can be held instead of the browser cache.
let cacheBuster = 0;
const uncachedWoaUrl = (file: string) =>
  `${fixtureImageUrl("dressme-woa", file)}?bust=${++cacheBuster}`;

const avatarUrl = fixtureImageUrl("dressme-avatars", "avatar.jpg");

/** Shows the error message of whatever is thrown below it, in place of the children. */
class ErrorMessage extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <p role="alert">{this.state.error.message}</p> : this.props.children;
  }
}

/** The layer that draws the wearable's wear-on-avatar image, if it is mounted. */
function woaLayerOf(container: HTMLElement, wearable: ReturnType<typeof buildWearable>) {
  return container.querySelector<SVGImageElement>(`svg image[href="${wearable.woa_image_url}"]`);
}

/** The mask image that cuts the given layer out, found through the layer's `mask` reference. */
function maskImageOf(layer: Element) {
  const id = layer.getAttribute("mask")!.match(/^url\(#(.+)\)$/)![1];
  return document.getElementById(id)!.querySelector("image")!;
}

test("holds a loading placeholder until every layer has loaded, then reveals the outfit", async ({
  worker,
}) => {
  let releaseImages!: () => void;
  const imagesHeld = new Promise<void>((resolve) => {
    releaseImages = resolve;
  });
  worker.use(
    http.get(/\/test-images\/dressme-woa\//, async () => {
      await imagesHeld;
      return passthrough();
    }),
  );

  const top = buildWearable({
    id: "top-1",
    body_part: "top",
    woa_image_url: uncachedWoaUrl("graphic-tee.webp"),
    woa_mask_url: uncachedWoaUrl("jeans.webp"),
  });
  const bottom = buildWearable({
    id: "bottom-1",
    body_part: "bottom",
    woa_image_url: uncachedWoaUrl("blue-pants.webp"),
    woa_mask_url: uncachedWoaUrl("flannel.webp"),
  });
  const screen = await renderWithProviders(
    <OutfitTransition avatarUrl={avatarUrl} wearables={[top, bottom]} />,
  );

  // The layers mount right away but stay hidden behind the placeholder until every image has settled.
  const avatarLayer = screen.container.querySelector<HTMLImageElement>(`img[src="${avatarUrl}"]`)!;
  await expect.element(screen.getByRole("status", { name: "Loading preview" })).toBeInTheDocument();
  await expect.element(avatarLayer).not.toBeVisible();

  releaseImages();

  await expect
    .element(screen.getByRole("status", { name: "Loading preview" }))
    .not.toBeInTheDocument();
  await expect.element(avatarLayer).toBeVisible();
  for (const wearable of [top, bottom]) {
    const layer = woaLayerOf(screen.container, wearable)!;
    expect(maskImageOf(layer).getAttribute("href")).toBe(wearable.woa_mask_url);
    await expect.element(layer).toBeVisible();
  }
});

test("reveals the outfit when its images finished loading before hydration", async () => {
  const top = buildWearable({
    id: "top-1",
    body_part: "top",
    woa_image_url: uncachedWoaUrl("graphic-tee.webp"),
    woa_mask_url: uncachedWoaUrl("jeans.webp"),
  });
  const bottom = buildWearable({
    id: "bottom-1",
    body_part: "bottom",
    woa_image_url: uncachedWoaUrl("blue-pants.webp"),
    woa_mask_url: uncachedWoaUrl("flannel.webp"),
  });
  const props = { avatarUrl, wearables: [top, bottom] };
  const imageUrls = [
    avatarUrl,
    top.woa_image_url,
    top.woa_mask_url,
    bottom.woa_image_url,
    bottom.woa_mask_url,
  ] as string[];

  const container = document.createElement("div");
  try {
    // Load the images into the browser cache first, so the markup below has them ready.
    await Promise.all(
      imageUrls.map(
        (url) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = resolve;
            image.onerror = reject;
            image.src = url;
          }),
      ),
    );

    // Their load events fire while the server-rendered page waits to be hydrated. React only
    // listens for them once hydration attaches its handlers, so those events are missed.
    container.innerHTML = renderToStaticMarkup(<OutfitTransition {...props} />);
    document.body.appendChild(container);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const root = hydrateRoot(container, <OutfitTransition {...props} />);
    try {
      await expect
        .poll(() => container.querySelector('[aria-label="Loading preview"]'), { timeout: 5000 })
        .toBeNull();
      await expect
        .element(container.querySelector<HTMLImageElement>(`img[src="${avatarUrl}"]`)!)
        .toBeVisible();
      await expect.element(woaLayerOf(container, top)!).toBeVisible();
    } finally {
      root.unmount();
    }
  } finally {
    container.remove();
  }
});

test("a failed layer image throws to the error boundary instead of showing the avatar without it", async () => {
  const top = buildWearable({
    id: "top-broken",
    body_part: "top",
    // No fixture by this name, so the layer's image fails to load.
    woa_image_url: fixtureImageUrl("dressme-woa", "missing.webp"),
  });
  const bottom = buildWearable({ id: "bottom-1", body_part: "bottom" });
  const screen = await renderWithProviders(
    <ErrorMessage>
      <OutfitTransition avatarUrl={avatarUrl} wearables={[top, bottom]} />
    </ErrorMessage>,
  );

  await expect.element(screen.getByRole("alert")).toHaveTextContent(top.woa_image_url!);
  expect(screen.container.querySelector(`img[src="${avatarUrl}"]`)).toBeNull();
});

test("a failed layer mask throws to the error boundary instead of showing the avatar without it", async () => {
  const top = buildWearable({
    id: "top-broken",
    body_part: "top",
    // No fixture by this name, so the layer's mask fails to load.
    woa_mask_url: fixtureImageUrl("dressme-woa", "missing.webp"),
  });
  const bottom = buildWearable({ id: "bottom-1", body_part: "bottom" });
  const screen = await renderWithProviders(
    <ErrorMessage>
      <OutfitTransition avatarUrl={avatarUrl} wearables={[top, bottom]} />
    </ErrorMessage>,
  );

  await expect.element(screen.getByRole("alert")).toHaveTextContent(top.woa_mask_url!);
  expect(screen.container.querySelector(`img[src="${avatarUrl}"]`)).toBeNull();
});

test("a wearable without a WOA image throws to the error boundary", async () => {
  const top = buildWearable({
    id: "top-pending",
    body_part: "top",
    woa_image_url: null,
    woa_mask_url: null,
  });
  const bottom = buildWearable({ id: "bottom-1", body_part: "bottom" });
  const screen = await renderWithProviders(
    <ErrorMessage>
      <OutfitTransition avatarUrl={avatarUrl} wearables={[top, bottom]} />
    </ErrorMessage>,
  );

  await expect.element(screen.getByRole("alert")).toBeVisible();
  expect(screen.container.querySelector(`img[src="${avatarUrl}"]`)).toBeNull();
});

test("changing the wearables keeps the previous outfit on screen until the new layers load", async ({
  worker,
}) => {
  let releaseImages!: () => void;
  const imagesHeld = new Promise<void>((resolve) => {
    releaseImages = resolve;
  });
  // Only the second top's images are held; the other images pass straight through.
  worker.use(
    http.get(/\/test-images\/dressme-woa\/(flannel|blue-pants)\.webp/, async () => {
      await imagesHeld;
      return passthrough();
    }),
  );

  const firstTop = buildWearable({
    id: "top-1",
    body_part: "top",
    woa_image_url: uncachedWoaUrl("graphic-tee.webp"),
    woa_mask_url: uncachedWoaUrl("jeans.webp"),
  });
  const secondTop = buildWearable({
    id: "top-2",
    body_part: "top",
    woa_image_url: uncachedWoaUrl("flannel.webp"),
    woa_mask_url: uncachedWoaUrl("blue-pants.webp"),
  });
  const bottom = buildWearable({
    id: "bottom-1",
    body_part: "bottom",
    woa_image_url: uncachedWoaUrl("jeans.webp"),
    woa_mask_url: uncachedWoaUrl("graphic-tee.webp"),
  });
  const screen = await renderWithProviders(
    <OutfitTransition avatarUrl={avatarUrl} wearables={[firstTop, bottom]} />,
  );
  await expect.element(woaLayerOf(screen.container, firstTop)!).toBeVisible();

  await screen.rerender(<OutfitTransition avatarUrl={avatarUrl} wearables={[secondTop, bottom]} />);

  // The previous outfit stays visible while the next one loads: the old layer is the one on
  // screen and the new one is mounted but hidden over it.
  await expect.poll(() => woaLayerOf(screen.container, secondTop)).toBeTruthy();
  await expect.element(woaLayerOf(screen.container, firstTop)!).toBeVisible();
  await expect.element(woaLayerOf(screen.container, secondTop)!).not.toBeVisible();

  releaseImages();

  const secondLayer = woaLayerOf(screen.container, secondTop)!;
  await expect.element(secondLayer).toBeVisible();
  expect(woaLayerOf(screen.container, firstTop)).toBeNull();
  expect(maskImageOf(secondLayer).getAttribute("href")).toBe(secondTop.woa_mask_url);
});

import { HomeClient } from "@/views/home";
import { actionSpies } from "@/test/actions-mock";
import {
  buildOutfit,
  buildUser,
  buildUserWithAvatar,
  buildWearable,
  fixtureImageUrl,
  renderWithProviders,
} from "@/test/utils";
import { http, passthrough } from "msw";
import { userEvent } from "vitest/browser";
import { afterEach, beforeAll, describe, expect, vi } from "vitest";
import { test } from "@/test/test-extend";

beforeAll(() => {
  // Tailwind is not compiled in this build, so define the class the composite hides with to
  // make its hiding observable through computed style.
  const style = document.createElement("style");
  style.textContent = ".invisible { visibility: hidden; }";
  document.head.appendChild(style);
});

// Unique per call so images always hit the network and can be held instead of the browser cache.
let cacheBuster = 0;
const uncachedWoaUrl = (file: string) =>
  `${fixtureImageUrl("dressme-woa", file)}?bust=${++cacheBuster}`;

interface HomeRenderOptions {
  me?: ReturnType<typeof buildUser>;
  wearables?: ReturnType<typeof buildWearable>[];
  outfits?: ReturnType<typeof buildOutfit>[];
  wearablesPending?: boolean;
  avatarPending?: boolean;
}

function homeProps(overrides: HomeRenderOptions = {}) {
  const wearables = overrides.wearables ?? [];
  return {
    me: overrides.me ?? buildUser(),
    wearables,
    outfits: overrides.outfits ?? [],
    wearablesPending:
      overrides.wearablesPending ?? wearables.some((w) => w.generation_status === "pending"),
    avatarPending: overrides.avatarPending ?? false,
  };
}

async function renderHomePage(overrides: HomeRenderOptions = {}) {
  return renderWithProviders(<HomeClient {...homeProps(overrides)} />);
}

afterEach(() => {
  vi.useRealTimers();
});

test("shows upload button when user has no selfie", async () => {
  const screen = await renderHomePage();
  await expect.element(screen.getByRole("button", { name: /upload a selfie/i })).toBeVisible();
});

test("shows 'generating avatar' when selfie uploaded but avatar not ready", async () => {
  const screen = await renderHomePage({
    me: buildUser({ has_selfie_image: true }),
    avatarPending: true,
  });
  await expect.element(screen.getByText(/generating your avatar/i)).toBeVisible();
});

test("selecting a top and bottom composites the outfit preview", async () => {
  const top = buildWearable({ id: "top-1", category: "t-shirt", body_part: "top" });
  const bottom = buildWearable({
    id: "bottom-1",
    category: "pants",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });
  const me = buildUserWithAvatar();

  const screen = await renderHomePage({ me, wearables: [top, bottom] });

  // The first success top/bottom are auto-selected. The preview stacks the
  // avatar under one wear-on-avatar layer per wearable, each cut out with its
  // luminance mask.
  const avatarLayer = screen.container.querySelector(
    `img[src="${me.avatar_image_url}"]`,
  ) as HTMLImageElement;
  expect(avatarLayer).toBeTruthy();
  await expect.element(avatarLayer).toBeVisible();

  for (const wearable of [bottom, top]) {
    const layer = screen.container.querySelector(
      `img[src="${wearable.woa_image_url}"]`,
    ) as HTMLImageElement;
    expect(layer).toBeTruthy();
    expect(layer.style.maskImage).toContain(wearable.woa_mask_url!);
    expect(layer.style.maskMode).toBe("luminance");
    await expect.element(layer).toBeVisible();
  }
});

test("keeps the composite hidden until every image has loaded", async ({ worker }) => {
  let releaseImages!: () => void;
  const imagesHeld = new Promise<void>((resolve) => {
    releaseImages = resolve;
  });
  // Holding every wear-on-avatar response keeps the composite in its not-yet-loaded state.
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
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
    woa_image_url: uncachedWoaUrl("blue-pants.webp"),
    woa_mask_url: uncachedWoaUrl("flannel.webp"),
  });
  const me = buildUserWithAvatar();
  const screen = await renderHomePage({ me, wearables: [top, bottom] });

  const avatarLayer = screen.container.querySelector(
    `img[src="${me.avatar_image_url}"]`,
  ) as HTMLImageElement;
  const stack = avatarLayer.parentElement!;
  const topLayer = screen.container.querySelector(
    `img[src="${top.woa_image_url}"]`,
  ) as HTMLImageElement;

  // Mounted and laid out, but hidden while images are in flight.
  expect(topLayer.complete).toBe(false);
  expect(stack.className).toContain("invisible");
  expect(getComputedStyle(stack).visibility).toBe("hidden");
  expect(getComputedStyle(stack).display).not.toBe("none");

  releaseImages();

  await expect.poll(() => getComputedStyle(stack).visibility, { timeout: 5000 }).toBe("visible");
  await expect.element(topLayer).toBeVisible();
});

test("a failed image reveals the stack instead of leaving it blank", async () => {
  const top = buildWearable({
    id: "top-broken",
    body_part: "top",
    // No fixture by this name, so the layer's image fails to load.
    woa_image_url: fixtureImageUrl("dressme-woa", "missing.webp"),
  });
  const bottom = buildWearable({
    id: "bottom-1",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });
  const me = buildUserWithAvatar();
  const screen = await renderHomePage({ me, wearables: [top, bottom] });

  const avatarLayer = screen.container.querySelector(
    `img[src="${me.avatar_image_url}"]`,
  ) as HTMLImageElement;
  const stack = avatarLayer.parentElement!;

  // The broken layer settles on error instead of blocking the reveal forever.
  await expect.poll(() => getComputedStyle(stack).visibility, { timeout: 5000 }).toBe("visible");
  const brokenLayer = screen.container.querySelector(
    `img[src="${top.woa_image_url}"]`,
  ) as HTMLImageElement;
  expect(brokenLayer.complete).toBe(true);
});

test("a wearable with null WOA URLs contributes no layer", async () => {
  const top = buildWearable({
    id: "top-no-woa",
    body_part: "top",
    woa_image_url: null,
    woa_mask_url: null,
  });
  const bottom = buildWearable({
    id: "bottom-1",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });
  const me = buildUserWithAvatar();
  const screen = await renderHomePage({ me, wearables: [top, bottom] });

  const avatarLayer = screen.container.querySelector(
    `img[src="${me.avatar_image_url}"]`,
  ) as HTMLImageElement;
  const stack = avatarLayer.parentElement!;

  // The stack waits only for the avatar and the bottom's image/mask, and reveals with
  // just the bottom's layer: that layer and its mask preloader besides the avatar.
  await expect.poll(() => getComputedStyle(stack).visibility, { timeout: 5000 }).toBe("visible");
  const stackImages = Array.from(stack.querySelectorAll("img"));
  expect(stackImages.length).toBe(3);
  const masked = stackImages.filter((img) => (img as HTMLImageElement).style.maskImage);
  expect(masked.length).toBe(1);
  expect(masked[0].getAttribute("src")).toBe(bottom.woa_image_url);
});

test("changing the selection hides the composite again until the new images load", async ({
  worker,
}) => {
  let releaseImages!: () => void;
  const imagesHeld = new Promise<void>((resolve) => {
    releaseImages = resolve;
  });
  // Only the second top's images are held; the first top's and bottom's pass straight through.
  worker.use(
    http.get(/\/test-images\/dressme-woa\/(flannel|blue-pants)\.webp/, async () => {
      await imagesHeld;
      return passthrough();
    }),
  );

  const firstTop = buildWearable({ id: "top-1", body_part: "top" });
  const secondTop = buildWearable({
    id: "top-2",
    body_part: "top",
    wearable_image_url: "/test-images/dressme-wearables/flannel.webp",
    woa_image_url: uncachedWoaUrl("flannel.webp"),
    woa_mask_url: uncachedWoaUrl("blue-pants.webp"),
  });
  const bottom = buildWearable({
    id: "bottom-1",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });
  const me = buildUserWithAvatar();
  const screen = await renderHomePage({ me, wearables: [firstTop, secondTop, bottom] });

  const stackOf = () =>
    (screen.container.querySelector(`img[src="${me.avatar_image_url}"]`) as HTMLImageElement)
      .parentElement!;

  await expect
    .poll(() => getComputedStyle(stackOf()).visibility, { timeout: 5000 })
    .toBe("visible");

  await userEvent.click(screen.getByRole("radio").nth(1));
  await expect.element(screen.getByRole("radio").nth(1)).toBeChecked();

  // The stack is keyed on the active URLs, so the selection change remounts it and it
  // hides again until the new images load.
  const secondTopLayer = screen.container.querySelector(
    `img[src="${secondTop.woa_image_url}"]`,
  ) as HTMLImageElement;
  expect(secondTopLayer.complete).toBe(false);
  expect(getComputedStyle(stackOf()).visibility).toBe("hidden");

  releaseImages();

  await expect
    .poll(() => getComputedStyle(stackOf()).visibility, { timeout: 5000 })
    .toBe("visible");
  expect(secondTopLayer.style.maskImage).toContain(secondTop.woa_mask_url!);
  await expect.element(secondTopLayer).toBeVisible();
});

test("clicking a pending wearable shows a toast and does not select it", async () => {
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

  const screen = await renderHomePage({
    me: buildUserWithAvatar(),
    wearables: [readyTop, pendingTop, readyBottom],
  });

  // Radix's RadioGroup.Item renders as a <button role="radio">. The tops tab
  // lists the ready top first (auto-selected) and the pending top second.
  const radios = screen.getByRole("radio");
  await expect.element(radios.first()).toBeChecked();
  await expect.element(radios.nth(1)).not.toBeChecked();

  await userEvent.click(radios.nth(1));

  // The user is told why nothing happened, and the pending item stays
  // unselected while the ready one remains selected.
  await expect.element(screen.getByText(/still being generated/i)).toBeVisible();
  await expect.element(radios.nth(1)).not.toBeChecked();
  await expect.element(radios.first()).toBeChecked();
});

test("favoriting an outfit toggles the star control and the favorites list", async () => {
  const top = buildWearable({ id: "top-fav", body_part: "top" });
  const bottom = buildWearable({
    id: "bottom-fav",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });
  const me = buildUserWithAvatar();

  const screen = await renderHomePage({ me, wearables: [top, bottom] });

  // The auto-selected outfit isn't a favorite yet: the star invites the user
  // to save it, and the favorites tab is empty.
  await expect.element(screen.getByRole("button", { name: /save as favorite/i })).toBeVisible();
  await userEvent.click(screen.getByRole("tab", { name: /favorites/i }));
  await expect.element(screen.getByText(/it will show up here/i)).toBeVisible();

  // Favoriting calls the server action; the server re-renders with the new
  // outfit, which we simulate by re-rendering with fresh props.
  await userEvent.click(screen.getByRole("button", { name: /save as favorite/i }));
  expect(actionSpies.createOutfit).toHaveBeenCalledWith({
    topId: "top-fav",
    bottomId: "bottom-fav",
  });
  await screen.rerender(
    <HomeClient
      {...homeProps({ me, wearables: [top, bottom], outfits: [buildOutfit(top, bottom)] })}
    />,
  );

  await expect
    .element(screen.getByRole("button", { name: /remove from favorites/i }))
    .toBeVisible();
  await expect.element(screen.getByRole("radio")).toBeInTheDocument();

  // Un-favoriting calls the delete action and a re-render without the
  // outfit empties the favorites tab again.
  await userEvent.click(screen.getByRole("button", { name: /remove from favorites/i }));
  expect(actionSpies.deleteOutfit).toHaveBeenCalled();
  await screen.rerender(<HomeClient {...homeProps({ me, wearables: [top, bottom] })} />);

  await expect.element(screen.getByRole("button", { name: /save as favorite/i })).toBeVisible();
  await expect.element(screen.getByText(/it will show up here/i)).toBeVisible();
});

test("uploading a selfie calls the uploadSelfie action", async () => {
  const screen = await renderHomePage();

  const input = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();

  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "selfie.png", {
    type: "image/png",
  });
  await userEvent.upload(input, file);

  expect(actionSpies.uploadSelfie).toHaveBeenCalledTimes(1);
  const formData = actionSpies.uploadSelfie.mock.calls[0][0] as FormData;
  expect(formData.get("image")).toBeInstanceOf(File);
});

describe("polling", () => {
  test("polls wearables while pending and stops once the refresh clears it", async () => {
    const me = buildUserWithAvatar();
    const wearables = [
      buildWearable({ id: "top-1", body_part: "top", generation_status: "pending" }),
      buildWearable({ id: "bottom-1", body_part: "bottom" }),
    ];

    // Fake timers must be active before mounting so the poller's interval is
    // a fake one we can advance.
    vi.useFakeTimers();
    const screen = await renderHomePage({ me, wearables, wearablesPending: true });

    await vi.advanceTimersByTimeAsync(2 * 5000);
    expect(actionSpies.refreshWearables.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(actionSpies.refreshMe).not.toHaveBeenCalled();

    // The server re-render delivers wearables with no pending items left;
    // the poller must stop with the pending prop.
    await screen.rerender(
      <HomeClient
        {...homeProps({
          me,
          wearables: [
            buildWearable({ id: "top-1", body_part: "top", generation_status: "success" }),
            buildWearable({ id: "bottom-1", body_part: "bottom" }),
          ],
          wearablesPending: false,
        })}
      />,
    );

    const callsAtStop = actionSpies.refreshWearables.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3 * 5000);
    expect(actionSpies.refreshWearables.mock.calls.length).toBe(callsAtStop);

    vi.useRealTimers();
  });

  test("polls me while the avatar is generating and stops once it's ready", async () => {
    vi.useFakeTimers();
    const screen = await renderHomePage({
      me: buildUser({ has_selfie_image: true }),
      avatarPending: true,
    });

    await vi.advanceTimersByTimeAsync(2 * 3000);
    expect(actionSpies.refreshMe.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(actionSpies.refreshWearables).not.toHaveBeenCalled();

    await screen.rerender(
      <HomeClient
        {...homeProps({
          me: buildUserWithAvatar(),
          avatarPending: false,
        })}
      />,
    );

    const callsAtStop = actionSpies.refreshMe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3 * 3000);
    expect(actionSpies.refreshMe.mock.calls.length).toBe(callsAtStop);

    vi.useRealTimers();
  });
});

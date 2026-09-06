import { HomeClient } from "@/views/home";
import { actionSpies } from "@/test/actions-mock";
import { buildOutfit, buildUser, buildWearable, renderWithProviders } from "@/test/utils";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, vi } from "vitest";
import { test } from "@/test/test-extend";

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
    me: buildUser({ has_selfie_image: true, has_avatar_image: false }),
    avatarPending: true,
  });
  await expect.element(screen.getByText(/generating your avatar/i)).toBeVisible();
});

test("selecting a top and bottom shows the outfit preview", async () => {
  const top = buildWearable({ id: "top-1", category: "t-shirt", body_part: "top" });
  const bottom = buildWearable({
    id: "bottom-1",
    category: "pants",
    body_part: "bottom",
    wearable_image_url: "/test-images/dressme-wearables/blue-pants.webp",
  });

  const screen = await renderHomePage({
    me: buildUser({ has_selfie_image: true, has_avatar_image: true }),
    wearables: [top, bottom],
  });

  // The first success top/bottom are auto-selected, so the preview image is
  // rendered as a plain <img> whose request carries the auth cookie.
  const preview = screen.container.querySelector(
    'img[src*="/api/images/outfit"]',
  ) as HTMLImageElement | null;
  expect(preview).toBeTruthy();
  await expect.element(preview!).toBeVisible();
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
    me: buildUser({ has_selfie_image: true, has_avatar_image: true }),
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
  const me = buildUser({ has_selfie_image: true, has_avatar_image: true });

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
    const me = buildUser({ has_selfie_image: true, has_avatar_image: true });
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
      me: buildUser({ has_selfie_image: true, has_avatar_image: false }),
      avatarPending: true,
    });

    await vi.advanceTimersByTimeAsync(2 * 3000);
    expect(actionSpies.refreshMe.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(actionSpies.refreshWearables).not.toHaveBeenCalled();

    await screen.rerender(
      <HomeClient
        {...homeProps({
          me: buildUser({ has_selfie_image: true, has_avatar_image: true }),
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

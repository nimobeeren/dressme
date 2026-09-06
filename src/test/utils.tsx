import type { Outfit, User, Wearable } from "@/shared/schemas";
import { Toaster } from "@/components/ui/toaster";
import { render } from "vitest-browser-react";
import { TEST_IMAGE_PREFIX } from "./constants";

/** Build a URL that the Vite middleware will serve from fixtures on disk. */
export function fixtureImageUrl(
  bucket: "dressme-wearables" | "dressme-avatars" | "dressme-selfies",
  filename: string,
): string {
  return `${TEST_IMAGE_PREFIX}/${bucket}/${filename}`;
}

/** Renders a component together with the Toaster the real app mounts in the root layout. */
export async function renderWithProviders(ui: React.ReactElement) {
  return await render(
    <>
      {ui}
      <Toaster />
    </>,
  );
}

// ---------- Fixture builders ----------

let wearableSeq = 0;
export function buildWearable(overrides: Partial<Wearable> = {}): Wearable {
  const id = overrides.id ?? `wearable-${++wearableSeq}`;
  return {
    id,
    category: "t-shirt",
    body_part: "top",
    wearable_image_url: fixtureImageUrl("dressme-wearables", "graphic-tee.webp"),
    generation_status: "success",
    ...overrides,
  };
}

let outfitSeq = 0;
export function buildOutfit(
  top: Wearable,
  bottom: Wearable,
  overrides: Partial<Outfit> = {},
): Outfit {
  return {
    id: `outfit-${++outfitSeq}`,
    top,
    bottom,
    ...overrides,
  };
}

export function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "auth0|test-user",
    has_selfie_image: false,
    has_avatar_image: false,
    ...overrides,
  };
}

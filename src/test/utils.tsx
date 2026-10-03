import type { Outfit, User, Wearable } from "@/shared/schemas";
import { Toaster } from "@/components/ui/toaster";
import { render } from "vitest-browser-react";
import { TEST_IMAGE_PREFIX } from "./constants";

/** Build a URL that the Vite middleware will serve from fixtures on disk. */
export function fixtureImageUrl(
  bucket: "dressme-wearables" | "dressme-avatars" | "dressme-selfies" | "dressme-woa",
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
  // Mirrors the API invariant: WOA URLs are present exactly when generation succeeded.
  const generation_status = overrides.generation_status ?? "success";
  return {
    id,
    category: "t-shirt",
    body_part: "top",
    wearable_image_url: fixtureImageUrl("dressme-wearables", "graphic-tee.webp"),
    generation_status,
    woa_image_url:
      generation_status === "success" ? fixtureImageUrl("dressme-woa", "graphic-tee.webp") : null,
    woa_mask_url:
      generation_status === "success" ? fixtureImageUrl("dressme-woa", "jeans.webp") : null,
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
    id: "user_test",
    has_selfie_image: false,
    avatar_image_url: null,
    ...overrides,
  };
}

/** A user who has uploaded a selfie and has a generated avatar to try clothes on. */
export function buildUserWithAvatar(overrides: Partial<User> = {}): User {
  return buildUser({
    has_selfie_image: true,
    avatar_image_url: fixtureImageUrl("dressme-avatars", "avatar.jpg"),
    ...overrides,
  });
}

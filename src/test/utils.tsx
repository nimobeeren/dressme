import type { Outfit, User, Wearable } from "@/api";
import { Toaster } from "@/components/ui/toaster";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router";

export { setAuthState } from "./auth-state";
export { TEST_IMAGE_PREFIX } from "./constants";

import { TEST_IMAGE_PREFIX } from "./constants";

/** Build a URL that the Vite middleware will serve from fixtures on disk. */
export function fixtureImageUrl(
  bucket: "dressme-wearables" | "dressme-avatars" | "dressme-selfies",
  filename: string,
): string {
  return `${TEST_IMAGE_PREFIX}/${bucket}/${filename}`;
}

/** Renders a component inside the same providers the real app uses. */
export async function renderWithProviders(
  ui: React.ReactElement,
  { initialEntries = ["/"] }: { initialEntries?: string[] } = {},
) {
  // Fresh QueryClient per render — retries off so errors surface immediately.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return await render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>,
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

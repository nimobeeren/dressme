import { vi } from "vitest";

/**
 * Global mocks for the server action modules. Client components import these
 * modules; in browser tests the real "use server" functions are replaced by
 * these spies. Tests simulate the post-action server re-render by re-rendering
 * the component with fresh props.
 */
const mocks = vi.hoisted(() => ({
  uploadSelfie: vi.fn(async (_formData: FormData) => {}),
  refreshMe: vi.fn(async () => {}),
  createWearables: vi.fn(async (_formData: FormData) => {}),
  classifyWearable: vi.fn(async (_formData: FormData): Promise<{ category: string | null }> => ({
    category: null,
  })),
  refreshWearables: vi.fn(async () => {}),
  createOutfit: vi.fn(async (_params: { topId: string; bottomId: string }) => {}),
  deleteOutfit: vi.fn(async (_id: string) => {}),
}));

vi.mock("@/server/actions/me", () => ({
  uploadSelfie: mocks.uploadSelfie,
  refreshMe: mocks.refreshMe,
}));

vi.mock("@/server/actions/wearables", () => ({
  createWearables: mocks.createWearables,
  classifyWearable: mocks.classifyWearable,
  refreshWearables: mocks.refreshWearables,
}));

vi.mock("@/server/actions/outfits", () => ({
  createOutfit: mocks.createOutfit,
  deleteOutfit: mocks.deleteOutfit,
}));

export const actionSpies = mocks;

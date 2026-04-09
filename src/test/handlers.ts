import type { Outfit, User, Wearable } from "@/api";
import { http, HttpResponse } from "msw";

// A tiny valid PNG (1x1 transparent) used as a stand-in for any endpoint that
// serves image bytes. Good enough for `<img>` tags to load without error.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
const TINY_PNG_BYTES = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0));

/**
 * Default handlers describe a happy-path "authenticated user with no selfie yet".
 * Individual tests override these via `worker.use(...)`.
 */
export const defaultUser: User = {
  id: "auth0|test-user",
  has_selfie_image: false,
  has_avatar_image: false,
};

export const defaultHandlers = [
  http.get("*/healthz", () => HttpResponse.json({ status: "ok" })),
  http.get("*/me", () => HttpResponse.json(defaultUser)),
  http.get("*/wearables", () => HttpResponse.json<Wearable[]>([])),
  http.get("*/outfits", () => HttpResponse.json<Outfit[]>([])),
  // The outfit preview is rendered as a plain <img src="/images/outfit?...">
  // in home.tsx. Return tiny valid PNG bytes so the element loads without
  // triggering `onUnhandledRequest`.
  http.get("*/images/outfit", () =>
    HttpResponse.arrayBuffer(TINY_PNG_BYTES.buffer as ArrayBuffer, {
      headers: { "Content-Type": "image/png" },
    }),
  ),
];

import { http, HttpResponse } from "msw";

// A tiny valid PNG (1x1 transparent) used as a stand-in for any endpoint that
// serves image bytes. Good enough for `<img>` tags to load without error.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==";
const TINY_PNG_BYTES = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0));

/**
 * Default handlers. The outfit preview is rendered as a plain
 * `<img src="/api/images/outfit?...">`; the browser sends the auth cookie
 * automatically. Return tiny valid PNG bytes so the element loads without
 * triggering `onUnhandledRequest`.
 */
export const defaultHandlers = [
  http.get("*/api/images/outfit", () =>
    HttpResponse.arrayBuffer(TINY_PNG_BYTES.buffer as ArrayBuffer, {
      headers: { "Content-Type": "image/png" },
    }),
  ),
];

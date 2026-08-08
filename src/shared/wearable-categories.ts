/** Wearable category definitions and body-part mapping, shared between the API
 * route handlers and the client. */

export const WEARABLE_CATEGORIES = [
  "t-shirt",
  "shirt",
  "sweater",
  "jacket",
  "top",
  "pants",
  "shorts",
  "skirt",
] as const;

export type WearableCategory = (typeof WEARABLE_CATEGORIES)[number];

export const BODY_PARTS = ["top", "bottom"] as const;

export type BodyPart = (typeof BODY_PARTS)[number];

// Record ensures every WearableCategory is assigned a body part. Adding a
// category to WEARABLE_CATEGORIES without adding it here causes a type error.
export const CATEGORY_BODY_PARTS: Record<WearableCategory, BodyPart> = {
  "t-shirt": "top",
  shirt: "top",
  sweater: "top",
  jacket: "top",
  top: "top",
  pants: "bottom",
  shorts: "bottom",
  skirt: "bottom",
};

/** Get the body part for a wearable category.
 * Throws if the category is unknown. */
export function getBodyPart(category: string): BodyPart {
  const bodyPart = CATEGORY_BODY_PARTS[category as WearableCategory];
  if (bodyPart === undefined) {
    throw new Error(`Unknown wearable category: ${category}`);
  }
  return bodyPart;
}

/** Zod schemas describing the API wire format, shared between the route
 * handlers and the client. Field names are snake_case — this is the contract
 * inherited from the historical FastAPI backend. */

import { z } from "zod";
import { BODY_PARTS, WEARABLE_CATEGORIES } from "./wearable-categories";

export const uuidSchema = z.string().uuid();
export const wearableCategorySchema = z.enum(WEARABLE_CATEGORIES);

export const userSchema = z.object({
  id: z.string(),
  has_selfie_image: z.boolean(),
  /** Non-null iff the user has an avatar image. */
  avatar_image_url: z.string().nullable(),
});
export type User = z.infer<typeof userSchema>;

export const wearableSchema = z.object({
  id: z.string(),
  category: wearableCategorySchema,
  body_part: z.enum(BODY_PARTS),
  wearable_image_url: z.string(),
  generation_status: z.enum(["pending", "success"]),
  /** The wearable rendered on the user's avatar. Non-null iff generation_status === "success". */
  woa_image_url: z.string().nullable(),
  /** Luminance mask of the wearable within the WOA image. Non-null iff generation_status === "success". */
  woa_mask_url: z.string().nullable(),
});
export type Wearable = z.infer<typeof wearableSchema>;

export const outfitSchema = z.object({
  id: z.string(),
  top: wearableSchema,
  bottom: wearableSchema,
});
export type Outfit = z.infer<typeof outfitSchema>;

export const classifyResponseSchema = z.object({
  category: wearableCategorySchema.nullable(),
  error: z.string().optional(),
});
export type ClassifyResponse = z.infer<typeof classifyResponseSchema>;

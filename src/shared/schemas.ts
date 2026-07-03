/** Zod schemas describing the API wire format, shared between the route
 * handlers and the client. Field names are snake_case — this is the contract
 * inherited from the FastAPI backend and preserved by the migration. */

import { z } from "zod";
import { WEARABLE_CATEGORIES } from "./wearable-categories";

export const wearableCategorySchema = z.enum(WEARABLE_CATEGORIES);

export const userSchema = z.object({
  id: z.string(),
  has_selfie_image: z.boolean(),
  has_avatar_image: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const wearableSchema = z.object({
  id: z.string(),
  category: wearableCategorySchema,
  body_part: z.enum(["top", "bottom"]),
  wearable_image_url: z.string(),
  generation_status: z.enum(["pending", "success"]),
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
});
export type ClassifyResponse = z.infer<typeof classifyResponseSchema>;

export const healthSchema = z.object({
  status: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

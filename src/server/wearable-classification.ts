import { GoogleGenAI } from "@google/genai";
import { getSettings } from "./settings";
import { WEARABLE_CATEGORIES, type WearableCategory } from "@/shared/wearable-categories";
import { classifyResponseSchema } from "@/shared/schemas";

async function getSharp() {
  return (await import("sharp")).default;
}

/**
 * Classify a wearable image into one of the known categories.
 * Approximate cost: $0.0003 per invocation.
 */
export async function classifyWearableImage(imageData: Buffer): Promise<WearableCategory | null> {
  const settings = getSettings();
  const ai = new GoogleGenAI({ apiKey: settings.GEMINI_API_KEY });

  const sharp = await getSharp();
  const downscaled = await sharp(imageData)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg()
    .toBuffer();

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: downscaled.toString("base64") } },
      "classify this wearable",
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            nullable: true,
            description: `The category of the wearable, one of: ${WEARABLE_CATEGORIES.join(", ")}`,
          },
        },
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Response text is null");

  const parsed = classifyResponseSchema.parse(JSON.parse(text));
  return parsed.category;
}

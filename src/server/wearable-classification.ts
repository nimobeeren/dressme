import { GoogleGenAI } from "@google/genai";
import { getSettings } from "./settings";
import type { WearableCategory } from "@/shared/wearable-categories";

export async function classifyWearableImage(imageData: Buffer): Promise<WearableCategory | null> {
  const settings = getSettings();
  const ai = new GoogleGenAI({ apiKey: settings.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite",
    contents: [
      { inlineData: { mimeType: "image/jpeg", data: imageData.toString("base64") } },
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
            description:
              "The category of the wearable: t-shirt, shirt, sweater, jacket, top, pants, shorts, or skirt",
          },
        },
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Response text is null");

  const result = JSON.parse(text) as { category: string | null };
  return result.category as WearableCategory | null;
}

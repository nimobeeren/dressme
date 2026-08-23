import { GoogleGenAI, ApiError } from "@google/genai";
import pRetry from "p-retry";
import { getSettings } from "../settings";

async function getSharp() {
  return (await import("sharp")).default;
}

const PROMPT = `style the person as a sims 3 character
no text/UI/diamond above the head
video game style (PS3)
not photorealistic
not cel-shaded
preserve face details
plain light-gray background
no objects other than the person
full body (head to toe)
soft lighting
medium contrast
relaxed pose with arms by side
wearing white 9" inseam shorts, white regular fit t-shirt and white socks
no shoes/accessories
facing camera
relaxed gaze`;

/**
 * Generate a game-like avatar image from a selfie image.
 * Approximate cost: $0.07 per invocation.
 */
export async function generateAvatar(selfieImageData: Buffer): Promise<Buffer> {
  const settings = getSettings();
  const ai = new GoogleGenAI({ apiKey: settings.GEMINI_API_KEY });

  // Downscale selfie to max 1024px longest side before sending to Gemini
  const sharp = await getSharp();
  const downscaled = await sharp(selfieImageData)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg()
    .toBuffer();

  const response = await pRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-3.1-flash-image",
        contents: [
          { inlineData: { mimeType: "image/jpeg", data: downscaled.toString("base64") } },
          PROMPT,
        ],
        config: {
          imageConfig: {
            aspectRatio: "3:4",
            imageSize: "1K",
          },
        },
      }),
    {
      retries: 3,
      shouldRetry: ({ error }) =>
        error instanceof TypeError ||
        (error instanceof ApiError && [408, 429, 500, 502, 503, 504].includes(error.status)),
      onFailedAttempt: ({ attemptNumber, retriesLeft, error }) => {
        console.info(
          `generateAvatar attempt ${attemptNumber} failed (${retriesLeft} retries left): ${error.message}`,
        );
      },
    },
  );

  if (!response.candidates) {
    throw new Error("Gemini returned no candidates");
  }

  for (const part of response.candidates.flatMap((c) => c.content?.parts ?? [])) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("Gemini response did not contain an image");
}

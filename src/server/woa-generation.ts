import Replicate from "replicate";
import { getSettings } from "./settings";
import {
  CATEGORY_BODY_PARTS,
  parseWearableCategory,
  type WearableCategory,
} from "@/shared/wearable-categories";

// Record<WearableCategory, string> ensures every category is covered. Adding a
// category to WEARABLE_CATEGORIES in wearable-categories.ts without adding it
// here causes a type error.
const WEARABLE_DESCRIPTIONS: Record<WearableCategory, string> = {
  "t-shirt": "t-shirt",
  shirt: "shirt",
  sweater: "sweater",
  jacket: "jacket",
  top: "tank top", // because segmentation struggles with just "top"
  pants: "pants",
  shorts: "shorts",
  skirt: "skirt",
};

async function downloadUrl(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateWoaImage(params: {
  avatarImage: Buffer;
  wearableImage: Buffer;
  category: string;
}): Promise<Buffer> {
  /**
   * Generate a WearableOnAvatar (WOA) image — a rendering of the given
   * avatar wearing the given wearable item.
   *
   * Approximate cost: $0.04 per invocation.
   */
  const { avatarImage, wearableImage, category } = params;
  const settings = getSettings();
  const client = new Replicate({ auth: settings.REPLICATE_API_TOKEN });

  // parseWearableCategory throws on unknown input; the resulting WearableCategory
  // safely indexes both exhaustive Records below without further casts.
  const validCategory = parseWearableCategory(category);
  const bodyPart = CATEGORY_BODY_PARTS[validCategory];
  const description = WEARABLE_DESCRIPTIONS[validCategory];

  const avatarDataUri = `data:image/jpeg;base64,${avatarImage.toString("base64")}`;
  const wearableDataUri = `data:image/jpeg;base64,${wearableImage.toString("base64")}`;

  const output = await client.run(
    "cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
    {
      input: {
        garm_img: wearableDataUri,
        human_img: avatarDataUri,
        garment_des: description,
        category: bodyPart === "top" ? "upper_body" : "lower_body",
      },
    },
  );

  return downloadUrl(String(output));
}

export async function generateMask(params: {
  woaImage: Buffer;
  category: string;
}): Promise<Buffer> {
  /**
   * Generate a mask for a WOA image, isolating the wearable item
   * for compositing purposes.
   *
   * Approximate cost: $0.004 per invocation.
   */
  const { woaImage, category } = params;
  const settings = getSettings();
  const client = new Replicate({ auth: settings.REPLICATE_API_TOKEN });

  const woaDataUri = `data:image/jpeg;base64,${woaImage.toString("base64")}`;
  // parseWearableCategory throws on unknown input; the resulting WearableCategory
  // safely indexes the exhaustive Record below without further casts.
  const description = WEARABLE_DESCRIPTIONS[parseWearableCategory(category)];

  const results = (await client.run(
    "schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c",
    {
      input: {
        image: woaDataUri,
        // This prompt is very sensitive, for example "tshirt" fails every time while "t-shirt" works
        mask_prompt: description,
        negative_mask_prompt: "",
        adjustment_factor: 0,
      },
    },
  )) as string[];

  // The output is an array of files. Find the mask one.
  for (const url of results) {
    if (url.endsWith("/mask.jpg")) {
      return downloadUrl(url);
    }
  }

  throw new Error("Could not get mask URL from Replicate output");
}

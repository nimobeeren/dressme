import Replicate from "replicate";
import { getSettings } from "./settings";
import { getBodyPart, type WearableCategory } from "@/shared/wearable-categories";

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
  const { avatarImage, wearableImage, category } = params;
  const settings = getSettings();
  const client = new Replicate({ auth: settings.REPLICATE_API_TOKEN });

  // getBodyPart throws on unknown categories; the exhaustive Record then
  // guarantees a description exists for every valid WearableCategory.
  const bodyPart = getBodyPart(category as WearableCategory);
  const description = WEARABLE_DESCRIPTIONS[category as WearableCategory];

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
  const { woaImage, category } = params;
  const settings = getSettings();
  const client = new Replicate({ auth: settings.REPLICATE_API_TOKEN });

  const woaDataUri = `data:image/jpeg;base64,${woaImage.toString("base64")}`;
  // Validate category (throws on unknown); Record guarantees a description exists.
  getBodyPart(category as WearableCategory);
  const description = WEARABLE_DESCRIPTIONS[category as WearableCategory];

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

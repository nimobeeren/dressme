"""
Generate WOA images and masks for masking evaluation.

For each garment image in images/garments/{tops,bottoms}/{category}/,
generates a WOA image (avatar wearing the garment) and a mask
(isolating the garment for compositing).

Uses the category folder name as the mask prompt for Grounded SAM.

Usage:
    uv run masking-categories/generate_masks.py --avatar ../images/avatars/avatar_4.jpg

Outputs are saved to experiments/masking-categories/output/{avatar_name}/{category}/{garment_name}_{woa,mask}.jpg

Approximate cost: $0.044 per (garment, avatar) pair.
"""

import argparse
import asyncio
import io
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from replicate.client import Client

load_dotenv(Path(__file__).parent.parent / ".env")

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
GARMENTS_DIR = REPO_ROOT / "images" / "garments"
OUTPUT_DIR = SCRIPT_DIR / "output"

# Load category config: maps category name -> mask_prompt
with open(SCRIPT_DIR / "categories.json") as f:
    CATEGORIES: dict[str, dict] = json.load(f)

WOA_MODEL = "cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4"
MASK_MODEL = "schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c"


async def generate_woa(client: Client, avatar_image: bytes, wearable_image: bytes, category: str, category_vton: str) -> bytes:
    woa_image_url = str(
        await client.async_run(
            WOA_MODEL,
            input={
                "garm_img": io.BytesIO(wearable_image),
                "human_img": io.BytesIO(avatar_image),
                "garment_des": category,
                "category": category_vton,
            },
        )
    )
    async with httpx.AsyncClient() as http:
        response = await http.get(woa_image_url)
        response.raise_for_status()
        return response.content


async def generate_mask(client: Client, woa_image: bytes, mask_prompt: str) -> bytes:
    mask_results = await client.async_run(
        MASK_MODEL,
        input={
            "image": io.BytesIO(woa_image),
            "mask_prompt": mask_prompt,
            "negative_mask_prompt": "",
            "adjustment_factor": 0,
        },
    )

    mask_image_url = None
    async for result_url_raw in mask_results:
        result_url = str(result_url_raw)
        if result_url.endswith("/mask.jpg"):
            mask_image_url = result_url
            break
    if mask_image_url is None:
        raise ValueError(f"Could not get mask URL for prompt '{mask_prompt}'")

    async with httpx.AsyncClient() as http:
        response = await http.get(mask_image_url)
        response.raise_for_status()
        return response.content


def discover_garments() -> list[tuple[str, str, Path]]:
    """Returns list of (body_part, category, image_path) tuples."""
    garments = []
    for body_part in ["tops", "bottoms"]:
        body_dir = GARMENTS_DIR / body_part
        if not body_dir.exists():
            continue
        for category_dir in sorted(body_dir.iterdir()):
            if not category_dir.is_dir():
                continue
            category = category_dir.name
            if category not in CATEGORIES:
                print(f"  Skipping unknown category: {category}")
                continue
            for image_path in sorted(category_dir.iterdir()):
                if image_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                    garments.append((body_part, category, image_path))
    return garments


async def process_garment(
    client: Client,
    avatar_image: bytes,
    avatar_name: str,
    body_part: str,
    category: str,
    mask_prompt: str,
    image_path: Path,
    *,
    masks_only: bool = False,
) -> None:
    garment_name = image_path.stem
    out_dir = OUTPUT_DIR / avatar_name / category
    woa_path = out_dir / f"{garment_name}_woa.jpg"
    mask_path = out_dir / f"{garment_name}_mask.jpg"
    vton_category = "upper_body" if body_part == "tops" else "lower_body"

    out_dir.mkdir(parents=True, exist_ok=True)

    if masks_only:
        if not woa_path.exists():
            raise FileNotFoundError(f"WOA image not found: {woa_path} (needed for --masks-only)")
        woa_image = woa_path.read_bytes()
    elif woa_path.exists() and mask_path.exists():
        print(f"  Skipping {category}/{garment_name} (already generated)")
        return
    else:
        wearable_image = image_path.read_bytes()
        print(f"  Generating WOA for {category}/{garment_name}...")
        woa_image = await generate_woa(client, avatar_image, wearable_image, category, vton_category)
        woa_path.write_bytes(woa_image)

    print(f"  Generating mask for {category}/{garment_name} (prompt: {mask_prompt!r})...")
    mask_image = await generate_mask(client, woa_image, mask_prompt)
    mask_path.write_bytes(mask_image)

    print(f"  Done: {category}/{garment_name}")


async def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--avatar", required=True, type=Path, help="Path to avatar image")
    parser.add_argument("--category", type=str, help="Only process this category")
    parser.add_argument("--mask-prompt", type=str, help="Override mask prompt (default: category name)")
    parser.add_argument("--masks-only", action="store_true", help="Only regenerate masks, reuse existing WOA images")
    args = parser.parse_args()

    api_token = os.environ.get("REPLICATE_API_TOKEN")
    if not api_token:
        print("Error: REPLICATE_API_TOKEN environment variable is required", file=sys.stderr)
        sys.exit(1)

    avatar_path: Path = args.avatar
    if not avatar_path.exists():
        print(f"Error: Avatar image not found: {avatar_path}", file=sys.stderr)
        sys.exit(1)

    avatar_name = avatar_path.stem
    avatar_image = avatar_path.read_bytes()

    all_garments = discover_garments()
    if args.category:
        garments = [(bp, cat, p) for bp, cat, p in all_garments if cat == args.category]
        if not garments:
            print(f"No garment images found for category '{args.category}'", file=sys.stderr)
            sys.exit(1)
    else:
        garments = all_garments

    if not garments:
        print("No garment images found. Add images to images/garments/{tops,bottoms}/{category}/")
        sys.exit(1)

    print(f"Found {len(garments)} garment images across {len(set(c for _, c, _ in garments))} categories")
    if args.masks_only:
        estimated_cost = len(garments) * 0.004
    else:
        estimated_cost = len(garments) * 0.044
    print(f"Estimated cost: ${estimated_cost:.2f}")
    print()

    client = Client(api_token=api_token)
    semaphore = asyncio.Semaphore(10)

    async def bounded_process(body_part: str, category: str, image_path: Path) -> None:
        mask_prompt = args.mask_prompt or CATEGORIES[category]["mask_prompt"]
        async with semaphore:
            await process_garment(
                client, avatar_image, avatar_name, body_part, category, mask_prompt, image_path,
                masks_only=args.masks_only,
            )

    await asyncio.gather(
        *(bounded_process(bp, cat, p) for bp, cat, p in garments)
    )

    print()
    print(f"Results saved to {OUTPUT_DIR / avatar_name}/")
    print(f"Run `uv run build_annotation_page.py --avatar-name {avatar_name}` to generate the annotation page.")


if __name__ == "__main__":
    asyncio.run(main())

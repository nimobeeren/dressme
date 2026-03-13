# Masking Evaluation

Evaluates whether clothing category names work well as mask prompts for
[Grounded SAM](https://replicate.com/schananas/grounded_sam), which is used to
isolate wearables in virtual try-on images.

## Setup

```sh
cd experiments
uv sync
cp .env.example .env  # then fill in REPLICATE_API_TOKEN
```

## Test images

Place garment images in `images/garments/{tops,bottoms}/{category}/` (from repo root):

```
images/garments/
├── tops/
│   ├── t-shirt/     (3 images: 2 casual, 1 product)
│   ├── shirt/
│   ├── sweater/
│   ├── jacket/
│   └── top/
└── bottoms/
    ├── pants/
    ├── shorts/
    └── skirt/
```

Each category should have 3 images: 2 casual (marketplace-style phone photos)
and 1 professional product photo.

## Running

All commands are run from `experiments/`.

### 1. Generate WOA images and masks

Generates a virtual try-on image (WOA) and a segmentation mask for each
(garment, avatar) pair. Uses the category folder name as the Grounded SAM mask
prompt.

```sh
uv run masking-categories/generate_masks.py --avatar ../images/avatars/avatar_4.jpg
```

Cost: ~$0.044 per (garment, avatar) pair ($0.04 WOA + $0.004 mask).

Already-generated outputs are skipped, so it's safe to re-run.

To regenerate only masks (e.g. to test a different prompt for a category):

```sh
uv run masking-categories/generate_masks.py --avatar ../images/avatars/avatar_4.jpg \
    --category top --mask-prompt "top garment" --masks-only
```

### 2. Build annotation pages

Generates an HTML page showing each WOA with its mask overlay, with Good/Bad
buttons for manual annotation.

```sh
uv run masking-categories/build_annotation_page.py --avatar-name avatar_4
```

Open the generated HTML file in a browser, rate each mask, then click
"Export JSON". Save the downloaded `annotations.json` into the corresponding
`masking-categories/output/{avatar_name}/` directory.

### 3. Summarize results

```sh
uv run masking-categories/summarize_masking.py masking-categories/output/*/annotations.json
```

Prints accuracy per category, per avatar, and overall.

## Output structure

```
masking-categories/output/{avatar_name}/
├── {category}/
│   ├── {garment}_woa.jpg    # virtual try-on image
│   └── {garment}_mask.jpg   # segmentation mask
├── annotate.html            # annotation page
└── annotations.json         # your ratings (exported from HTML)
```

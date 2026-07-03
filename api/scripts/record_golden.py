# Records reference outputs of the PIL-based outfit compositing into tests/golden/.
# These images are the parity target for the TypeScript (sharp) port of
# combine_wearables: the ported implementation must reproduce them within a small
# per-pixel tolerance. Run once with `uv run python scripts/record_golden.py` from api/.
from pathlib import Path

from PIL import Image

from dressme.combining import combine_wearables

ROOT_PATH = Path(__file__).parent.parent.parent
GOLDEN_PATH = ROOT_PATH / "tests" / "golden"

AVATAR = "images/avatars/avatar_4.jpg"
COMBOS = [("tshirt", "pants"), ("sweater", "skirt"), ("jacket", "shorts")]


def record():
    GOLDEN_PATH.mkdir(parents=True, exist_ok=True)

    for top, bottom in COMBOS:
        avatar_im = Image.open(ROOT_PATH / AVATAR)
        top_im = Image.open(ROOT_PATH / f"images/results/human_4/single/{top}.jpg")
        bottom_im = Image.open(ROOT_PATH / f"images/results/human_4/single/{bottom}.jpg")
        top_mask_im = Image.open(ROOT_PATH / f"images/masks/human_4/post/{top}.jpg")
        bottom_mask_im = Image.open(ROOT_PATH / f"images/masks/human_4/post/{bottom}.jpg")

        outfit_im = combine_wearables(
            avatar_im, top_im, bottom_im, top_mask_im, bottom_mask_im
        )

        # PNG keeps the comparison lossless: parity tests should compare decoded
        # pixels of the sharp composite against these, isolating compositing
        # differences from JPEG encoder differences.
        out_path = GOLDEN_PATH / f"outfit_{top}_{bottom}.png"
        outfit_im.save(out_path, format="PNG")
        print(f"wrote {out_path.relative_to(ROOT_PATH)} ({outfit_im.size[0]}x{outfit_im.size[1]})")


if __name__ == "__main__":
    record()

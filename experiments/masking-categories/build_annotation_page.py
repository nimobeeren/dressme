"""
Build an HTML annotation page for masking evaluation results.

Reads WOA and mask images from output/{avatar_name}/ and generates
an interactive HTML page where you can rate each mask as good/bad.

Annotations are saved to/loaded from a JSON file so you can close and resume.

Usage:
    uv run masking-categories/build_annotation_page.py --avatar-name avatar_4
"""

import argparse
import base64
import sys
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent / "output"


def image_to_data_uri(path: Path) -> str:
    data = base64.b64encode(path.read_bytes()).decode()
    return f"data:image/jpeg;base64,{data}"


def discover_results(avatar_name: str) -> list[dict]:
    """Find all WOA/mask pairs for an avatar."""
    avatar_dir = OUTPUT_DIR / avatar_name
    if not avatar_dir.exists():
        return []

    results = []
    for category_dir in sorted(avatar_dir.iterdir()):
        if not category_dir.is_dir():
            continue
        category = category_dir.name

        woa_files = sorted(category_dir.glob("*_woa.jpg"))
        for woa_path in woa_files:
            garment_name = woa_path.name.removesuffix("_woa.jpg")
            mask_path = category_dir / f"{garment_name}_mask.jpg"
            if not mask_path.exists():
                continue
            results.append({
                "id": f"{category}/{garment_name}",
                "category": category,
                "garment_name": garment_name,
                "woa_data_uri": image_to_data_uri(woa_path),
                "mask_data_uri": image_to_data_uri(mask_path),
            })
    return results


def build_html(results: list[dict], avatar_name: str) -> str:
    cards_html = ""
    for r in results:
        cards_html += f"""
        <div class="card" data-id="{r['id']}">
            <h3>{r['category']} / {r['garment_name']}</h3>
            <div class="images">
                <div class="image-container">
                    <img src="{r['woa_data_uri']}" alt="WOA">
                    <span class="label">WOA</span>
                </div>
                <div class="image-container">
                    <img src="{r['woa_data_uri']}" alt="WOA + Mask overlay" class="base">
                    <img src="{r['mask_data_uri']}" alt="Mask" class="mask-overlay">
                    <span class="label">Mask overlay</span>
                </div>
                <div class="image-container">
                    <img src="{r['mask_data_uri']}" alt="Mask">
                    <span class="label">Mask</span>
                </div>
            </div>
            <div class="rating">
                <button class="rate-btn good" onclick="rate('{r['id']}', 'good')">Good</button>
                <button class="rate-btn bad" onclick="rate('{r['id']}', 'bad')">Bad</button>
            </div>
        </div>
"""

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Masking Eval — {avatar_name}</title>
<style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: system-ui, sans-serif; padding: 24px; background: #f5f5f5; }}
    h1 {{ margin-bottom: 8px; }}
    .summary {{ margin-bottom: 24px; color: #666; }}
    .card {{
        background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }}
    .card h3 {{ margin-bottom: 12px; font-family: monospace; }}
    .images {{ display: flex; gap: 12px; margin-bottom: 12px; }}
    .image-container {{ position: relative; flex: 1; }}
    .image-container img {{ width: 100%; border-radius: 4px; display: block; }}
    .image-container img.base {{ position: relative; }}
    .image-container img.mask-overlay {{
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        mix-blend-mode: multiply; opacity: 0.5; border-radius: 4px;
    }}
    .label {{
        position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.6);
        color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;
    }}
    .rating {{ display: flex; gap: 8px; }}
    .rate-btn {{
        padding: 6px 20px; border: 2px solid #ddd; border-radius: 4px;
        background: white; cursor: pointer; font-size: 14px; font-weight: 500;
    }}
    .rate-btn:hover {{ background: #f0f0f0; }}
    .rate-btn.good.selected {{ background: #22c55e; color: white; border-color: #22c55e; }}
    .rate-btn.bad.selected {{ background: #ef4444; color: white; border-color: #ef4444; }}
    .export {{ position: fixed; top: 24px; right: 24px; }}
    .export button {{
        padding: 8px 16px; background: #3b82f6; color: white; border: none;
        border-radius: 4px; cursor: pointer; font-size: 14px;
    }}
    .export button:hover {{ background: #2563eb; }}
</style>
</head>
<body>
    <h1>Masking Eval — {avatar_name}</h1>
    <p class="summary"><span id="progress">0</span> / {len(results)} annotated</p>
    <div class="export">
        <button onclick="exportAnnotations()">Export JSON</button>
    </div>
    {cards_html}
<script>
const STORAGE_KEY = 'masking-eval-{avatar_name}';

let annotations = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{{}}');

function rate(id, rating) {{
    annotations[id] = rating;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
    updateUI();
}}

function updateUI() {{
    document.querySelectorAll('.card').forEach(card => {{
        const id = card.dataset.id;
        const rating = annotations[id];
        card.querySelectorAll('.rate-btn').forEach(btn => {{
            btn.classList.remove('selected');
            if (btn.classList.contains(rating)) btn.classList.add('selected');
        }});
    }});
    document.getElementById('progress').textContent =
        Object.keys(annotations).length;
}}

function exportAnnotations() {{
    const blob = new Blob([JSON.stringify(annotations, null, 2)], {{ type: 'application/json' }});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'annotations.json';
    a.click();
}}

updateUI();
</script>
</body>
</html>"""


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--avatar-name", required=True, help="Avatar name (stem of avatar image filename)")
    args = parser.parse_args()

    results = discover_results(args.avatar_name)
    if not results:
        print(f"No results found for avatar '{args.avatar_name}'.", file=sys.stderr)
        print(f"Run generate_masks.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(results)} WOA/mask pairs")

    html = build_html(results, args.avatar_name)
    out_path = OUTPUT_DIR / args.avatar_name / "annotate.html"
    out_path.write_text(html)

    print(f"Annotation page saved to {out_path}")
    print(f"Open in browser: file://{out_path.resolve()}")


if __name__ == "__main__":
    main()

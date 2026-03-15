"""
Summarize masking evaluation annotations.

Reads exported annotation JSON files and prints quantified results:
accuracy per category, per avatar, and overall.

Usage:
    uv run masking-categories/summarize_masking.py masking-categories/output/avatar_1/annotations.json [...]
"""

import argparse
import json
import sys
from collections import defaultdict


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="+", type=argparse.FileType("r"), help="Annotation JSON files")
    args = parser.parse_args()

    # Collect all annotations keyed by (avatar, category, wearable)
    all_annotations: list[tuple[str, str, str, str]] = []  # (avatar, category, wearable, rating)

    for f in args.files:
        data = json.load(f)
        # Infer avatar name from file path: output/masking/{avatar_name}/annotations.json
        avatar_name = f.name.split("/")[-2] if "/" in f.name else "unknown"
        for item_id, rating in data.items():
            category, wearable = item_id.split("/", 1)
            all_annotations.append((avatar_name, category, wearable, rating))

    if not all_annotations:
        print("No annotations found.", file=sys.stderr)
        sys.exit(1)

    # Aggregate
    by_category: dict[str, list[str]] = defaultdict(list)
    by_avatar: dict[str, list[str]] = defaultdict(list)
    all_ratings: list[str] = []

    for avatar, category, _, rating in all_annotations:
        by_category[category].append(rating)
        by_avatar[avatar].append(rating)
        all_ratings.append(rating)

    def accuracy(ratings: list[str]) -> tuple[float, int, int]:
        good = sum(1 for r in ratings if r == "good")
        return good / len(ratings), good, len(ratings)

    # Print results
    print("=" * 50)
    print("MASKING EVALUATION RESULTS")
    print("=" * 50)

    print("\nPer category:")
    for category in sorted(by_category):
        acc, good, total = accuracy(by_category[category])
        bar = "█" * int(acc * 10) + "░" * (10 - int(acc * 10))
        print(f"  {category:<12} {bar} {acc:5.0%}  ({good}/{total})")

    if len(by_avatar) > 1:
        print("\nPer avatar:")
        for avatar in sorted(by_avatar):
            acc, good, total = accuracy(by_avatar[avatar])
            print(f"  {avatar:<16} {acc:5.0%}  ({good}/{total})")

    acc, good, total = accuracy(all_ratings)
    print(f"\nOverall: {acc:.0%}  ({good}/{total})")
    print()


if __name__ == "__main__":
    main()

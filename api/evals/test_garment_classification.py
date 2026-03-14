import asyncio
from pathlib import Path
from typing import cast

import pytest

from dressme.garment_classification import GarmentClassifier
from dressme.settings import get_settings

GARMENTS_DIR = Path(__file__).parent.parent.parent / "images" / "garments"


@pytest.mark.asyncio
async def test_garment_classification(request: pytest.FixtureRequest):
    runs = cast(int, request.config.getoption("--runs"))
    concurrency = cast(int, request.config.getoption("--concurrency"))

    settings = get_settings()
    classifier = GarmentClassifier(
        api_key=settings.GEMINI_API_KEY.get_secret_value()
    )

    # Discover test cases from images/garments/{tops,bottoms}/*/*
    cases: list[tuple[str, Path]] = []
    for group_dir in sorted(GARMENTS_DIR.iterdir()):
        if not group_dir.is_dir() or group_dir.name.startswith("."):
            continue
        for category_dir in sorted(group_dir.iterdir()):
            if not category_dir.is_dir():
                continue
            expected_category = category_dir.name
            for image_path in sorted(category_dir.iterdir()):
                if image_path.is_file() and not image_path.name.startswith("."):
                    cases.append((expected_category, image_path))

    assert len(cases) > 0, f"No test cases found in {GARMENTS_DIR}"

    # Multiply by runs
    all_cases = cases * runs

    semaphore = asyncio.Semaphore(concurrency)
    results: list[tuple[str, Path, str | None]] = []

    async def classify_one(expected: str, path: Path):
        async with semaphore:
            image_data = path.read_bytes()
            predicted = await classifier.classify(image_data)
            results.append((expected, path, predicted))

    await asyncio.gather(
        *(classify_one(expected, path) for expected, path in all_cases)
    )

    # Print results
    correct = 0
    total = len(results)
    print(f"\n{'Expected':<12} {'Predicted':<12} {'OK':<4} {'Image'}")
    print("-" * 70)
    for expected, path, predicted in sorted(results, key=lambda r: (r[0], r[1].name)):
        is_correct = expected == predicted
        if is_correct:
            correct += 1
        status = "✓" if is_correct else "✗"
        print(f"{expected:<12} {str(predicted):<12} {status:<4} {path.name}")

    accuracy = correct / total * 100 if total > 0 else 0
    print(f"\nAccuracy: {correct}/{total} ({accuracy:.1f}%)")

    # Don't fail on accuracy — this is an eval, not a pass/fail test

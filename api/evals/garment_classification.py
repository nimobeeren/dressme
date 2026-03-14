"""Garment classification eval.

Classifies garment images and checks predictions against expected categories
derived from directory structure: images/garments/{group}/{category}/{image}.
"""

import asyncio
import traceback
from pathlib import Path

from dressme.eval import EvalResult, Timer
from dressme.garment_classification import GarmentClassifier
from dressme.settings import get_settings

GARMENTS_DIR = Path(__file__).parent.parent / "images" / "garments"

# Minimum accuracy to consider this eval passing
threshold = 0.8


async def run(
    runs: int = 1, concurrency: int = 10, pattern: str | None = None
) -> list[EvalResult]:
    settings = get_settings()
    classifier = GarmentClassifier(
        api_key=settings.GEMINI_API_KEY.get_secret_value()
    )

    # Discover test cases from images/garments/{group}/{category}/{image}
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
                    name = f"{expected_category}/{image_path.name}"
                    if pattern and pattern not in name:
                        continue
                    cases.append((expected_category, image_path))

    # Multiply by runs
    all_cases = cases * runs

    semaphore = asyncio.Semaphore(concurrency)
    results: list[EvalResult] = []

    async def classify_one(expected: str, path: Path) -> None:
        async with semaphore:
            with Timer() as timer:
                try:
                    image_data = path.read_bytes()
                    predicted = await classifier.classify(image_data)
                except Exception as e:
                    results.append(
                        EvalResult(
                            name=f"{expected}/{path.name}",
                            expected=expected,
                            error=f"{type(e).__name__}: {e}\n{traceback.format_exc()}",
                            duration=timer.duration,
                        )
                    )
                    return

            results.append(
                EvalResult(
                    name=f"{expected}/{path.name}",
                    expected=expected,
                    predicted=predicted,
                    duration=timer.duration,
                )
            )

    await asyncio.gather(
        *(classify_one(expected, path) for expected, path in all_cases)
    )

    return results

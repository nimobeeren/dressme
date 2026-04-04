"""Mock implementations of AI services for E2E testing.

These return real fixture images so the app behaves realistically
without hitting external AI APIs.
"""

import io
from pathlib import Path
from typing import override

from PIL import Image

from .avatar_generation import AvatarGenerator
from .wearable_categories import WearableCategory
from .wearable_classification import WearableClassifier
from .woa_generation import WoaGenerator

IMAGES_DIR = Path(__file__).resolve().parents[3] / "images"


class MockAvatarGenerator(AvatarGenerator):
    def __init__(self):
        pass  # Skip Gemini client initialization

    @override
    async def generate(self, selfie_image_data: bytes) -> bytes:
        return (IMAGES_DIR / "avatars" / "avatar_1.jpg").read_bytes()


class MockWoaGenerator(WoaGenerator):
    def __init__(self):
        pass  # Skip Replicate client initialization

    @override
    async def generate_image(
        self,
        *,
        avatar_image: bytes | str,
        wearable_image: bytes | str,
        category: str,
    ) -> bytes:
        return (IMAGES_DIR / "avatars" / "avatar_2.jpg").read_bytes()

    @override
    async def generate_mask(
        self,
        *,
        woa_image: bytes | str,
        category: str,
    ) -> bytes:
        # All-white mask so the entire image is treated as "the wearable"
        img = Image.new("RGB", (896, 1200), (255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return buf.getvalue()


class MockWearableClassifier(WearableClassifier):
    def __init__(self):
        pass  # Skip Gemini client initialization

    @override
    async def classify(self, image_data: bytes) -> WearableCategory | None:
        return "t-shirt"

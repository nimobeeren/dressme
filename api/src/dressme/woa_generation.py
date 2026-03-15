import io

import httpx
from replicate.client import Client  # type: ignore

from . import schemas
from .settings import get_settings

TOP_CATEGORIES = {"t-shirt", "shirt", "sweater", "jacket", "top"}
BOTTOM_CATEGORIES = {"pants", "shorts", "skirt"}

MASK_PROMPTS = {
    "t-shirt": "t-shirt",
    "shirt": "shirt",
    "sweater": "sweater",
    "jacket": "jacket",
    "top": "tank top",
    "pants": "pants",
    "shorts": "shorts",
    "skirt": "skirt",
}


def get_body_part(category: str) -> schemas.BodyPart:
    if category in TOP_CATEGORIES:
        return "top"
    if category in BOTTOM_CATEGORIES:
        return "bottom"
    raise ValueError(f"Unknown wearable category: {category}")


class WoaGenerator:
    def __init__(self):
        settings = get_settings()
        self._client = Client(api_token=settings.REPLICATE_API_TOKEN.get_secret_value())

    async def generate_image(
        self,
        *,
        avatar_image: bytes | str,
        wearable_image: bytes | str,
        category: str,
    ) -> bytes:
        """
        Generate a WearableOnAvatar (WOA) image — a rendering of the given
        avatar wearing the given wearable item.

        Approximate cost: $0.04 per invocation
        """
        avatar_input = (
            io.BytesIO(avatar_image)
            if isinstance(avatar_image, bytes)
            else avatar_image
        )
        wearable_input = (
            io.BytesIO(wearable_image)
            if isinstance(wearable_image, bytes)
            else wearable_image
        )
        body_part = get_body_part(category)

        woa_image_url = str(
            await self._client.async_run(
                "cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
                input={
                    "garm_img": wearable_input,
                    "human_img": avatar_input,
                    "garment_des": MASK_PROMPTS[category],
                    "category": "upper_body" if body_part == "top" else "lower_body",
                },
            )
        )

        async with httpx.AsyncClient() as client:
            response = await client.get(woa_image_url)
            response.raise_for_status()
            return response.content

    async def generate_mask(
        self,
        *,
        woa_image: bytes | str,
        category: str,
    ) -> bytes:
        """
        Generate a mask for a WOA image, isolating the wearable item
        for compositing purposes.

        Approximate cost: $0.004 per invocation
        """
        woa_input = io.BytesIO(woa_image) if isinstance(woa_image, bytes) else woa_image

        mask_results = await self._client.async_run(
            "schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c",
            input={
                "image": woa_input,
                # TODO: this prompt is very sensitive, for example "tshirt" fails every time while "t-shirt" works
                # Should probably do some classification of wearable into known working wearable types to use as prompt
                "mask_prompt": MASK_PROMPTS[category],
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
            raise ValueError("Could not get mask URL")

        async with httpx.AsyncClient() as client:
            response = await client.get(mask_image_url)
            response.raise_for_status()
            return response.content

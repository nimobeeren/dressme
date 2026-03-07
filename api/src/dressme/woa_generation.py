import io

import httpx
from replicate.client import Client  # type: ignore

from .settings import get_settings


class WoaGenerator:
    def __init__(self):
        settings = get_settings()
        self._client = Client(api_token=settings.REPLICATE_API_TOKEN.get_secret_value())

    async def generate_image(
        self,
        *,
        avatar_image: bytes | str,
        wearable_image: bytes | str,
        wearable_description: str,
        category: str,
    ) -> bytes:
        """
        Generate a WearableOnAvatar (WOA) image — a rendering of the given
        avatar wearing the given wearable item.
        """
        avatar_input = io.BytesIO(avatar_image) if isinstance(avatar_image, bytes) else avatar_image
        wearable_input = io.BytesIO(wearable_image) if isinstance(wearable_image, bytes) else wearable_image

        woa_image_url = str(
            await self._client.async_run(
                "cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
                input={
                    "garm_img": wearable_input,
                    "human_img": avatar_input,
                    "garment_des": wearable_description,
                    "category": category,
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
        wearable_description: str,
    ) -> bytes:
        """
        Generate a mask for a WOA image, isolating the wearable item
        for compositing purposes.
        """
        woa_input = io.BytesIO(woa_image) if isinstance(woa_image, bytes) else woa_image

        mask_results = await self._client.async_run(
            "schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c",
            input={
                "image": woa_input,
                # TODO: this prompt is very sensitive, for example "tshirt" fails every time while "t-shirt" works
                # Should probably do some classification of wearable into known working wearable types to use as prompt
                "mask_prompt": wearable_description,
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



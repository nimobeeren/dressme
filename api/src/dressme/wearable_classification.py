import io

from google import genai
from google.genai import types
from PIL import Image
from pydantic import BaseModel

from . import schemas


class ClassificationResult(BaseModel):
    category: schemas.WearableCategory


class WearableClassifier:
    def __init__(self, api_key: str):
        self._client = genai.Client(api_key=api_key)

    async def classify(self, image_data: bytes) -> schemas.WearableCategory:
        """Classify a wearable image into one of the known categories.

        Approximate cost: $0.0003 per invocation
        """
        image = Image.open(io.BytesIO(image_data))
        image.thumbnail((512, 512))

        response = await self._client.aio.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=[image, "classify this wearable"],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=ClassificationResult.model_json_schema(),
            ),
        )

        if response.text is None:
            raise ValueError("Response text is None")

        result = ClassificationResult.model_validate_json(response.text)
        return result.category

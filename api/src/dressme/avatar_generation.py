import io

from google import genai
from google.genai import types
from PIL import Image

from .settings import get_settings

PROMPT = """
style the person as a sims 3 character
no text/UI/diamond above the head
video game style (PS3)
not photorealistic
not cel-shaded
preserve face details
plain light-gray background
no objects other than the person
full body (head to toe)
soft lighting
medium contrast
relaxed pose with arms by side
wearing white 9" inseam shorts, white regular fit t-shirt and white socks
no shoes/accessories
facing camera
relaxed gaze
"""


class AvatarGenerator:
    def __init__(self):
        settings = get_settings()
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY.get_secret_value())

    def generate(self, selfie_image_data: bytes) -> bytes:
        """Generate a game-like avatar image from a selfie image."""
        # Downscale selfie to max 1024px longest side before sending to Gemini
        selfie_image = Image.open(io.BytesIO(selfie_image_data))
        selfie_image.thumbnail((1024, 1024))

        response = self._client.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=[selfie_image, PROMPT],
            config=types.GenerateContentConfig(
                image_config=types.ImageConfig(
                    aspect_ratio="3:4",
                    image_size="1024px",
                ),
            ),
        )

        if response.parts is None:
            raise RuntimeError("Gemini returned no parts in response")

        for part in response.parts:
            if part.inline_data is not None:
                genai_image = part.as_image()
                if genai_image is not None and genai_image.image_bytes is not None:
                    return genai_image.image_bytes

        raise RuntimeError("Gemini response did not contain an image")



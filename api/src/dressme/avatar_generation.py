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
not cell-shaded
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


def generate_avatar(selfie_image_data: bytes) -> bytes:
    """Generate a Sims 3-style game avatar from a selfie image using Gemini."""
    settings = get_settings()

    # Downscale selfie to max 1024px longest side before sending to Gemini
    selfie_image = Image.open(io.BytesIO(selfie_image_data))
    selfie_image.thumbnail((1024, 1024))

    client = genai.Client(api_key=settings.GEMINI_API_KEY.get_secret_value())
    response = client.models.generate_content(
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

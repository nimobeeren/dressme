import io
import warnings
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from PIL import Image

from .settings import get_settings

settings = get_settings()

# Mapping from file extension to MIME content type
_EXT_TO_CONTENT_TYPE: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}

# Mapping from MIME content type to canonical file extension
_CONTENT_TYPE_TO_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

# Mapping from PIL format name to canonical file extension
_PIL_FORMAT_TO_EXT: dict[str, str] = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "GIF": ".gif",
}


def read_upload(upload: UploadFile, max_size: int = settings.MAX_UPLOAD_SIZE) -> bytes:
    """Read upload contents, raising HTTP 413 if over the size limit."""
    contents = upload.file.read(max_size + 1)
    if len(contents) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Image must be smaller than {max_size // (1024 * 1024)} MB.",
        )
    return contents


def safe_open_image(
    data: bytes,
    *,
    max_pixels: int = settings.MAX_IMAGE_PIXELS,
    max_dimension: int = 2048,
) -> Image.Image:
    """Decode image data with decompression bomb protection and thumbnail to max dimension."""
    Image.MAX_IMAGE_PIXELS = max_pixels
    try:
        with warnings.catch_warnings():
            # Pillow warns on images between 1-2x MAX_IMAGE_PIXELS, we turn it into an
            # exception to have a hard limit
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            img = Image.open(io.BytesIO(data))
            img.thumbnail((max_dimension, max_dimension))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not read the uploaded file as an image.",
        )
    return img


def compress_to_jpeg(img: Image.Image, quality: int = 75) -> bytes:
    """Convert image to RGB JPEG and return the bytes."""
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return buf.getvalue()


def get_content_type_from_extension(ext: str) -> str:
    """
    Get MIME content type from a file extension.

    Args:
        ext: File extension with or without leading dot (e.g., ".jpg" or "jpg")

    Returns:
        MIME content type string (e.g., "image/jpeg")

    Raises:
        ValueError: If the extension is not recognized
    """
    # Normalize extension to lowercase with leading dot
    normalized = ext.lower() if ext.startswith(".") else f".{ext.lower()}"

    content_type = _EXT_TO_CONTENT_TYPE.get(normalized)
    if content_type is None:
        raise ValueError(f"Unknown image extension: {ext}")
    return content_type


def get_content_type_from_path(path: Path | str) -> str:
    """
    Get MIME content type from a file path.

    Args:
        path: File path to extract extension from

    Returns:
        MIME content type string (e.g., "image/jpeg")

    Raises:
        ValueError: If the extension is not recognized
    """
    path = Path(path) if isinstance(path, str) else path
    return get_content_type_from_extension(path.suffix)


def get_extension_from_content_type(content_type: str) -> str:
    """
    Get canonical file extension from a MIME content type.

    Args:
        content_type: MIME content type string (e.g., "image/jpeg")

    Returns:
        File extension with leading dot (e.g., ".jpg")

    Raises:
        ValueError: If the content type is not recognized
    """
    ext = _CONTENT_TYPE_TO_EXT.get(content_type.lower())
    if ext is None:
        raise ValueError(f"Unknown content type: {content_type}")
    return ext


def get_extension_from_pil_format(pil_format: str | None) -> str:
    """
    Get canonical file extension from a PIL image format name.

    Args:
        pil_format: PIL format name (e.g., "JPEG", "PNG") or None

    Returns:
        File extension with leading dot (e.g., ".jpg")

    Raises:
        ValueError: If the format is not recognized
    """
    if pil_format is None:
        raise ValueError("PIL format is None")

    ext = _PIL_FORMAT_TO_EXT.get(pil_format.upper())
    if ext is None:
        raise ValueError(f"Unknown PIL format: {pil_format}")
    return ext

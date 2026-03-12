"""Tests for image_utils module."""

import io
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile
from PIL import Image

from .image_utils import (
    compress_to_jpeg,
    get_content_type_from_extension,
    get_content_type_from_path,
    get_extension_from_content_type,
    get_extension_from_pil_format,
    read_upload,
    safe_open_image,
)


def _make_upload(data: bytes) -> UploadFile:
    """Create an UploadFile from raw bytes."""
    return UploadFile(file=io.BytesIO(data), filename="test.jpg")


def _make_image(width: int = 10, height: int = 10, mode: str = "RGB") -> bytes:
    """Create a minimal valid PNG image."""
    buf = io.BytesIO()
    Image.new(mode, (width, height)).save(buf, format="PNG")
    return buf.getvalue()


class TestReadUpload:
    def test_returns_contents(self):
        data = b"some image data"
        result = read_upload(_make_upload(data), max_size=1024)
        assert result == data

    def test_raises_413_when_over_limit(self):
        data = b"\x00" * 101
        with pytest.raises(HTTPException) as exc_info:
            read_upload(_make_upload(data), max_size=100)
        assert exc_info.value.status_code == 413

    def test_exact_limit_is_allowed(self):
        data = b"\x00" * 100
        result = read_upload(_make_upload(data), max_size=100)
        assert result == data


class TestSafeOpenImage:
    def test_returns_image(self):
        data = _make_image()
        img = safe_open_image(data)
        assert isinstance(img, Image.Image)

    def test_thumbnails_to_max_dimension(self):
        data = _make_image(width=200, height=100)
        img = safe_open_image(data, max_dimension=50)
        assert max(img.size) <= 50

    def test_raises_422_on_invalid_data(self):
        with pytest.raises(HTTPException) as exc_info:
            safe_open_image(b"not an image")
        assert exc_info.value.status_code == 422

    def test_raises_422_on_decompression_bomb(self):
        # 8000x8000 = 64M pixels, over the 50M default
        data = _make_image(width=8000, height=8000, mode="1")
        with pytest.raises(HTTPException) as exc_info:
            safe_open_image(data)
        assert exc_info.value.status_code == 422


class TestCompressToJpeg:
    def test_returns_jpeg_bytes(self):
        img = Image.new("RGB", (10, 10), color="red")
        result = compress_to_jpeg(img)
        # JPEG files start with FF D8 FF
        assert result[:3] == b"\xff\xd8\xff"

    def test_converts_rgba_to_rgb(self):
        img = Image.new("RGBA", (10, 10))
        result = compress_to_jpeg(img)
        assert result[:3] == b"\xff\xd8\xff"


class TestGetContentTypeFromExtension:
    def test_with_leading_dot(self):
        assert get_content_type_from_extension(".jpg") == "image/jpeg"

    def test_without_leading_dot(self):
        assert get_content_type_from_extension("png") == "image/png"

    def test_case_insensitive(self):
        assert get_content_type_from_extension(".JPG") == "image/jpeg"

    def test_unknown_extension_raises(self):
        with pytest.raises(ValueError, match="Unknown image extension"):
            get_content_type_from_extension(".bmp")


class TestGetContentTypeFromPath:
    def test_path_object(self):
        assert get_content_type_from_path(Path("/foo/bar/image.jpg")) == "image/jpeg"

    def test_string_path(self):
        assert get_content_type_from_path("/foo/bar/image.png") == "image/png"

    def test_unknown_extension_raises(self):
        with pytest.raises(ValueError, match="Unknown image extension"):
            get_content_type_from_path("/foo/bar/image.tiff")


class TestGetExtensionFromContentType:
    def test_returns_canonical_extension(self):
        # jpeg should return .jpg (canonical), not .jpeg
        assert get_extension_from_content_type("image/jpeg") == ".jpg"

    def test_case_insensitive(self):
        assert get_extension_from_content_type("IMAGE/PNG") == ".png"

    def test_unknown_content_type_raises(self):
        with pytest.raises(ValueError, match="Unknown content type"):
            get_extension_from_content_type("image/bmp")


class TestGetExtensionFromPilFormat:
    def test_returns_canonical_extension(self):
        # PIL uses "JPEG", should return .jpg
        assert get_extension_from_pil_format("JPEG") == ".jpg"

    def test_case_insensitive(self):
        assert get_extension_from_pil_format("png") == ".png"

    def test_none_raises(self):
        with pytest.raises(ValueError, match="PIL format is None"):
            get_extension_from_pil_format(None)

    def test_unknown_format_raises(self):
        with pytest.raises(ValueError, match="Unknown PIL format"):
            get_extension_from_pil_format("BMP")

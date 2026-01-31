"""Tests for image_utils module."""

from pathlib import Path

import pytest

from .image_utils import (
    get_content_type_from_extension,
    get_content_type_from_path,
    get_extension_from_content_type,
    get_extension_from_pil_format,
)


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

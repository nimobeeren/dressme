"""Blob storage module for image uploads and signed URL generation."""

import shutil
import tempfile
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import override

import boto3
from botocore.config import Config

from .settings import get_settings

settings = get_settings()


class BlobStorage(ABC):
    """Abstract interface for blob storage operations."""

    @abstractmethod
    def upload(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        """Upload data to blob storage."""
        ...

    @abstractmethod
    def download(self, bucket: str, key: str) -> bytes:
        """Download data from blob storage."""
        ...

    @abstractmethod
    def get_signed_url(self, bucket: str, key: str, expires_in: int = 3600) -> str:
        """Generate a presigned URL for accessing an object."""
        ...


class R2Storage(BlobStorage):
    """Cloudflare R2 implementation of blob storage."""

    def __init__(self):
        self._client = boto3.client(  # pyright: ignore[reportUnknownMemberType]
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL.get_secret_value(),
            aws_access_key_id=settings.S3_ACCESS_KEY_ID.get_secret_value(),
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY.get_secret_value(),
            # R2 requires region_name "auto" and signature_version "s3v4"
            # MinIO requires path-style addressing to avoid redirect issues
            region_name="auto",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )

    @override
    def upload(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        """Upload data to R2."""
        self._client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    @override
    def download(self, bucket: str, key: str) -> bytes:
        """Download data from R2."""
        response = self._client.get_object(Bucket=bucket, Key=key)
        return response["Body"].read()

    @override
    def get_signed_url(self, bucket: str, key: str, expires_in: int = 3600) -> str:
        """Generate a URL for accessing an object."""
        # In development, return a direct URL without signing
        # because MinIO has anonymous access enabled
        if settings.MODE == "development":
            # We need to replace host.docker.internal with localhost because the request
            # is coming from a browser (outside Docker)
            public_endpoint = settings.S3_ENDPOINT_URL.get_secret_value().replace(
                "host.docker.internal", "localhost"
            )
            return f"{public_endpoint}/{bucket}/{key}"

        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )


class FilesystemStorage(BlobStorage):
    """Filesystem-based blob storage for E2E testing. No external dependencies."""

    def __init__(self, base_dir: Path):
        self._base_dir = base_dir

    @override
    def upload(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        path = self._base_dir / bucket / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    @override
    def download(self, bucket: str, key: str) -> bytes:
        return (self._base_dir / bucket / key).read_bytes()

    @override
    def get_signed_url(self, bucket: str, key: str, expires_in: int = 3600) -> str:
        return "http://localhost:8000/test-static/placeholder.jpg"

    def clear(self) -> None:
        """Delete all stored files and recreate the base directory."""
        if self._base_dir.exists():
            shutil.rmtree(self._base_dir)
        self._base_dir.mkdir(parents=True)


@lru_cache
def get_blob_storage() -> BlobStorage:
    """Get a cached blob storage instance. Use as a FastAPI dependency."""
    if settings.MODE == "test":
        base_dir = Path(tempfile.mkdtemp(prefix="dressme-e2e-"))
        return FilesystemStorage(base_dir)
    return R2Storage()

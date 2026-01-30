"""Blob storage module for image uploads and signed URL generation."""

from abc import ABC, abstractmethod
from functools import lru_cache
from typing import override

import boto3
from botocore.config import Config

from .settings import get_settings


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
        settings = get_settings()
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.R2_S3_URL,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="auto",
            config=Config(signature_version="s3v4"),
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
        """Generate a presigned URL for accessing an object."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expires_in,
        )


@lru_cache
def get_blob_storage() -> BlobStorage:
    """Get a cached blob storage instance. Use as a FastAPI dependency."""
    return R2Storage()

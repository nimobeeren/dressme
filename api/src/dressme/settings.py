from functools import lru_cache
import logging
from pathlib import Path
from typing import Any, Literal

from pydantic import SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _is_running_in_docker() -> bool:
    """Check if the application is running inside a Docker container."""
    return Path("/.dockerenv").exists()


def _find_env_file() -> Path | None:
    """Find .env file in repo root (for local dev). Returns None in container."""
    try:
        # Local: api/src/dressme/settings.py -> .env
        env_path = Path(__file__).resolve().parents[3] / ".env"
        return env_path if env_path.exists() else None
    except IndexError:
        # Inside container: no .env file needed
        return None


class Settings(BaseSettings):
    MODE: Literal["development", "production"] = "production"

    # Auth0
    AUTH0_ALGORITHMS: str
    """Algorithms used to sign access tokens.
    Found in the Auth0 Dashboard → Applications → APIs → Settings → Access Token Settings."""
    AUTH0_API_AUDIENCE: str
    """Audience URL to prevent using a valid token against another API.
    Must match audience of one of the registered APIs in Auth0 Dashboard → Applications → APIs.
    Must match audience set by the client."""
    AUTH0_DOMAIN: str
    """Custom domain assigned to the Auth0 application."""
    AUTH0_ISSUER: str
    """Issuer URL of the Auth0 application.
    Typically equal to `https://<AUTH0_DOMAIN>/` (trailing slash is required)."""
    AUTH0_SEED_USER_ID: str | None = None
    """Auth0 User ID of the user who should own the data added during database seeding.
    You can find this ID in the database."""

    DATABASE_URL: SecretStr
    """PostgreSQL connection string."""

    REPLICATE_API_TOKEN: SecretStr
    """Replicate API token.
    Found in the Replicate → Account settings → API tokens."""

    # Blob Storage
    S3_ACCESS_KEY_ID: SecretStr
    """Access key ID for S3-compatible blob storage API (e.g. R2, MinIO)."""
    S3_SECRET_ACCESS_KEY: SecretStr
    """Secret access key for S3-compatible blob storage API (e.g. R2, MinIO)."""
    S3_ENDPOINT_URL: SecretStr
    """Endpoint URL for S3-compatible blob storage API (e.g. R2, MinIO)."""

    # Bucket names
    AVATARS_BUCKET: str = "dressme-avatars"
    """Bucket name for avatar images."""
    WEARABLES_BUCKET: str = "dressme-wearables"
    """Bucket name for wearable images."""
    WOA_BUCKET: str = "dressme-woa"
    """Bucket name for WearableOnAvatar images and masks."""

    @field_validator("DATABASE_URL", "S3_ENDPOINT_URL")
    @classmethod
    def transform_url_for_local(cls, secret: SecretStr, info: Any) -> SecretStr:
        """Replace host.docker.internal with localhost when running outside Docker."""
        value = secret.get_secret_value()
        if not _is_running_in_docker() and "host.docker.internal" in value:
            logging.info(
                f"Running outside Docker, replacing 'host.docker.internal' -> 'localhost' for {info.field_name}"
            )
            value = value.replace("host.docker.internal", "localhost")
        return SecretStr(value)

    model_config = SettingsConfigDict(
        extra="ignore", env_file=_find_env_file(), hide_input_in_errors=True
    )


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()  # type: ignore
    except ValidationError as e:
        # Re-raise to prevent printing sensitive values as locals
        raise RuntimeError(e)

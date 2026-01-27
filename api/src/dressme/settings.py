from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    DATABASE_URL: str
    """PostgreSQL connection string."""
    REPLICATE_API_TOKEN: str
    """Replicate API token.
    Found in the Replicate → Account settings → API tokens."""

    model_config = SettingsConfigDict(extra="ignore", env_file=_find_env_file())


@lru_cache
def get_settings():
    return Settings()  # type: ignore

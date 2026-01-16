from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_file() -> Path | None:
    """Find .env file in client/ directory (for local dev). Returns None in container."""
    try:
        # Local: api/src/dressme/settings.py -> client/.env
        env_path = Path(__file__).resolve().parents[4] / "client" / ".env"
        return env_path if env_path.exists() else None
    except IndexError:
        # Inside container: path is shorter, no .env file needed
        return None


class Settings(BaseSettings):
    AUTH0_ALGORITHMS: str
    AUTH0_API_AUDIENCE: str
    AUTH0_DOMAIN: str
    AUTH0_ISSUER: str
    AUTH0_SEED_USER_ID: str | None = None
    """Auth0 User ID of the user who should own the data added during database seeding."""
    DATABASE_URL: str
    """PostgreSQL connection string."""
    REPLICATE_API_TOKEN: str

    model_config = SettingsConfigDict(extra="ignore", env_file=_find_env_file())


@lru_cache
def get_settings():
    return Settings()  # type: ignore

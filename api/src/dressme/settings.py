from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings():
    return Settings()  # type: ignore

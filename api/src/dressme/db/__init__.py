from sqlmodel import SQLModel, create_engine

from ..settings import get_settings

# Needed for SQLModel to create tables for all models
from .models import *  # noqa: F403

settings = get_settings()

_url = settings.DATABASE_URL.get_secret_value()
_connect_args: dict[str, object] = {}
if _url.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(_url, echo=True, connect_args=_connect_args)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

from sqlmodel import SQLModel, create_engine

from ..settings import get_settings

# Needed for SQLModel to create tables for all models
from .models import *  # noqa: F403

settings = get_settings()

engine = create_engine(settings.DATABASE_URL, echo=True)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

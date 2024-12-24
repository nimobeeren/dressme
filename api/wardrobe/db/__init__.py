from sqlalchemy import text
from sqlmodel import SQLModel, create_engine

# Needed for SQLModel to create tables for all models
from .models import *  # noqa: F403

sqlite_file_name = "wardrobe.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, echo=True, connect_args=connect_args)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
    with engine.connect() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))

from sqlmodel import SQLModel, create_engine

from . import models  # noqa: F401

engine = create_engine("sqlite:///wardrobe.db", echo=True)

SQLModel.metadata.create_all(engine)

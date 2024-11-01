from sqlmodel import create_engine

from . import models  # noqa: F401

engine = create_engine("sqlite:///wardrobe.db", echo=True)

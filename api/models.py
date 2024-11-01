import uuid

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: str = Field(default=str(uuid.uuid4()), primary_key=True)
    name: str

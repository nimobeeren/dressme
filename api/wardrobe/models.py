import uuid

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str
    avatar_image_id: uuid.UUID = Field(foreign_key="avatarimage.id", index=True)


class AvatarImage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    image_data: bytes


class Wearable(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    category: str
    description: str | None
    wearable_image_id: uuid.UUID = Field(foreign_key="wearableimage.id", index=True)


class WearableImage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    image_data: bytes


class WearableOnAvatarImage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    wearable_image_id: uuid.UUID = Field(foreign_key="wearableimage.id", index=True)
    avatar_image_id: uuid.UUID = Field(foreign_key="avatarimage.id", index=True)
    image_data: bytes
    mask_image_data: bytes

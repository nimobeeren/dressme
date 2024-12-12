from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel


class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str
    avatar_image_id: UUID = Field(foreign_key="avatarimage.id", index=True)
    avatar_image: "AvatarImage" = Relationship()
    favorite_outfits: list["FavoriteOutfit"] = Relationship()


class AvatarImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    image_data: bytes


class Wearable(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    category: str
    description: str | None
    wearable_image_id: UUID = Field(foreign_key="wearableimage.id", index=True)
    wearable_image: "WearableImage" = Relationship()


class WearableImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    image_data: bytes


class WearableOnAvatarImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    wearable_image_id: UUID = Field(foreign_key="wearableimage.id", index=True)
    avatar_image_id: UUID = Field(foreign_key="avatarimage.id", index=True)
    image_data: bytes
    mask_image_data: bytes


class FavoriteOutfit(SQLModel, table=True):
    top_id: UUID = Field(foreign_key="wearable.id", primary_key=True)
    bottom_id: UUID = Field(foreign_key="wearable.id", primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", primary_key=True)

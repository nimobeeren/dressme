from uuid import UUID, uuid4

from sqlmodel import Field, Relationship, SQLModel


class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    auth0_user_id: str = Field(index=True)
    avatar_image_id: UUID = Field(foreign_key="avatarimage.id", index=True)
    avatar_image: "AvatarImage" = Relationship()
    outfits: list["Outfit"] = Relationship(back_populates="user")
    wearables: list["Wearable"] = Relationship(back_populates="user")


class AvatarImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    image_data: bytes


class Wearable(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    category: str
    description: str | None
    wearable_image_id: UUID = Field(foreign_key="wearableimage.id", index=True)
    wearable_image: "WearableImage" = Relationship()
    user_id: UUID = Field(foreign_key="user.id", index=True)
    user: "User" = Relationship(back_populates="wearables")


class WearableImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    image_data: bytes


class WearableOnAvatarImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    wearable_image_id: UUID = Field(foreign_key="wearableimage.id", index=True)
    wearable_image: "WearableImage" = Relationship()
    avatar_image_id: UUID = Field(foreign_key="avatarimage.id", index=True)
    avatar_image: "AvatarImage" = Relationship()
    image_data: bytes
    mask_image_data: bytes


class Outfit(SQLModel, table=True):
    """
    A combination of a top and bottom, created by a user.
    A user can only have one outfit with the same top and bottom.
    """

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    top_id: UUID = Field(foreign_key="wearable.id", index=True)
    top: Wearable = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Outfit.top_id"}
    )
    bottom_id: UUID = Field(foreign_key="wearable.id", index=True)
    bottom: Wearable = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Outfit.bottom_id"}
    )
    user_id: UUID = Field(foreign_key="user.id", index=True)
    user: "User" = Relationship(back_populates="outfits")

from typing import Optional
from uuid import UUID, uuid4

from sqlmodel import (
    Field,  # type: ignore
    Relationship,
    SQLModel,
)

# NOTE: Relationship foreign key ID fields (e.g., user_id) are typed as required, but
# the corresponding relationship object fields (e.g., user) are typed as optional to
# allow creation using only the ID while satisfying the type checker, requiring explicit
# checks or assertions before accessing the object's attributes later.


class User(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    auth0_user_id: str = Field(index=True)
    avatar_image_id: UUID = Field(foreign_key="avatarimage.id", index=True)
    avatar_image: Optional["AvatarImage"] = Relationship()
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
    wearable_image: Optional["WearableImage"] = Relationship()
    user_id: UUID = Field(foreign_key="user.id", index=True)
    user: Optional["User"] = Relationship(back_populates="wearables")


class WearableImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    image_data: bytes


class WearableOnAvatarImage(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    wearable_image_id: UUID = Field(foreign_key="wearableimage.id", index=True)
    wearable_image: Optional["WearableImage"] = Relationship()
    avatar_image_id: UUID = Field(foreign_key="avatarimage.id", index=True)
    avatar_image: Optional["AvatarImage"] = Relationship()
    image_data: bytes
    mask_image_data: bytes


class Outfit(SQLModel, table=True):
    """
    A combination of a top and bottom, created by a user.
    A user can only have one outfit with the same top and bottom.
    """

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    top_id: UUID = Field(foreign_key="wearable.id", index=True)
    top: Optional["Wearable"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Outfit.top_id"}
    )
    bottom_id: UUID = Field(foreign_key="wearable.id", index=True)
    bottom: Optional["Wearable"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Outfit.bottom_id"}
    )
    user_id: UUID = Field(foreign_key="user.id", index=True)
    user: Optional["User"] = Relationship(back_populates="outfits")

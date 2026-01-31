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
    auth0_user_id: str = Field(index=True, unique=True)
    avatar_image_key: str | None = Field(default=None)
    outfits: list["Outfit"] = Relationship(back_populates="user")
    wearables: list["Wearable"] = Relationship(back_populates="user")


class Wearable(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    user: Optional["User"] = Relationship(back_populates="wearables")
    category: str
    description: str | None
    image_key: str


class WearableOnAvatarImage(SQLModel, table=True):
    """
    Cached result of rendering a wearable on a user's avatar.
    Contains both the rendered image and the mask used for combining outfits.

    This model references image keys directly instead of foreign keys to User/Wearable models.
    This is intentional: the cached image becomes invalid when the underlying avatar or
    wearable image changes, so we track the specific image versions used to generate it.
    """

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    user: Optional["User"] = Relationship()
    avatar_image_key: str = Field(index=True)
    wearable_image_key: str = Field(index=True)
    image_key: str
    mask_image_key: str


class Outfit(SQLModel, table=True):
    """
    A combination of a top and bottom, created by a user.
    A user can only have one outfit with the same top and bottom.
    """

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    user: Optional["User"] = Relationship(back_populates="outfits")
    top_id: UUID = Field(foreign_key="wearable.id", index=True)
    top: Optional["Wearable"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Outfit.top_id"}
    )
    bottom_id: UUID = Field(foreign_key="wearable.id", index=True)
    bottom: Optional["Wearable"] = Relationship(
        sa_relationship_kwargs={"foreign_keys": "Outfit.bottom_id"}
    )

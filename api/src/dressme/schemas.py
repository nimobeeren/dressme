"""Schemas for API concepts."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from .wearable_categories import BodyPart, WearableCategory


class User(BaseModel):
    id: UUID
    has_selfie_image: bool
    has_avatar_image: bool


class Wearable(BaseModel):
    id: UUID
    category: WearableCategory
    body_part: BodyPart
    wearable_image_url: str
    generation_status: Literal["pending", "success"]
    """Whether a WOA image has been generated with this wearable for the current user."""


class ClassifyResponse(BaseModel):
    category: WearableCategory | None


class Outfit(BaseModel):
    id: UUID
    top: Wearable
    bottom: Wearable

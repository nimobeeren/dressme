import io
import uuid
from typing import Sequence

from fastapi import FastAPI, Response, status
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel
from sqlmodel import Session, select

from .wardrobe.combining import combine_wearables
from .wardrobe.db import engine
from .wardrobe.models import (
    AvatarImage,
    User,
    Wearable,
    WearableImage,
    WearableOnAvatarImage,
)

app = FastAPI()

# Get the first user ID for testing
with Session(engine) as session:
    user = session.exec(select(User)).first()
    current_user_id = user.id


class APIUser(BaseModel):
    id: uuid.UUID
    name: str
    avatar_image_url: str


@app.get("/users")
def get_users() -> Sequence[APIUser]:
    with Session(engine) as session:
        users = session.exec(select(User)).all()
    return [
        APIUser(
            id=u.id,
            name=u.name,
            avatar_image_url=f"/images/avatars/{u.avatar_image_id}",
        )
        for u in users
    ]


@app.get("/images/avatars/{avatar_image_id}")
def get_avatar_image(avatar_image_id: uuid.UUID, response: Response) -> bytes:
    with Session(engine) as session:
        avatar_image = session.exec(
            select(AvatarImage).where(AvatarImage.id == avatar_image_id)
        ).first()
        if avatar_image is None:
            response.status_code = status.HTTP_404_NOT_FOUND
            return response
        image = Image.open(io.BytesIO(avatar_image.image_data))
        return StreamingResponse(
            io.BytesIO(avatar_image.image_data),
            media_type=Image.MIME[image.format],
        )


class APIWearable(BaseModel):
    id: uuid.UUID
    category: str
    description: str | None
    wearable_image_url: str


@app.get("/wearables")
def get_wearables() -> Sequence[APIWearable]:
    with Session(engine) as session:
        wearables = session.exec(select(Wearable)).all()
    return [
        APIWearable(
            id=w.id,
            category=w.category,
            description=w.description,
            wearable_image_url=f"/images/wearables/{w.wearable_image_id}",
        )
        for w in wearables
    ]


@app.get("/images/wearables/{wearable_image_id}")
def get_wearable_image(wearable_image_id: uuid.UUID, response: Response) -> bytes:
    with Session(engine) as session:
        wearable_image = session.exec(
            select(WearableImage).where(WearableImage.id == wearable_image_id)
        ).first()
        if wearable_image is None:
            response.status_code = status.HTTP_404_NOT_FOUND
            return response
        image = Image.open(io.BytesIO(wearable_image.image_data))
        return StreamingResponse(
            io.BytesIO(wearable_image.image_data),
            media_type=Image.MIME[image.format],
        )


@app.get("/images/outfit")
def get_outfit(top_id: uuid.UUID, bottom_id: uuid.UUID, response: Response) -> bytes:
    with Session(engine) as session:
        user = session.exec(select(User).where(User.id == current_user_id)).one()
        avatar = session.exec(
            select(AvatarImage).where(AvatarImage.id == user.avatar_image_id)
        ).one()
        top = session.exec(select(Wearable).where(Wearable.id == top_id)).one()
        bottom = session.exec(select(Wearable).where(Wearable.id == bottom_id)).one()
        top_on_avatar = session.exec(
            select(WearableOnAvatarImage)
            .where(WearableOnAvatarImage.avatar_image_id == user.avatar_image_id)
            .where(WearableOnAvatarImage.wearable_image_id == top.wearable_image_id)
        ).first()
        bottom_on_avatar = session.exec(
            select(WearableOnAvatarImage)
            .where(WearableOnAvatarImage.avatar_image_id == user.avatar_image_id)
            .where(WearableOnAvatarImage.wearable_image_id == bottom.wearable_image_id)
        ).first()
    if top_on_avatar is None or bottom_on_avatar is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return response
    avatar_im = Image.open(io.BytesIO(avatar.image_data))
    top_im = Image.open(io.BytesIO(top_on_avatar.image_data))
    bottom_im = Image.open(io.BytesIO(bottom_on_avatar.image_data))
    top_mask_im = Image.open(io.BytesIO(top_on_avatar.mask_image_data))  # NOTE: fails if mask image data is missing

    outfit_im = combine_wearables(avatar_im, top_im, bottom_im, top_mask_im)

    outfit_buffer = io.BytesIO()
    outfit_im.save(outfit_buffer, format="JPEG")
    outfit_buffer.seek(0)
    return StreamingResponse(outfit_buffer, media_type="image/jpeg")

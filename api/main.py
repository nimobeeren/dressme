from contextlib import asynccontextmanager
import io
from uuid import UUID
from typing import Sequence

from fastapi import FastAPI, Response, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.orm import joinedload

from .wardrobe.combining import combine_wearables
from .wardrobe.db import create_db_and_tables, engine
from .wardrobe.models import (
    AvatarImage,
    FavoriteOutfit,
    User,
    Wearable,
    WearableImage,
    WearableOnAvatarImage,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()

    # Get the first user ID for testing
    with Session(engine) as session:
        global current_user_id
        current_user_id = session.exec(select(User.id)).first()

    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class APIUser(BaseModel):
    id: UUID
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
def get_avatar_image(avatar_image_id: UUID, response: Response) -> bytes:
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
    id: UUID
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
def get_wearable_image(wearable_image_id: UUID, response: Response) -> bytes:
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
def get_outfit(top_id: UUID, bottom_id: UUID, response: Response) -> bytes:
    with Session(engine) as session:
        user = session.exec(
            select(User)
            .where(User.id == current_user_id)
            .options(joinedload(User.avatar_image))
        ).one()
        top_on_avatar = session.exec(
            select(WearableOnAvatarImage)
            .join(
                WearableImage,
                WearableOnAvatarImage.wearable_image_id == WearableImage.id,
            )
            .join(Wearable, Wearable.wearable_image_id == WearableImage.id)
            .join(AvatarImage, WearableOnAvatarImage.avatar_image_id == AvatarImage.id)
            .join(User, User.avatar_image_id == AvatarImage.id)
            .where(User.id == current_user_id)
            .where(Wearable.id == top_id)
        ).first()
        bottom_on_avatar = session.exec(
            select(WearableOnAvatarImage)
            .join(
                WearableImage,
                WearableOnAvatarImage.wearable_image_id == WearableImage.id,
            )
            .join(Wearable, Wearable.wearable_image_id == WearableImage.id)
            .join(AvatarImage, WearableOnAvatarImage.avatar_image_id == AvatarImage.id)
            .join(User, User.avatar_image_id == AvatarImage.id)
            .where(User.id == current_user_id)
            .where(Wearable.id == bottom_id)
        ).first()
    if top_on_avatar is None or bottom_on_avatar is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return response
    avatar_im = Image.open(io.BytesIO(user.avatar_image.image_data))
    top_im = Image.open(io.BytesIO(top_on_avatar.image_data))
    bottom_im = Image.open(io.BytesIO(bottom_on_avatar.image_data))
    top_mask_im = Image.open(io.BytesIO(top_on_avatar.mask_image_data))

    outfit_im = combine_wearables(avatar_im, top_im, bottom_im, top_mask_im)

    outfit_buffer = io.BytesIO()
    outfit_im.save(outfit_buffer, format="JPEG")
    outfit_buffer.seek(0)
    return StreamingResponse(outfit_buffer, media_type="image/jpeg")


# TODO: enforce foreign key constraints, i.e. ensure that top and bottom wearables exist before adding favorite
@app.post("/favorite_outfits")
def add_favorite_outfit(top_id: UUID, bottom_id: UUID, response: Response):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.id == current_user_id)).one()
        existing = session.exec(
            select(FavoriteOutfit)
            .where(FavoriteOutfit.top_id == top_id)
            .where(FavoriteOutfit.bottom_id == bottom_id)
            .where(FavoriteOutfit.user_id == user.id)
        ).one_or_none()
        if existing:
            response.status_code = status.HTTP_200_OK
            return response
        else:
            user.favorite_outfits.append(
                FavoriteOutfit(top_id=top_id, bottom_id=bottom_id, user_id=user.id)
            )
            session.add(user)
            session.commit()
            response.status_code = status.HTTP_201_CREATED
            return response


@app.delete("/favorite_outfits")
def remove_favorite_outfit(top_id: UUID, bottom_id: UUID, response: Response):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.id == current_user_id)).one()
        outfit = session.exec(
            select(FavoriteOutfit)
            .where(FavoriteOutfit.top_id == top_id)
            .where(FavoriteOutfit.bottom_id == bottom_id)
            .where(FavoriteOutfit.user_id == user.id)
        ).one_or_none()
        if outfit is None:
            response.status_code = status.HTTP_404_NOT_FOUND
            return response
        else:
            session.delete(outfit)
            session.commit()
            response.status_code = status.HTTP_200_OK
            return response

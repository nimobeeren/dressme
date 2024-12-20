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


class APIFavoriteOutfit(BaseModel):
    top: APIWearable
    bottom: APIWearable


@app.get("/favorite_outfits")
def get_favorite_outfits() -> Sequence[APIFavoriteOutfit]:
    with Session(engine) as session:
        outfits = session.exec(
            select(FavoriteOutfit)
            .where(FavoriteOutfit.user_id == current_user_id)
            .options(joinedload(FavoriteOutfit.top))
            .options(joinedload(FavoriteOutfit.bottom))
        ).all()

    # Map wearable image IDs to URLs
    api_favorite_outfits = []
    for outfit in outfits:
        top = APIWearable(
            id=outfit.top.id,
            category=outfit.top.category,
            description=outfit.top.description,
            wearable_image_url=f"/images/wearables/{outfit.top.wearable_image_id}",
        )
        bottom = APIWearable(
            id=outfit.bottom.id,
            category=outfit.bottom.category,
            description=outfit.bottom.description,
            wearable_image_url=f"/images/wearables/{outfit.bottom.wearable_image_id}",
        )
        api_favorite_outfits.append(APIFavoriteOutfit(top=top, bottom=bottom))
    return api_favorite_outfits


@app.post("/favorite_outfits")
def add_favorite_outfit(top_id: UUID, bottom_id: UUID, response: Response):
    with Session(engine) as session:
        # Ensure that the top and bottom wearables exist
        top = session.exec(select(Wearable).where(Wearable.id == top_id)).one_or_none()
        if top is None:
            response.status_code = status.HTTP_404_NOT_FOUND
            return response
        if top.category != "upper_body":
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"error": {"message": "Top wearable must have category 'upper_body'"}}

        bottom = session.exec(
            select(Wearable).where(Wearable.id == bottom_id)
        ).one_or_none()
        if bottom is None:
            response.status_code = status.HTTP_404_NOT_FOUND
            return response
        if bottom.category != "lower_body":
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"error": {"message": "Bottom wearable must have category 'lower_body'"}}

        # Check if the outfit is already a favorite
        user = session.exec(select(User).where(User.id == current_user_id)).one()
        existing = session.exec(
            select(FavoriteOutfit)
            .where(FavoriteOutfit.top_id == top_id)
            .where(FavoriteOutfit.bottom_id == bottom_id)
            .where(FavoriteOutfit.user_id == user.id)
        ).one_or_none()

        if existing:
            # Do nothing if the outfit is already a favorite
            response.status_code = status.HTTP_200_OK
            return response
        else:
            # Add the outfit to the user's favorites
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
        # Check if the outfit is a favorite
        user = session.exec(select(User).where(User.id == current_user_id)).one()
        outfit = session.exec(
            select(FavoriteOutfit)
            .where(FavoriteOutfit.top_id == top_id)
            .where(FavoriteOutfit.bottom_id == bottom_id)
            .where(FavoriteOutfit.user_id == user.id)
        ).one_or_none()

        if outfit is None:
            # Do nothing if the outfit is not a favorite
            response.status_code = status.HTTP_404_NOT_FOUND
            return response
        else:
            # Remove the outfit from the user's favorites
            session.delete(outfit)
            session.commit()
            response.status_code = status.HTTP_200_OK
            return response

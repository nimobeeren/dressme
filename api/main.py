from contextlib import asynccontextmanager
import io
from uuid import UUID
from typing import Sequence

from fastapi import FastAPI, Response, status
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from fastapi.routing import APIRoute
from pydantic import BaseModel
from sqlmodel import Session, select
from sqlalchemy.orm import joinedload

from .wardrobe.combining import combine_wearables
from .wardrobe.db import create_db_and_tables, engine
from .wardrobe.models import (
    AvatarImage,
    Outfit,
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


def custom_generate_unique_id(route: APIRoute):
    # NOTE: this means route names (the name of the function decorated with @app.<method>) must be unique
    return route.name


app = FastAPI(lifespan=lifespan, generate_unique_id_function=custom_generate_unique_id)

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
def get_avatar_image(avatar_image_id: UUID) -> bytes:
    with Session(engine) as session:
        avatar_image = session.exec(
            select(AvatarImage).where(AvatarImage.id == avatar_image_id)
        ).first()
        if avatar_image is None:
            return Response(status_code=status.HTTP_404_NOT_FOUND)
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
def get_wearable_image(wearable_image_id: UUID) -> bytes:
    with Session(engine) as session:
        wearable_image = session.exec(
            select(WearableImage).where(WearableImage.id == wearable_image_id)
        ).first()
        if wearable_image is None:
            return Response(status_code=status.HTTP_404_NOT_FOUND)
        image = Image.open(io.BytesIO(wearable_image.image_data))
        return StreamingResponse(
            io.BytesIO(wearable_image.image_data),
            media_type=Image.MIME[image.format],
        )


@app.get("/images/outfit")
def get_outfit(top_id: UUID, bottom_id: UUID) -> bytes:
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
        return Response(status_code=status.HTTP_404_NOT_FOUND)
    avatar_im = Image.open(io.BytesIO(user.avatar_image.image_data))
    top_im = Image.open(io.BytesIO(top_on_avatar.image_data))
    bottom_im = Image.open(io.BytesIO(bottom_on_avatar.image_data))
    top_mask_im = Image.open(io.BytesIO(top_on_avatar.mask_image_data))

    outfit_im = combine_wearables(avatar_im, top_im, bottom_im, top_mask_im)

    outfit_buffer = io.BytesIO()
    outfit_im.save(outfit_buffer, format="JPEG")
    outfit_buffer.seek(0)
    return StreamingResponse(outfit_buffer, media_type="image/jpeg")


class APIOutfit(BaseModel):
    id: UUID
    top: APIWearable
    bottom: APIWearable


@app.get("/outfits")
def get_outfits() -> Sequence[APIOutfit]:
    with Session(engine) as session:
        outfits = session.exec(
            select(Outfit)
            .where(Outfit.user_id == current_user_id)
            .options(joinedload(Outfit.top))
            .options(joinedload(Outfit.bottom))
        ).all()

    # Map wearable image IDs to URLs
    api_outfits = []
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
        api_outfits.append(APIOutfit(id=outfit.id, top=top, bottom=bottom))
    return api_outfits


@app.post("/outfits")
def add_outfit(top_id: UUID, bottom_id: UUID):
    with Session(engine) as session:
        # Ensure that the top and bottom wearables exist
        top = session.exec(select(Wearable).where(Wearable.id == top_id)).one_or_none()
        if top is None:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={
                    "error": {
                        "message": f"Wearable with ID '${top_id}' does not exist."
                    }
                },
            )
        if top.category != "upper_body":
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": {
                        "message": "Top wearable must have category 'upper_body'."
                    }
                },
            )

        bottom = session.exec(
            select(Wearable).where(Wearable.id == bottom_id)
        ).one_or_none()
        if bottom is None:
            return JSONResponse(
                status_code=status.HTTP_404_NOT_FOUND,
                content={
                    "error": {
                        "message": f"Wearable with ID '${bottom_id}' does not exist."
                    }
                },
            )
        if bottom.category != "lower_body":
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": {
                        "message": "Bottom wearable must have category 'lower_body'"
                    }
                },
            )

        # Check if the outfit already exists
        user = session.exec(select(User).where(User.id == current_user_id)).one()
        existing = session.exec(
            select(Outfit)
            .where(Outfit.top_id == top_id)
            .where(Outfit.bottom_id == bottom_id)
            .where(Outfit.user_id == user.id)
        ).one_or_none()

        if existing:
            # Do nothing if the outfit already exists
            return Response(status_code=status.HTTP_200_OK)
        else:
            # Create the outfit
            user.outfits.append(
                Outfit(top_id=top_id, bottom_id=bottom_id, user_id=user.id)
            )
            session.add(user)
            session.commit()
            return Response(status_code=status.HTTP_201_CREATED)


@app.delete("/outfits", responses={200: {"content": None}, 404: {}})
def remove_outfit(id: UUID):
    with Session(engine) as session:
        # Check if the outfit exists and is owned by the current user
        outfit = session.exec(
            select(Outfit)
            .where(Outfit.id == id)
            .where(Outfit.user_id == current_user_id)
        ).one_or_none()

        if outfit is None:
            # Do nothing if the outfit does not exist or is not owned by the current user
            return Response(status_code=status.HTTP_404_NOT_FOUND)
        else:
            # Delete the outfit
            session.delete(outfit)
            session.commit()
            return Response(status_code=status.HTTP_200_OK)

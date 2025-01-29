import io
from contextlib import asynccontextmanager
from typing import Annotated, Sequence
from uuid import UUID

from fastapi import FastAPI, File, Form, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRoute
from PIL import Image
from pydantic import BaseModel
import requests
from sqlalchemy.orm import joinedload
from sqlmodel import Session, select
from pydantic_settings import BaseSettings, SettingsConfigDict
from replicate.client import Client

from .wardrobe import db
from .wardrobe.combining import combine_wearables


class Settings(BaseSettings):
    REPLICATE_API_TOKEN: str

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
replicate = Client(api_token=settings.REPLICATE_API_TOKEN)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.create_db_and_tables()

    # Get the first user ID for testing
    with Session(db.engine) as session:
        global current_user_id
        current_user_id = session.exec(select(db.User.id)).first()

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


class User(BaseModel):
    id: UUID
    name: str
    avatar_image_url: str


@app.get("/users")
def get_users() -> Sequence[User]:
    with Session(db.engine) as session:
        users = session.exec(select(db.User)).all()
    return [
        User(
            id=u.id,
            name=u.name,
            avatar_image_url=f"/images/avatars/{u.avatar_image_id}",
        )
        for u in users
    ]


@app.get("/images/avatars/{avatar_image_id}")
def get_avatar_image(avatar_image_id: UUID) -> bytes:
    with Session(db.engine) as session:
        avatar_image = session.exec(
            select(db.AvatarImage).where(db.AvatarImage.id == avatar_image_id)
        ).first()
        if avatar_image is None:
            return Response(status_code=status.HTTP_404_NOT_FOUND)
        image = Image.open(io.BytesIO(avatar_image.image_data))
        return StreamingResponse(
            io.BytesIO(avatar_image.image_data),
            media_type=Image.MIME[image.format],
        )


class Wearable(BaseModel):
    id: UUID
    category: str
    description: str | None
    wearable_image_url: str


@app.get("/wearables")
def get_wearables() -> Sequence[Wearable]:
    with Session(db.engine) as session:
        wearables = session.exec(select(db.Wearable)).all()
    return [
        Wearable(
            id=w.id,
            category=w.category,
            description=w.description,
            wearable_image_url=f"/images/wearables/{w.wearable_image_id}",
        )
        for w in wearables
    ]


@app.get("/images/wearables/{wearable_image_id}")
def get_wearable_image(wearable_image_id: UUID) -> bytes:
    with Session(db.engine) as session:
        wearable_image = session.exec(
            select(db.WearableImage).where(db.WearableImage.id == wearable_image_id)
        ).first()
        if wearable_image is None:
            return Response(status_code=status.HTTP_404_NOT_FOUND)
        image = Image.open(io.BytesIO(wearable_image.image_data))
        return StreamingResponse(
            io.BytesIO(wearable_image.image_data),
            media_type=Image.MIME[image.format],
        )


@app.post("/wearables")
def create_wearable(
    category: Annotated[str, Form()],
    description: Annotated[str | None, Form()],
    image: Annotated[UploadFile, File()],
):
    with Session(db.engine) as session:
        user = session.exec(select(db.User).where(db.User.id == current_user_id)).one()

        wearable_image = db.WearableImage(image_data=image.file.read())
        session.add(wearable_image)

        wearable = db.Wearable(
            category=category,
            description=description,
            wearable_image=wearable_image,
        )
        session.add(wearable)

        woa_image_url = replicate.run(
            "cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
            input={
                "garm_img": io.BytesIO(wearable_image.image_data),
                "human_img": io.BytesIO(user.avatar_image.image_data),
                # LEFT HERE
                # TODO: save avatar mask, then use it here
                # "mask_img": open(
                #     avatar_mask_top_path
                #     if category == "upper_body"
                #     else avatar_mask_bottom_path,
                #     "rb",
                # ),
                "garment_des": description or "",
                "category": category,
            },
        )
        woa_image_response = requests.get(woa_image_url, stream=True)
        woa_image_response.raise_for_status()

        woa = db.WearableOnAvatarImage(
            avatar_image=user.avatar_image,
            wearable_image=wearable_image,
            image_data=woa_image_response.content,
            mask_image_data=b"",  # TODO: post masking
        )
        session.add(woa)

        session.commit()

    return Response(status_code=status.HTTP_201_CREATED)


@app.get("/images/outfit")
def get_outfit(top_id: UUID, bottom_id: UUID) -> bytes:
    with Session(db.engine) as session:
        user = session.exec(
            select(db.User)
            .where(db.User.id == current_user_id)
            .options(joinedload(db.User.avatar_image))
        ).one()
        top_on_avatar = session.exec(
            select(db.WearableOnAvatarImage)
            .join(
                db.WearableImage,
                db.WearableOnAvatarImage.wearable_image_id == db.WearableImage.id,
            )
            .join(db.Wearable, db.Wearable.wearable_image_id == db.WearableImage.id)
            .join(
                db.AvatarImage,
                db.WearableOnAvatarImage.avatar_image_id == db.AvatarImage.id,
            )
            .join(db.User, db.User.avatar_image_id == db.AvatarImage.id)
            .where(db.User.id == current_user_id)
            .where(db.Wearable.id == top_id)
        ).first()
        bottom_on_avatar = session.exec(
            select(db.WearableOnAvatarImage)
            .join(
                db.WearableImage,
                db.WearableOnAvatarImage.wearable_image_id == db.WearableImage.id,
            )
            .join(db.Wearable, db.Wearable.wearable_image_id == db.WearableImage.id)
            .join(
                db.AvatarImage,
                db.WearableOnAvatarImage.avatar_image_id == db.AvatarImage.id,
            )
            .join(db.User, db.User.avatar_image_id == db.AvatarImage.id)
            .where(db.User.id == current_user_id)
            .where(db.Wearable.id == bottom_id)
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


class Outfit(BaseModel):
    id: UUID
    top: Wearable
    bottom: Wearable


@app.get("/outfits")
def get_outfits() -> Sequence[Outfit]:
    with Session(db.engine) as session:
        outfits = session.exec(
            select(db.Outfit)
            .where(db.Outfit.user_id == current_user_id)
            .options(joinedload(db.Outfit.top))
            .options(joinedload(db.Outfit.bottom))
        ).all()

    # Map wearable image IDs to URLs
    api_outfits = []
    for outfit in outfits:
        top = Wearable(
            id=outfit.top.id,
            category=outfit.top.category,
            description=outfit.top.description,
            wearable_image_url=f"/images/wearables/{outfit.top.wearable_image_id}",
        )
        bottom = Wearable(
            id=outfit.bottom.id,
            category=outfit.bottom.category,
            description=outfit.bottom.description,
            wearable_image_url=f"/images/wearables/{outfit.bottom.wearable_image_id}",
        )
        api_outfits.append(Outfit(id=outfit.id, top=top, bottom=bottom))
    return api_outfits


@app.post("/outfits")
def add_outfit(top_id: UUID, bottom_id: UUID):
    with Session(db.engine) as session:
        # Ensure that the top and bottom wearables exist
        top = session.exec(
            select(db.Wearable).where(db.Wearable.id == top_id)
        ).one_or_none()
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
            select(db.Wearable).where(db.Wearable.id == bottom_id)
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
        user = session.exec(select(db.User).where(db.User.id == current_user_id)).one()
        existing = session.exec(
            select(db.Outfit)
            .where(db.Outfit.top_id == top_id)
            .where(db.Outfit.bottom_id == bottom_id)
            .where(db.Outfit.user_id == user.id)
        ).one_or_none()

        if existing:
            # Do nothing if the outfit already exists
            return Response(status_code=status.HTTP_200_OK)
        else:
            # Create the outfit
            user.outfits.append(
                db.Outfit(top_id=top_id, bottom_id=bottom_id, user_id=user.id)
            )
            session.add(user)
            session.commit()
            return Response(status_code=status.HTTP_201_CREATED)


@app.delete("/outfits")
def remove_outfit(id: UUID):
    with Session(db.engine) as session:
        # Check if the outfit exists and is owned by the current user
        outfit = session.exec(
            select(db.Outfit)
            .where(db.Outfit.id == id)
            .where(db.Outfit.user_id == current_user_id)
        ).one_or_none()

        if outfit is None:
            # Do nothing if the outfit does not exist or is not owned by the current user
            return Response(status_code=status.HTTP_404_NOT_FOUND)
        else:
            # Delete the outfit
            session.delete(outfit)
            session.commit()
            return Response(status_code=status.HTTP_200_OK)

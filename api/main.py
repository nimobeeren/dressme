import io
from contextlib import asynccontextmanager
from typing import Annotated, Literal, Sequence
from uuid import UUID

import requests
from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.routing import APIRoute
from PIL import Image
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from replicate.client import Client
from sqlalchemy.orm import joinedload
from sqlmodel import Session, select

from .wardrobe import db
from .wardrobe.combining import combine_wearables


class Settings(BaseSettings):
    REPLICATE_API_TOKEN: str

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
replicate = Client(api_token=settings.REPLICATE_API_TOKEN)


def get_session():
    with Session(db.engine) as session:
        yield session


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
def get_users(*, session: Session = Depends(get_session)) -> Sequence[User]:
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
def get_avatar_image(
    *, avatar_image_id: UUID, session: Session = Depends(get_session)
) -> bytes:
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
    generation_status: Literal["pending", "completed"]
    """Whether a WOA image has been generated with this wearable for the current user."""


@app.get("/wearables")
def get_wearables(*, session: Session = Depends(get_session)) -> Sequence[Wearable]:
    # Subquery to get WearableOnAvatar (WOA) images associated with the avatar image of the current user
    woa_image_subquery = (
        select(db.WearableOnAvatarImage)
        .join(
            db.User,
            db.WearableOnAvatarImage.avatar_image_id == db.User.avatar_image_id,
        )
        .where(db.User.id == current_user_id)
        .subquery()
    )

    # Get all wearables and the associated WearableOnAvatarImage (or None)
    results = session.exec(
        select(db.Wearable, woa_image_subquery.columns.id).outerjoin(
            woa_image_subquery,
            db.Wearable.wearable_image_id
            == woa_image_subquery.columns.wearable_image_id,
        )
    ).all()

    return [
        Wearable(
            id=wearable.id,
            category=wearable.category,
            description=wearable.description,
            wearable_image_url=f"/images/wearables/{wearable.wearable_image_id}",
            generation_status="pending" if woa_image_id is None else "completed",
        )
        for wearable, woa_image_id in results
    ]


@app.get("/images/wearables/{wearable_image_id}")
def get_wearable_image(
    *, wearable_image_id: UUID, session: Session = Depends(get_session)
) -> bytes:
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


def create_woa_image(*, wearable_id: UUID):
    """
    Creates an image of the current user's avatar wearing a given wearable.

    This image is called a WearableOnAvatar (WOA) image. It is generated using AI models.
    This method is intended to be used as a FastAPI background task.
    """
    # NOTE: could use a factory method as a dependency to make this easier to override in tests, like this:
    # def get_session_factory():
    # """
    # Factory version of `get_session` for cases where the session is still needed after the path
    # operation has completed.

    # This is useful for background tasks which need the session, since they can't hook into FastAPI's
    # dependency system by themselves. By using this method as a dependency, we can still override it
    # in tests.
    # """
    # return lambda: Session(db.engine)

    with Session(db.engine) as session:
        print("Starting WOA generation")
        user = session.exec(select(db.User).where(db.User.id == current_user_id)).one()
        wearable = session.exec(
            select(db.Wearable).where(db.Wearable.id == wearable_id)
        ).one()

        # Generate an image of the avatar wearing the wearable
        print("Generating WOA image")
        woa_image_url = replicate.run(
            "cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
            input={
                "garm_img": io.BytesIO(wearable.wearable_image.image_data),
                "human_img": io.BytesIO(user.avatar_image.image_data),
                "garment_des": wearable.description or "",
                "category": wearable.category,
            },
        )

        # Get a mask of the wearable on the avatar using an image segmentation model
        print("Generating mask")
        mask_results = replicate.run(
            "schananas/grounded_sam:ee871c19efb1941f55f66a3d7d960428c8a5afcb77449547fe8e5a3ab9ebc21c",
            input={
                "image": woa_image_url,
                # TODO: this prompt is very sensitive, for example "tshirt" fails every time while "t-shirt" works
                # Should probably do some classification of wearable into known working wearable types to use as prompt
                "mask_prompt": wearable.description or "",
                "negative_mask_prompt": "",
                "adjustment_factor": 0,
            },
        )
        mask_image_url = None
        for result in mask_results:
            # Results contains some other stuff, we only want the regular mask
            if result.endswith("/mask.jpg"):
                mask_image_url = result
                break
        if mask_image_url is None:
            raise ValueError("Could not get mask URL")

        print("Fetching results")
        woa_image_response = requests.get(woa_image_url, stream=True)
        woa_image_response.raise_for_status()

        mask_image_response = requests.get(mask_image_url, stream=True)
        mask_image_response.raise_for_status()

        print("Saving results to DB")
        woa_image = db.WearableOnAvatarImage(
            avatar_image=user.avatar_image,
            wearable_image=wearable.wearable_image,
            image_data=woa_image_response.content,
            mask_image_data=mask_image_response.content,
        )
        session.add(woa_image)
        session.commit()
        print("Finished generating WOA image")


@app.post("/wearables", status_code=status.HTTP_201_CREATED)
def create_wearables(
    *,
    category: Annotated[list[Annotated[str, Field(min_length=1)]], Form()],
    # Description should be optional, but we can't accept it due to the way sending values in form
    # data works. If a client were to omit the description field on one item but not the others,
    # there would be no way to know which item the null description belongs to.
    description: Annotated[list[str], Form()],
    image: Annotated[list[UploadFile], File()],
    session: Session = Depends(get_session),
    background_tasks: BackgroundTasks,
) -> list[Wearable]:
    """
    Create one or more wearables.

    Multiple wearables can be created in one request by passing fields multiple times with the same
    name. All fields must appear the same number of times. The description can be set to an empty
    string if you want to omit it.
    """
    if not len(category) == len(description) == len(image):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "message": "The category, description and image fields should all occur the same number of times."
                }
            },
        )

    wearables: list[db.Wearable] = []
    for item_category, item_description, item_image in zip(
        category, description, image, strict=True
    ):
        wearable_image = db.WearableImage(image_data=item_image.file.read())
        session.add(wearable_image)

        wearable = db.Wearable(
            category=item_category,
            description=item_description if item_description != "" else None,
            wearable_image=wearable_image,
        )
        wearables.append(wearable)
        session.add(wearable)

    session.commit()

    # Create WearableOnAvatar (WOA) images
    # Do this after DB commit to ensure the wearables exist
    for wearable in wearables:
        # TODO: background tasks currently run sequentially, so this will be slow for many wearables
        # FastAPI does not support concurrent background tasks yet: https://github.com/fastapi/fastapi/discussions/10682
        background_tasks.add_task(create_woa_image, wearable_id=wearable.id)

    return [
        Wearable(
            id=wearable.id,
            category=wearable.category,
            description=wearable.description,
            wearable_image_url=f"/images/wearables/{wearable.wearable_image_id}",
            generation_status="pending",  # since the generation of the WOA image happens in the background
        )
        for wearable in wearables
    ]


@app.get("/images/outfit")
def get_outfit(
    *, top_id: UUID, bottom_id: UUID, session: Session = Depends(get_session)
) -> bytes:
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
def get_outfits(*, session: Session = Depends(get_session)) -> Sequence[Outfit]:
    # Get wearable image IDs for which a WOA image exists and which belong to the current user
    woa_images = session.exec(
        select(db.WearableOnAvatarImage)
        .join(
            db.User,
            db.WearableOnAvatarImage.avatar_image_id == db.User.avatar_image_id,
        )
        .where(db.User.id == current_user_id)
    ).all()
    completed_ids = {woa.wearable_image_id for woa in woa_images}

    # Fetch outfits along with the top and bottom wearables
    outfits = session.exec(
        select(db.Outfit)
        .where(db.Outfit.user_id == current_user_id)
        .options(joinedload(db.Outfit.top))
        .options(joinedload(db.Outfit.bottom))
    ).all()

    api_outfits = []
    for outfit in outfits:
        top_status = (
            "completed" if outfit.top.wearable_image_id in completed_ids else "pending"
        )
        bottom_status = (
            "completed"
            if outfit.bottom.wearable_image_id in completed_ids
            else "pending"
        )

        top = Wearable(
            id=outfit.top.id,
            category=outfit.top.category,
            description=outfit.top.description,
            wearable_image_url=f"/images/wearables/{outfit.top.wearable_image_id}",
            generation_status=top_status,
        )
        bottom = Wearable(
            id=outfit.bottom.id,
            category=outfit.bottom.category,
            description=outfit.bottom.description,
            wearable_image_url=f"/images/wearables/{outfit.bottom.wearable_image_id}",
            generation_status=bottom_status,
        )
        api_outfits.append(Outfit(id=outfit.id, top=top, bottom=bottom))
    return api_outfits


@app.post("/outfits")
def create_outfit(
    *, top_id: UUID, bottom_id: UUID, session: Session = Depends(get_session)
):
    # Ensure that the top and bottom wearables exist
    top = session.exec(
        select(db.Wearable).where(db.Wearable.id == top_id)
    ).one_or_none()
    if top is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": {"message": f"Wearable with ID '${top_id}' does not exist."}
            },
        )
    if top.category != "upper_body":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": {"message": "Top wearable must have category 'upper_body'."}
            },
        )

    bottom = session.exec(
        select(db.Wearable).where(db.Wearable.id == bottom_id)
    ).one_or_none()
    if bottom is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "error": {"message": f"Wearable with ID '${bottom_id}' does not exist."}
            },
        )
    if bottom.category != "lower_body":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error": {"message": "Bottom wearable must have category 'lower_body'"}
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
def delete_outfit(*, id: UUID, session: Session = Depends(get_session)):
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

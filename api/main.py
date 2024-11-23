import io
import uuid
from typing import Sequence

from fastapi import FastAPI, Response, status
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel
from sqlmodel import Session, select

from .wardrobe.combining import combine_garments
from .wardrobe.db import engine
from .wardrobe.models import AvatarImage, User, Wearable, WearableImage

app = FastAPI()


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
def get_outfit(top: str, bottom: str) -> bytes:
    human = "nimo"

    human_im = Image.open("../images/humans/nimo_underwear.jpg")
    print(human_im.format, human_im.size, human_im.mode)

    result_top_im = Image.open(f"../images/results/{human}/single/{top}.jpg")
    print(result_top_im.format, result_top_im.size, result_top_im.mode)

    result_bottom_im = Image.open(f"../images/results/{human}/single/{bottom}.jpg")
    print(result_bottom_im.format, result_bottom_im.size, result_bottom_im.mode)

    mask_top_im = Image.open(f"../images/masks/{human}/post/{top}.jpg").convert("L")
    print(mask_top_im.format, mask_top_im.size, mask_top_im.mode)

    im = combine_garments(human_im, result_top_im, result_bottom_im, mask_top_im)
    im.save(f"../images/results/{human}/multi/{top}._{bottom}.jpg")
    im

    img_byte_arr = io.BytesIO()
    im.save(img_byte_arr, format="JPEG")
    img_byte_arr.seek(0)
    return StreamingResponse(img_byte_arr, media_type="image/jpeg")

import io
import uuid

from fastapi import FastAPI, Response, status
from fastapi.responses import StreamingResponse
from PIL import Image
from sqlmodel import Session, select

from .wardrobe.combining import combine_garments
from .wardrobe.db import engine
from .wardrobe.models import User, Wearable, WearableImage

app = FastAPI()


@app.get("/users")
def get_users():
    with Session(engine) as session:
        users = list(session.exec(select(User)))
    return users


@app.get("/wearables")
def get_wearables():
    with Session(engine) as session:
        wearables = session.exec(select(Wearable)).all()
    return wearables


@app.get("/images/wearable_images/{wearable_image_id}")
def get_wearable_image(wearable_image_id: str, response: Response):
    with Session(engine) as session:
        wearable_image = session.exec(
            select(WearableImage).where(
                WearableImage.id == uuid.UUID(wearable_image_id)
            )
        ).first()
        if wearable_image is None:
            response.status_code = status.HTTP_404_NOT_FOUND
            return
        return StreamingResponse(
            io.BytesIO(wearable_image.image_data), media_type="image/jpeg"
        )


@app.get("/images/outfit")
def get_outfit(top: str, bottom: str):
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

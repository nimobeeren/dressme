import io

from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from PIL import Image

from .combining import combine_garments

app = FastAPI()


@app.get("/outfit.jpg")
def get_outfit(top: str, bottom: str):
    human = Image.open("../images/humans/model.jpg")
    print(human.format, human.size, human.mode)

    mask_bottom = Image.open("../images/masks/bottom.jpg")
    print(mask_bottom.format, mask_bottom.size, mask_bottom.mode)

    mask_top = Image.open("../images/masks/top.jpg")
    print(mask_top.format, mask_top.size, mask_top.mode)

    result_bottom = Image.open(f"../images/results/single/{bottom}.jpg")
    print(result_bottom.format, result_bottom.size, result_bottom.mode)

    result_top = Image.open(f"../images/results/single/{top}.jpg")
    print(result_top.format, result_top.size, result_top.mode)

    im = combine_garments(human, result_top, result_bottom, mask_top, mask_bottom)

    img_byte_arr = io.BytesIO()
    im.save(img_byte_arr, format="JPEG")
    img_byte_arr.seek(0)
    return StreamingResponse(img_byte_arr, media_type="image/jpeg")

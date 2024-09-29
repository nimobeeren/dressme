from fastapi import FastAPI
from fastapi.responses import FileResponse

app = FastAPI()

@app.get("/outfit.jpg")
def get_outfit(top: str, bottom: str):
    return FileResponse(f'../images/results/multi/{top}_{bottom}.jpg', media_type='image/jpeg')

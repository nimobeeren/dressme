from pathlib import Path
from sqlmodel import Session

from .db import engine
from .models import Wearable, WearableImage

humans = {
    "model": {"name": "model", "image_path": "../../images/humans/model.jpg"},
    "nimo": {"name": "nimo", "image_path": "../../images/humans/nimo_underwear.jpg"},
}

garments = {
    "tshirt": {
        "name": "tshirt",
        "description": "purple t-shirt",
        "category": "upper_body",
        "image_path": "../../images/garments/tops/tshirt.webp",
    },
    "sweater": {
        "name": "sweater",
        "description": "oversized pink sweater",
        "category": "upper_body",
        "image_path": "../../images/garments/tops/sweater.jpg",
    },
    "striped_sweater": {
        "name": "striped_sweater",
        "description": "black and white striped sweater",
        "category": "upper_body",
        "image_path": "../../images/garments/tops/striped_sweater.webp",
    },
    "winter_coat": {
        "name": "winter_coat",
        "description": "winter coat with fur lined hood",
        "category": "upper_body",
        "image_path": "../../images/garments/tops/winter_coat.webp",
    },
    "raincoat": {
        "name": "raincoat",
        "description": "light blue hip-length raincoat",
        "category": "upper_body",
        "image_path": "../../images/garments/tops/raincoat.webp",
    },
    "jeans": {
        "name": "jeans",
        "description": "slim fit washed jeans",
        "category": "lower_body",
        "image_path": "../../images/garments/bottoms/jeans.webp",
    },
    "joggers": {
        "name": "joggers",
        "description": "pink joggers",
        "category": "lower_body",
        "image_path": "../../images/garments/bottoms/joggers.jpg",
    },
    "gym_shorts": {
        "name": "gym_shorts",
        "description": "short white gym shorts",
        "category": "lower_body",
        "image_path": "../../images/garments/bottoms/gym_shorts.webp",
    },
}

if __name__ == "__main__":
    with Session(engine) as session:
        for garment in garments.values():
            image_path = Path(__file__).parent / Path(garment["image_path"])
            with open(image_path, "rb") as image_file:
                wearable_image = WearableImage(image_data=image_file.read())
                session.add(wearable_image)

            wearable = Wearable(
                category=garment["category"],
                description=garment["description"],
                wearable_image_id=wearable_image.id,
            )
            session.add(wearable)
        session.commit()

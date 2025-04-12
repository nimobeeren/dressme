from pathlib import Path
from sqlmodel import Session

from . import engine, create_db_and_tables
from .models import AvatarImage, User, Wearable, WearableImage, WearableOnAvatarImage

avatar_data = {"name": "model", "image_path": "images/humans/model.jpg"}

wearables_data = {
    "tshirt": {
        "name": "tshirt",
        "description": "purple t-shirt",
        "category": "upper_body",
        "image_path": "images/garments/tops/tshirt.webp",
    },
    "sweater": {
        "name": "sweater",
        "description": "oversized pink sweater",
        "category": "upper_body",
        "image_path": "images/garments/tops/sweater.jpg",
    },
    "striped_sweater": {
        "name": "striped_sweater",
        "description": "black and white striped sweater",
        "category": "upper_body",
        "image_path": "images/garments/tops/striped_sweater.webp",
    },
    "winter_coat": {
        "name": "winter_coat",
        "description": "winter coat with fur lined hood",
        "category": "upper_body",
        "image_path": "images/garments/tops/winter_coat.webp",
    },
    "raincoat": {
        "name": "raincoat",
        "description": "light blue hip-length raincoat",
        "category": "upper_body",
        "image_path": "images/garments/tops/raincoat.webp",
    },
    "jeans": {
        "name": "jeans",
        "description": "slim fit washed jeans",
        "category": "lower_body",
        "image_path": "images/garments/bottoms/jeans.webp",
    },
    "joggers": {
        "name": "joggers",
        "description": "pink joggers",
        "category": "lower_body",
        "image_path": "images/garments/bottoms/joggers.jpg",
    },
    "gym_shorts": {
        "name": "gym_shorts",
        "description": "short white gym shorts",
        "category": "lower_body",
        "image_path": "images/garments/bottoms/gym_shorts.webp",
    },
}

# Path to the repo root
ROOT_PATH = Path(__file__).parent.parent.parent.parent

if __name__ == "__main__":
    create_db_and_tables()

    with Session(engine) as session:
        avatar = "model"  # which avatar to use to create test data

        # Add avatar image
        image_path = ROOT_PATH / Path(avatar_data["image_path"])
        with open(image_path, "rb") as image_file:
            avatar_image = AvatarImage(image_data=image_file.read())
            session.add(avatar_image)

        # Add user
        user = User(auth0_user_id="auth0|67eaf8a380e6a5a77d48e95e", avatar_image=avatar_image)
        session.add(user)

        # Add wearables
        for wearable_data in wearables_data.values():
            # Add wearable image
            image_path = ROOT_PATH / Path(wearable_data["image_path"])
            with open(image_path, "rb") as image_file:
                wearable_image = WearableImage(image_data=image_file.read())
            session.add(wearable_image)

            # Add wearable
            wearable = Wearable(
                category=wearable_data["category"],
                description=wearable_data["description"],
                wearable_image=wearable_image,
            )
            session.add(wearable)

            # Add wearable on avatar image
            image_path = (
                ROOT_PATH
                / "images"
                / "results"
                / avatar_data["name"]
                / "single"
                / f"{wearable_data["name"]}.jpg"
            )
            with open(image_path, "rb") as image_file:
                image_data = image_file.read()
            mask_image_path = (
                ROOT_PATH
                / "images"
                / "masks"
                / avatar_data["name"]
                / "post"
                / f"{wearable_data["name"]}.jpg"
            )
            with open(mask_image_path, "rb") as mask_image_file:
                mask_image_data = mask_image_file.read()
            wearable_on_avatar_image = WearableOnAvatarImage(
                avatar_image=avatar_image,
                wearable_image=wearable_image,
                image_data=image_data,
                mask_image_data=mask_image_data,
            )
            session.add(wearable_on_avatar_image)

        session.commit()

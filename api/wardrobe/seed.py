from pathlib import Path
from sqlmodel import Session

from .db import engine
from .models import AvatarImage, User, Wearable, WearableImage, WearableOnAvatarImage

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
    human = "model"  # which human to use to create test data

    with Session(engine) as session:
        # Add avatar image
        image_path = Path(__file__).parent / Path(humans[human]["image_path"])
        with open(image_path, "rb") as image_file:
            avatar_image = AvatarImage(image_data=image_file.read())
            session.add(avatar_image)

        # Add user
        user = User(name="Test User", avatar_image_id=avatar_image.id)
        session.add(user)

        # Add wearables
        for garment in garments.values():
            # Add wearable image
            image_path = Path(__file__).parent / Path(garment["image_path"])
            with open(image_path, "rb") as image_file:
                wearable_image = WearableImage(image_data=image_file.read())
            session.add(wearable_image)

            # Add wearable
            wearable = Wearable(
                category=garment["category"],
                description=garment["description"],
                wearable_image_id=wearable_image.id,
            )
            session.add(wearable)

            # Add wearable on avatar image
            image_path = (
                Path(__file__).parent.parent.parent
                / "images"
                / "results"
                / human
                / "single"
                / f"{garment["name"]}.jpg"
            )
            with open(image_path, "rb") as image_file:
                image_data = image_file.read()
            mask_image_path = (
                Path(__file__).parent.parent.parent
                / "images"
                / "masks"
                / human
                / "post"
                / f"{garment["name"]}.jpg"
            )
            # TODO: after adding masks for all garments, remove this check
            if mask_image_path.exists():
                with open(mask_image_path, "rb") as mask_image_file:
                    mask_image_data = mask_image_file.read()
            else:
                mask_image_data = None

            wearable_on_avatar_image = WearableOnAvatarImage(
                avatar_image_id=avatar_image.id,
                wearable_image_id=wearable_image.id,
                image_data=image_data,
                mask_image_data=mask_image_data,
            )
            session.add(wearable_on_avatar_image)

        session.commit()

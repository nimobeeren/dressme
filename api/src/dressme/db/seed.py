from pathlib import Path
from uuid import uuid4

from sqlmodel import Session

from ..settings import get_settings
from ..blob_storage import get_blob_storage
from ..image_utils import get_content_type_from_path
from . import create_db_and_tables, engine
from .models import User, Wearable, WearableOnAvatarImage

settings = get_settings()

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
ROOT_PATH = Path(__file__).parent.parent.parent.parent.parent


def seed():
    create_db_and_tables()
    blob_storage = get_blob_storage()

    with Session(engine) as session:
        # Upload avatar image
        avatar_image_path = ROOT_PATH / Path(avatar_data["image_path"])
        with open(avatar_image_path, "rb") as image_file:
            avatar_image_data = image_file.read()

        avatar_image_key = f"{uuid4()}.jpg"
        blob_storage.upload(
            settings.AVATARS_BUCKET,
            avatar_image_key,
            avatar_image_data,
            get_content_type_from_path(avatar_image_path),
        )

        # Add user
        if settings.AUTH0_SEED_USER_ID is None:
            raise ValueError(
                "AUTH0_SEED_USER_ID is not set, but this is required to determine which user should own the data added during seeding. You can find this your user ID in the Auth0 dashboard under User Management."
            )
        user = User(
            auth0_user_id=settings.AUTH0_SEED_USER_ID,
            avatar_image_key=avatar_image_key,
        )
        session.add(user)

        # Add wearables
        for wearable_data in wearables_data.values():
            # Upload wearable image
            wearable_image_path = ROOT_PATH / Path(wearable_data["image_path"])
            with open(wearable_image_path, "rb") as image_file:
                wearable_image_data = image_file.read()

            wearable_image_key = f"{uuid4()}{wearable_image_path.suffix}"
            blob_storage.upload(
                settings.WEARABLES_BUCKET,
                wearable_image_key,
                wearable_image_data,
                get_content_type_from_path(wearable_image_path),
            )

            # Add wearable
            wearable = Wearable(
                category=wearable_data["category"],
                description=wearable_data["description"],
                image_key=wearable_image_key,
                user_id=user.id,
            )
            session.add(wearable)

            # Upload WOA image
            woa_image_path = (
                ROOT_PATH
                / "images"
                / "results"
                / avatar_data["name"]
                / "single"
                / f"{wearable_data['name']}.jpg"
            )
            with open(woa_image_path, "rb") as image_file:
                woa_image_data = image_file.read()

            woa_image_key = f"{uuid4()}.jpg"
            blob_storage.upload(
                settings.WOA_BUCKET,
                woa_image_key,
                woa_image_data,
                "image/jpeg",
            )

            # Upload mask image
            mask_image_path = (
                ROOT_PATH
                / "images"
                / "masks"
                / avatar_data["name"]
                / "post"
                / f"{wearable_data['name']}.jpg"
            )
            with open(mask_image_path, "rb") as mask_image_file:
                mask_image_data = mask_image_file.read()

            mask_image_key = f"{uuid4()}.jpg"
            blob_storage.upload(
                settings.WOA_BUCKET,
                mask_image_key,
                mask_image_data,
                "image/jpeg",
            )

            # Add WearableOnAvatarImage
            wearable_on_avatar_image = WearableOnAvatarImage(
                user_id=user.id,
                avatar_image_key=avatar_image_key,
                wearable_image_key=wearable_image_key,
                image_key=woa_image_key,
                mask_image_key=mask_image_key,
            )
            session.add(wearable_on_avatar_image)

        session.commit()


if __name__ == "__main__":
    seed()

from pathlib import Path
from typing import TypedDict
from uuid import uuid4

from sqlmodel import Session

from ..settings import get_settings
from ..blob_storage import get_blob_storage
from ..image_utils import get_content_type_from_path
from ..wearable_classification import WearableCategory
from . import create_db_and_tables, engine
from .models import User, Wearable, WearableOnAvatarImage


class WearableSeedData(TypedDict):
    name: str
    category: WearableCategory
    image_path: str

settings = get_settings()

selfie_data = {"name": "human_4", "image_path": "images/humans/selfie_4.jpg"}
avatar_data = {"name": "human_4", "image_path": "images/avatars/avatar_4.jpg"}

wearables_data: dict[str, WearableSeedData] = {
    "tshirt": {
        "name": "tshirt",
        "category": "t-shirt",
        "image_path": "images/wearables/tops/t-shirt/purple-tshirt-product.webp",
    },
    "shirt": {
        "name": "shirt",
        "category": "shirt",
        "image_path": "images/wearables/tops/shirt/button-down-casual.jpeg",
    },
    "sweater": {
        "name": "sweater",
        "category": "sweater",
        "image_path": "images/wearables/tops/sweater/pullover-casual.webp",
    },
    "jacket": {
        "name": "jacket",
        "category": "jacket",
        "image_path": "images/wearables/tops/jacket/blazer-casual.webp",
    },
    "top": {
        "name": "top",
        "category": "top",
        "image_path": "images/wearables/tops/top/basic-top-product.webp",
    },
    "pants": {
        "name": "pants",
        "category": "pants",
        "image_path": "images/wearables/bottoms/pants/jeans-product.webp",
    },
    "shorts": {
        "name": "shorts",
        "category": "shorts",
        "image_path": "images/wearables/bottoms/shorts/gym-shorts-product.webp",
    },
    "skirt": {
        "name": "skirt",
        "category": "skirt",
        "image_path": "images/wearables/bottoms/skirt/mini-skirt-product.webp",
    },
}

# Path to the repo root
ROOT_PATH = Path(__file__).parent.parent.parent.parent.parent


def seed():
    create_db_and_tables()
    blob_storage = get_blob_storage()

    with Session(engine) as session:
        # Upload selfie image
        selfie_image_path = ROOT_PATH / Path(selfie_data["image_path"])
        with open(selfie_image_path, "rb") as image_file:
            selfie_image_data = image_file.read()

        selfie_image_key = f"{uuid4()}.jpg"
        blob_storage.upload(
            settings.SELFIES_BUCKET,
            selfie_image_key,
            selfie_image_data,
            get_content_type_from_path(selfie_image_path),
        )

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
            selfie_image_key=selfie_image_key,
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

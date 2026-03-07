import logging
from uuid import UUID, uuid4

from sqlmodel import Session, select

from . import db
from .avatar_generation import AvatarGenerator
from .blob_storage import BlobStorage
from .settings import get_settings
from .woa_generation import WoaGenerator

settings = get_settings()


# TODO: add a test for this
def generate_avatar_task(
    *, user_id: UUID, avatar_generator: AvatarGenerator, blob_storage: BlobStorage
):
    """Background task: generates a game avatar from the user's selfie."""
    with Session(db.engine) as session:
        user = session.exec(select(db.User).where(db.User.id == user_id)).one()

        if user.selfie_image_key is None:
            raise ValueError("User does not have a selfie image")

        try:
            selfie_data = blob_storage.download(
                settings.SELFIES_BUCKET, user.selfie_image_key
            )
            avatar_data = avatar_generator.generate(selfie_data)

            avatar_key = f"{uuid4()}.jpg"
            blob_storage.upload(
                settings.AVATARS_BUCKET, avatar_key, avatar_data, "image/jpeg"
            )

            user.avatar_image_key = avatar_key
            session.commit()
            logging.info(f"Avatar generation completed for user {user_id}")
        except Exception:
            logging.exception(f"Avatar generation failed for user {user_id}")


# TODO: add a test for this
async def generate_woa_image_task(
    *,
    wearable_id: UUID,
    user_id: UUID,
    woa_generator: WoaGenerator,
    blob_storage: BlobStorage,
):
    """
    Generates an image of the given user's avatar wearing a given wearable.

    This image is called a WearableOnAvatar (WOA) image. It is generated using AI models.
    This method is intended to be used as a FastAPI background task.
    """
    with Session(db.engine) as session:
        logging.info("Starting WOA generation")
        user = session.exec(select(db.User).where(db.User.id == user_id)).one()
        wearable = session.exec(
            select(db.Wearable)
            .where(db.Wearable.id == wearable_id)
            .where(db.Wearable.user_id == user_id)
        ).one()

        # Generate an image of the avatar wearing the wearable
        logging.info("Generating WOA image")
        if user.avatar_image_key is None:
            raise ValueError("User does not have an avatar image")

        wearable_image_data = blob_storage.download(
            settings.WEARABLES_BUCKET, wearable.image_key
        )
        avatar_image_data = blob_storage.download(
            settings.AVATARS_BUCKET, user.avatar_image_key
        )

        woa_image_data = await woa_generator.generate_image(
            avatar_image=avatar_image_data,
            wearable_image=wearable_image_data,
            wearable_description=wearable.description or "",
            category=wearable.category,
        )

        # Get a mask of the wearable on the avatar using an image segmentation model
        logging.info("Generating mask")
        mask_image_data = await woa_generator.generate_mask(
            woa_image=woa_image_data,
            wearable_description=wearable.description or "",
        )

        # Upload results to blob storage
        logging.info("Uploading results to blob storage")
        woa_key = f"{uuid4()}.jpg"
        mask_key = f"{uuid4()}.jpg"

        blob_storage.upload(settings.WOA_BUCKET, woa_key, woa_image_data, "image/jpeg")
        blob_storage.upload(settings.WOA_BUCKET, mask_key, mask_image_data, "image/jpeg")

        logging.info("Saving results to DB")
        woa_image = db.WearableOnAvatarImage(
            user_id=user.id,
            avatar_image_key=user.avatar_image_key,
            wearable_image_key=wearable.image_key,
            image_key=woa_key,
            mask_image_key=mask_key,
        )
        session.add(woa_image)
        session.commit()
        logging.info("Finished generating WOA image")

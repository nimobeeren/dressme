import io
from contextlib import asynccontextmanager
import logging
from typing import Annotated, Any, Literal, Sequence, cast
from uuid import UUID, uuid4

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Response,
    Security,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute
from PIL import Image
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload
from sqlmodel import Session, select

from . import db, schemas
from .auth import verify_token
from .avatar_generation import AvatarGenerator
from .background_tasks import generate_avatar_task, generate_woa_image_task
from .combining import combine_wearables
from .wearable_classification import WearableClassifier
from .woa_generation import (
    BOTTOM_CATEGORIES,
    TOP_CATEGORIES,
    WoaGenerator,
    get_body_part,
)
from .image_utils import compress_to_jpeg, read_upload, safe_open_image
from .settings import get_settings
from .blob_storage import BlobStorage, get_blob_storage

settings = get_settings()


def get_avatar_generator() -> AvatarGenerator:
    return AvatarGenerator()


def get_woa_generator() -> WoaGenerator:
    return WoaGenerator()


def get_wearable_classifier() -> WearableClassifier:
    return WearableClassifier(api_key=settings.GEMINI_API_KEY.get_secret_value())


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def get_session():
    with Session(db.engine) as session:
        yield session


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.create_db_and_tables()
    yield


def custom_generate_unique_id(route: APIRoute):
    # NOTE: this means route names (the name of the function decorated with @app.<method>) must be unique
    return route.name


app = FastAPI(
    lifespan=lifespan,
    generate_unique_id_function=custom_generate_unique_id,
    root_path="/api",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_current_user(
    *,
    jwt_payload: dict[str, Any] = Security(verify_token),
    session: Session = Depends(get_session),
) -> db.User:
    auth0_user_id = jwt_payload["sub"]

    current_user = session.exec(
        select(db.User).where(db.User.auth0_user_id == auth0_user_id)
    ).one_or_none()

    if current_user is None:
        try:
            logging.info(f"Creating new user with auth0_user_id: {repr(auth0_user_id)}")
            current_user = db.User(auth0_user_id=auth0_user_id)
            session.add(current_user)
            session.commit()
            session.refresh(current_user)
        except IntegrityError:
            # Handle race condition: another request created the user concurrentl
            logging.error(
                f"User creation failed due to integrity error (likely race condition) for auth0_user_id: {repr(auth0_user_id)}"
            )
            session.rollback()
            current_user = session.exec(
                select(db.User).where(db.User.auth0_user_id == auth0_user_id)
            ).one()

    return current_user


@app.get("/healthz")
def health():
    return {"status": "ok"}


@app.get("/users/me")
def get_me(
    *,
    current_user: db.User = Depends(get_current_user),
) -> schemas.User:
    return schemas.User(
        id=current_user.id,
        has_selfie_image=current_user.selfie_image_key is not None,
        has_avatar_image=current_user.avatar_image_key is not None,
    )


@app.put("/images/avatars/me")
def update_avatar_image(
    *,
    image: UploadFile,
    session: Session = Depends(get_session),
    current_user: db.User = Depends(get_current_user),
    blob_storage: BlobStorage = Depends(get_blob_storage),
    background_tasks: BackgroundTasks,
    avatar_generator: AvatarGenerator = Depends(get_avatar_generator),
):
    # Check if the user already has a selfie (one-time upload only)
    if current_user.selfie_image_key is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="It's currently not possible to replace an existing avatar image.",
        )

    contents = read_upload(image)
    img = safe_open_image(contents)
    jpeg_data = compress_to_jpeg(img)

    # Upload selfie to blob storage
    key = f"{uuid4()}.jpg"
    blob_storage.upload(settings.SELFIES_BUCKET, key, jpeg_data, "image/jpeg")

    # Update user and trigger avatar generation
    current_user.selfie_image_key = key
    session.commit()

    background_tasks.add_task(
        generate_avatar_task,
        user_id=current_user.id,
        avatar_generator=avatar_generator,
        blob_storage=blob_storage,
    )

    return Response(status_code=status.HTTP_202_ACCEPTED)


@app.get("/wearables")
def get_wearables(
    *,
    session: Session = Depends(get_session),
    current_user: db.User = Depends(get_current_user),
    blob_storage: BlobStorage = Depends(get_blob_storage),
) -> Sequence[schemas.Wearable]:
    # Subquery to get WearableOnAvatar (WOA) images for the current user
    woa_image_subquery = (
        select(db.WearableOnAvatarImage)
        .where(db.WearableOnAvatarImage.user_id == current_user.id)
        .where(
            db.WearableOnAvatarImage.avatar_image_key == current_user.avatar_image_key
        )
        .subquery()
    )

    # Get all wearables and the associated WearableOnAvatarImage (or None)
    results = cast(
        list[tuple[db.Wearable, UUID | None]],
        session.exec(
            select(db.Wearable, woa_image_subquery.columns.id)
            .where(db.Wearable.user_id == current_user.id)
            .outerjoin(
                woa_image_subquery,
                db.Wearable.image_key == woa_image_subquery.columns.wearable_image_key,  # type: ignore
            )
        ).all(),
    )

    return [
        schemas.Wearable(
            id=wearable.id,
            category=cast(schemas.WearableCategory, wearable.category),
            body_part=get_body_part(wearable.category),
            wearable_image_url=blob_storage.get_signed_url(
                settings.WEARABLES_BUCKET, wearable.image_key
            ),
            generation_status="pending" if woa_image_id is None else "success",
        )
        for wearable, woa_image_id in results
    ]


@app.post("/wearables/classify")
async def classify_wearable(
    *,
    image: UploadFile,
    # Route should only be accessible to authenticated users
    current_user: db.User = Depends(get_current_user),
    classifier: WearableClassifier = Depends(get_wearable_classifier),
) -> schemas.ClassifyResponse:
    contents = read_upload(image)
    img = safe_open_image(contents)
    jpeg_data = compress_to_jpeg(img)
    try:
        category = await classifier.classify(jpeg_data)
    except Exception as e:
        logging.error(f"Wearable classification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Wearable classification failed",
        )
    return schemas.ClassifyResponse(category=category)


@app.post("/wearables", status_code=status.HTTP_201_CREATED)
def create_wearables(
    *,
    category: Annotated[list[schemas.WearableCategory], Form()],
    image: Annotated[list[UploadFile], File()],
    session: Session = Depends(get_session),
    background_tasks: BackgroundTasks,
    current_user: db.User = Depends(get_current_user),
    blob_storage: BlobStorage = Depends(get_blob_storage),
    woa_generator: WoaGenerator = Depends(get_woa_generator),
) -> list[schemas.Wearable]:
    """
    Create one or more wearables.

    Multiple wearables can be created in one request by passing fields multiple times with the same
    name. All fields must appear the same number of times.
    """
    if current_user.avatar_image_key is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar generation must be completed before adding wearables.",
        )

    if len(category) != len(image):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The category and image fields should occur the same number of times.",
        )

    wearables: list[db.Wearable] = []
    for item_category, item_image in zip(category, image, strict=True):
        contents = read_upload(item_image)
        img = safe_open_image(contents)
        jpeg_data = compress_to_jpeg(img)

        key = f"{uuid4()}.jpg"
        blob_storage.upload(settings.WEARABLES_BUCKET, key, jpeg_data, "image/jpeg")

        wearable = db.Wearable(
            category=item_category,
            image_key=key,
            user_id=current_user.id,
        )
        wearables.append(wearable)
        session.add(wearable)

    session.commit()

    # Create WearableOnAvatar (WOA) images
    # Do this after DB commit to ensure the wearables exist
    for wearable in wearables:
        # TODO: background tasks currently run sequentially, so this will be slow for many wearables
        # FastAPI does not support concurrent background tasks yet: https://github.com/fastapi/fastapi/discussions/10682
        background_tasks.add_task(
            generate_woa_image_task,
            wearable_id=wearable.id,
            user_id=current_user.id,
            woa_generator=woa_generator,
            blob_storage=blob_storage,
        )

    return [
        schemas.Wearable(
            id=wearable.id,
            category=cast(schemas.WearableCategory, wearable.category),
            body_part=get_body_part(wearable.category),
            wearable_image_url=blob_storage.get_signed_url(
                settings.WEARABLES_BUCKET, wearable.image_key
            ),
            generation_status="pending",  # since the generation of the WOA image happens in the background
        )
        for wearable in wearables
    ]


@app.get("/images/outfit")
def get_outfit_image(
    *,
    top_id: UUID,
    bottom_id: UUID,
    session: Session = Depends(get_session),
    current_user: db.User = Depends(get_current_user),
    blob_storage: BlobStorage = Depends(get_blob_storage),
) -> StreamingResponse:
    if current_user.avatar_image_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User has no avatar image."
        )

    # Get the top and bottom wearables to get their image keys
    top_wearable = session.exec(
        select(db.Wearable)
        .where(db.Wearable.id == top_id)
        .where(db.Wearable.user_id == current_user.id)
    ).first()
    if top_wearable is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wearable with ID '{top_id}' not found.",
        )

    bottom_wearable = session.exec(
        select(db.Wearable)
        .where(db.Wearable.id == bottom_id)
        .where(db.Wearable.user_id == current_user.id)
    ).first()
    if bottom_wearable is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Wearable with ID '{bottom_id}' not found.",
        )

    # Find WOA images by matching user, avatar, and wearable image keys
    top_on_avatar = session.exec(
        select(db.WearableOnAvatarImage)
        .where(db.WearableOnAvatarImage.user_id == current_user.id)
        .where(
            db.WearableOnAvatarImage.avatar_image_key == current_user.avatar_image_key
        )
        .where(db.WearableOnAvatarImage.wearable_image_key == top_wearable.image_key)
    ).first()

    bottom_on_avatar = session.exec(
        select(db.WearableOnAvatarImage)
        .where(db.WearableOnAvatarImage.user_id == current_user.id)
        .where(
            db.WearableOnAvatarImage.avatar_image_key == current_user.avatar_image_key
        )
        .where(db.WearableOnAvatarImage.wearable_image_key == bottom_wearable.image_key)
    ).first()

    if top_on_avatar is None or bottom_on_avatar is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Outfit image not found."
        )

    # Download images from blob storage
    avatar_data = blob_storage.download(
        settings.AVATARS_BUCKET, current_user.avatar_image_key
    )
    top_data = blob_storage.download(settings.WOA_BUCKET, top_on_avatar.image_key)
    bottom_data = blob_storage.download(settings.WOA_BUCKET, bottom_on_avatar.image_key)
    top_mask_data = blob_storage.download(
        settings.WOA_BUCKET, top_on_avatar.mask_image_key
    )
    bottom_mask_data = blob_storage.download(
        settings.WOA_BUCKET, bottom_on_avatar.mask_image_key
    )

    avatar_im = Image.open(io.BytesIO(avatar_data))
    top_im = Image.open(io.BytesIO(top_data))
    bottom_im = Image.open(io.BytesIO(bottom_data))
    top_mask_im = Image.open(io.BytesIO(top_mask_data))
    bottom_mask_im = Image.open(io.BytesIO(bottom_mask_data))

    outfit_im = combine_wearables(
        avatar_im, top_im, bottom_im, top_mask_im, bottom_mask_im
    )

    outfit_buffer = io.BytesIO()
    outfit_im.save(outfit_buffer, format="JPEG")
    outfit_buffer.seek(0)
    return StreamingResponse(
        outfit_buffer,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.get("/outfits")
def get_outfits(
    *,
    session: Session = Depends(get_session),
    current_user: db.User = Depends(get_current_user),
    blob_storage: BlobStorage = Depends(get_blob_storage),
) -> Sequence[schemas.Outfit]:
    # Get wearable image keys for which a WOA image exists for the current user's avatar
    woa_images = session.exec(
        select(db.WearableOnAvatarImage)
        .where(db.WearableOnAvatarImage.user_id == current_user.id)
        .where(
            db.WearableOnAvatarImage.avatar_image_key == current_user.avatar_image_key
        )
    ).all()
    completed_wearable_image_keys = {woa.wearable_image_key for woa in woa_images}

    # Fetch outfits along with the top and bottom wearables
    outfits = cast(
        list[db.Outfit],
        session.exec(
            select(db.Outfit)
            .where(db.Outfit.user_id == current_user.id)
            .options(joinedload(db.Outfit.top))  # type: ignore
            .options(joinedload(db.Outfit.bottom))  # type: ignore
        ).all(),
    )

    api_outfits: list[schemas.Outfit] = []
    for outfit in outfits:
        assert outfit.top is not None
        assert outfit.bottom is not None

        top_status: Literal["pending", "success"] = (
            "success"
            if outfit.top.image_key in completed_wearable_image_keys
            else "pending"
        )
        bottom_status: Literal["pending", "success"] = (
            "success"
            if outfit.bottom.image_key in completed_wearable_image_keys
            else "pending"
        )

        top = schemas.Wearable(
            id=outfit.top.id,
            category=cast(schemas.WearableCategory, outfit.top.category),
            body_part=get_body_part(outfit.top.category),
            wearable_image_url=blob_storage.get_signed_url(
                settings.WEARABLES_BUCKET, outfit.top.image_key
            ),
            generation_status=top_status,
        )
        bottom = schemas.Wearable(
            id=outfit.bottom.id,
            category=cast(schemas.WearableCategory, outfit.bottom.category),
            body_part=get_body_part(outfit.bottom.category),
            wearable_image_url=blob_storage.get_signed_url(
                settings.WEARABLES_BUCKET, outfit.bottom.image_key
            ),
            generation_status=bottom_status,
        )
        api_outfits.append(schemas.Outfit(id=outfit.id, top=top, bottom=bottom))
    return api_outfits


@app.post("/outfits")
def create_outfit(
    *,
    top_id: UUID,
    bottom_id: UUID,
    session: Session = Depends(get_session),
    current_user: db.User = Depends(get_current_user),
):
    # Ensure that the top and bottom wearables exist AND belong to the current user
    top = session.exec(
        select(db.Wearable)
        .where(db.Wearable.id == top_id)
        .where(db.Wearable.user_id == current_user.id)
    ).one_or_none()
    if top is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Top wearable with ID '{top_id}' not found or not owned by user.",
        )
    if top.category not in TOP_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Top wearable must have "body_part": "top".',
        )

    bottom = session.exec(
        select(db.Wearable)
        .where(db.Wearable.id == bottom_id)
        .where(db.Wearable.user_id == current_user.id)
    ).one_or_none()
    if bottom is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Bottom wearable with ID '{bottom_id}' not found or not owned by user.",
        )
    if bottom.category not in BOTTOM_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Bottom wearable must have "body_part": "bottom".',
        )

    # Check if the outfit already exists
    existing_outfit = session.exec(
        select(db.Outfit).where(
            db.Outfit.top_id == top_id,
            db.Outfit.bottom_id == bottom_id,
            db.Outfit.user_id == current_user.id,
        )
    ).first()
    if existing_outfit is not None:
        return Response(status_code=status.HTTP_200_OK)

    # Create the outfit
    outfit = db.Outfit(
        top_id=top_id,
        bottom_id=bottom_id,
        user_id=current_user.id,
    )
    session.add(outfit)
    session.commit()

    return Response(status_code=status.HTTP_201_CREATED)


@app.delete("/outfits")
def delete_outfit(
    *,
    id: UUID,
    session: Session = Depends(get_session),
    current_user: db.User = Depends(get_current_user),
):
    # Check if the outfit exists and is owned by the current user
    outfit = session.exec(
        select(db.Outfit)
        .where(db.Outfit.id == id)
        .where(db.Outfit.user_id == current_user.id)
    ).one_or_none()

    if outfit is None:
        # Do nothing if the outfit does not exist or is not owned by the current user
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Outfit not found."
        )
    else:
        # Delete the outfit
        session.delete(outfit)
        session.commit()
        return Response(status_code=status.HTTP_200_OK)

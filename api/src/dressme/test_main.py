from typing import override
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from fastapi import status
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from . import db
from .auth import verify_token
from .main import app, get_current_user, get_session
from .blob_storage import BlobStorage, get_blob_storage
from .settings import get_settings

test_user_id = "auth0|1"
settings = get_settings()

# Minimal valid WebP image data
test_webp_image_data = b'RIFF.\x00\x00\x00WEBPVP8 "\x00\x00\x000\x01\x00\x9d\x01*\n\x00\n\x00\x01@&%\xa4\x00\x03p\x00\xfe\xfa0L f}\x19l\xc5\xd6+\x80\x00\x00'
# JPEG header data
test_jpeg_header_data = b"\xff\xd8\xff"


class MockBlobStorage(BlobStorage):
    """Mock blob storage for testing. Stores uploaded data and returns it on download."""

    def __init__(self):
        self._data: dict[tuple[str, str], bytes] = {}

    @override
    def upload(self, bucket: str, key: str, data: bytes, content_type: str) -> None:
        self._data[(bucket, key)] = data

    @override
    def download(self, bucket: str, key: str) -> bytes:
        if (bucket, key) not in self._data:
            raise KeyError(f"No data found for {bucket}/{key}")
        return self._data[(bucket, key)]

    @override
    def get_signed_url(self, bucket: str, key: str, expires_in: int = 3600) -> str:
        return f"https://signed-url/{bucket}/{key}"


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="mock_blob_storage")
def mock_blob_storage_fixture():
    return MockBlobStorage()


@pytest.fixture(name="client")
def client_fixture(session: Session, mock_blob_storage: MockBlobStorage):
    def get_session_override():
        return session

    def verify_token_override():
        return {"sub": test_user_id}

    def get_blob_storage_override():
        return mock_blob_storage

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[verify_token] = verify_token_override
    app.dependency_overrides[get_blob_storage] = get_blob_storage_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


class TestHealth:
    def test_health(self, client: TestClient):
        response = client.get("/healthz")
        assert response.status_code == 200


class TestGetCurrentUser:
    def test_get_current_user_existing_user(self, session: Session):
        # Arrange: Create an existing user in the database using the fixture session
        existing_user_in_fixture_session = db.User(auth0_user_id=test_user_id)
        session.add(existing_user_in_fixture_session)
        session.commit()
        # Ensure the ID is available for assertion later
        existing_user_id = existing_user_in_fixture_session.id

        # Act: Call the function under test using a *separate* DB session
        engine = session.get_bind()
        with Session(engine) as test_session:
            test_jwt_payload = {"sub": test_user_id}
            # get_current_user should find the user committed by the fixture session
            user_from_test_session = get_current_user(
                jwt_payload=test_jwt_payload, session=test_session
            )

            # Assert: Check if the correct user is returned within the test_session
            assert user_from_test_session is not None
            # Compare ID with the one we got from the fixture session commit
            assert user_from_test_session.id == existing_user_id
            assert user_from_test_session.auth0_user_id == test_user_id

    def test_get_current_user_new_user(self, session: Session):
        existing_user = session.exec(
            select(db.User).where(db.User.auth0_user_id == test_user_id)
        ).one_or_none()
        assert existing_user is None

        # Call the function under test using a *separate* DB session
        engine = session.get_bind()  # Get the engine from the fixture session
        with Session(engine) as test_session:
            test_jwt_payload = {"sub": test_user_id}
            # This call attempts to add and commit the user within session_for_action
            _ = get_current_user(jwt_payload=test_jwt_payload, session=test_session)

        # Verify persistence using the original fixture session
        # Expire all instances in the session to ensure the test fails if the session
        # is not committed
        session.expire_all()
        newly_fetched_user = session.exec(
            select(db.User).where(db.User.auth0_user_id == test_user_id)
        ).one_or_none()

        # This assertion will fail if the user wasn't committed to the DB
        assert newly_fetched_user is not None
        # Check properties of the *fetched* user
        assert newly_fetched_user.auth0_user_id == test_user_id
        assert newly_fetched_user.id is not None  # ID should be populated after commit


class TestGetMe:
    def test_success(
        self, session: Session, client: TestClient, mock_blob_storage: MockBlobStorage
    ):
        # Create user with avatar image key
        user = db.User(auth0_user_id=test_user_id, avatar_image_key="avatar.jpg")
        session.add(user)
        session.commit()

        # Make request to get user info
        response = client.get("/users/me")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(user.id)
        assert data["avatar_image_url"] == mock_blob_storage.get_signed_url(
            settings.AVATARS_BUCKET, "avatar.jpg"
        )

    def test_success_no_avatar_image(self, session: Session, client: TestClient):
        # Create user without an avatar image
        user = db.User(auth0_user_id=test_user_id, avatar_image_key=None)
        session.add(user)
        session.commit()

        # Make request to get user info
        response = client.get("/users/me")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(user.id)
        assert data["avatar_image_url"] is None


class TestUpdateAvatarImage:
    def test_success(
        self, session: Session, client: TestClient, mock_blob_storage: MockBlobStorage
    ):
        # Create user without an initial avatar image
        user = db.User(auth0_user_id=test_user_id, avatar_image_key=None)
        session.add(user)
        session.commit()
        assert user.avatar_image_key is None

        # New avatar data to upload
        new_avatar_data = test_webp_image_data

        # Make request to update avatar image
        response = client.put(
            "/images/avatars/me",
            files={"image": ("new_avatar.webp", new_avatar_data, "image/webp")},
        )

        # Assert response status code
        assert response.status_code == 200

        # Refresh user object to get updated fields
        session.refresh(user)

        # Assert database state - user now has an avatar key
        assert user.avatar_image_key is not None
        assert user.avatar_image_key.endswith(".jpg")

        # Verify the uploaded data is a JPEG
        uploaded_data = mock_blob_storage.download(
            settings.AVATARS_BUCKET, user.avatar_image_key
        )
        assert uploaded_data.startswith(test_jpeg_header_data)

    def test_already_exists(self, session: Session, client: TestClient):
        # Create user with an existing avatar image key
        user = db.User(
            auth0_user_id=test_user_id, avatar_image_key="existing-avatar.jpg"
        )
        session.add(user)
        session.commit()

        # New avatar data to upload
        new_avatar_data = test_webp_image_data

        # Make request to update avatar image
        response = client.put(
            "/images/avatars/me",
            files={"image": ("new_avatar.webp", new_avatar_data, "image/webp")},
        )

        # Assert response status code
        assert response.status_code == 400

        # Refresh user object to verify state unchanged
        session.refresh(user)

        # Assert database state - user's avatar key is unchanged
        assert user.avatar_image_key == "existing-avatar.jpg"


class TestGetWearables:
    def test_success(
        self, session: Session, client: TestClient, mock_blob_storage: MockBlobStorage
    ):
        # Create user with avatar
        user = db.User(auth0_user_id=test_user_id, avatar_image_key="avatar.jpg")
        session.add(user)

        # Create test wearables, associated with the current user
        wearable_1 = db.Wearable(
            image_key="wearable1.jpg",
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(wearable_1)

        # Create a WOA record for wearable_1
        woa_1 = db.WearableOnAvatarImage(
            user_id=user.id,
            avatar_image_key="avatar.jpg",
            wearable_image_key="wearable1.jpg",
            image_key="woa1.jpg",
            mask_image_key="mask1.jpg",
        )
        session.add(woa_1)

        wearable_2 = db.Wearable(
            image_key="wearable2.jpg",
            category="lower_body",
            description=None,
            user_id=user.id,
        )
        session.add(wearable_2)
        # No WOA record for wearable_2 — generation pending

        # Create a wearable that does not belong to the user
        other_user = db.User(auth0_user_id="auth0|2", avatar_image_key="avatar2.jpg")
        session.add(other_user)

        wearable_3 = db.Wearable(
            image_key="wearable3.jpg",
            category="upper_body",
            description=None,
            user_id=other_user.id,
        )
        session.add(wearable_3)

        session.commit()

        # Make request to get all wearables
        response = client.get("/wearables")
        assert response.status_code == 200
        data = response.json()

        # Verify response contains two wearables owned by the current user with correct data
        assert len(data) == 2
        assert data[0]["id"] == str(wearable_1.id)
        assert data[0]["category"] == wearable_1.category
        assert data[0]["description"] == wearable_1.description
        assert data[0]["generation_status"] == "completed"
        assert data[0]["woa_image_url"] == mock_blob_storage.get_signed_url(
            settings.WOA_BUCKET, "woa1.jpg"
        )
        assert data[0]["woa_mask_url"] == mock_blob_storage.get_signed_url(
            settings.WOA_BUCKET, "mask1.jpg"
        )
        assert data[1]["id"] == str(wearable_2.id)
        assert data[1]["category"] == wearable_2.category
        assert data[1]["description"] == wearable_2.description
        assert data[1]["generation_status"] == "pending"
        assert data[1]["woa_image_url"] is None
        assert data[1]["woa_mask_url"] is None


class TestCreateWearables:
    @patch("dressme.main.create_woa_image")
    def test_success(
        self,
        mock_create_woa_image: MagicMock,
        session: Session,
        client: TestClient,
        mock_blob_storage: MockBlobStorage,
    ):
        # Create user with avatar first
        user = db.User(auth0_user_id=test_user_id, avatar_image_key="avatar.jpg")
        session.add(user)
        session.commit()

        # Create test image data
        test_image_data_1 = test_webp_image_data
        test_image_data_2 = b'RIFF.\x00\x00\x00WEBPVP8 "\x00\x00\x000\x01\x00\x9d\x01*\n\x00\n\x00\x01@&%\xa4\x00\x03p\x00\xfe\xfa0L f}\x19l\xc5\xd6+\x80\x00\x01'

        # Make request with two images and metadata
        response = client.post(
            "/wearables",
            files=[
                ("image", ("test1.webp", test_image_data_1, "image/webp")),
                ("image", ("test2.webp", test_image_data_2, "image/webp")),
            ],
            data={
                "category": ["upper_body", "lower_body"],
                "description": [
                    "test description 1",
                    "",  # empty string means no description
                ],
            },
        )

        assert response.status_code == 201
        data = response.json()

        # Verify response data
        assert len(data) == 2

        # Verify first wearable
        wearable_data_1 = data[0]
        assert wearable_data_1["category"] == "upper_body"
        assert wearable_data_1["description"] == "test description 1"
        assert "id" in wearable_data_1
        assert "wearable_image_url" in wearable_data_1

        # Verify second wearable
        wearable_data_2 = data[1]
        assert wearable_data_2["category"] == "lower_body"
        assert wearable_data_2["description"] is None
        assert "id" in wearable_data_2
        assert "wearable_image_url" in wearable_data_2

        # Verify database state for first wearable
        wearable_1 = session.exec(
            select(db.Wearable).where(db.Wearable.id == UUID(wearable_data_1["id"]))
        ).one()
        assert wearable_1.category == "upper_body"
        assert wearable_1.description == "test description 1"
        assert wearable_1.user_id == user.id
        assert wearable_1.image_key.endswith(".jpg")

        # Verify database state for second wearable
        wearable_2 = session.exec(
            select(db.Wearable).where(db.Wearable.id == UUID(wearable_data_2["id"]))
        ).one()
        assert wearable_2.category == "lower_body"
        assert wearable_2.description is None
        assert wearable_2.user_id == user.id
        assert wearable_2.image_key.endswith(".jpg")

        # Verify the uploaded images are JPEGs
        uploaded_data_1 = mock_blob_storage.download(
            settings.WEARABLES_BUCKET, wearable_1.image_key
        )
        assert uploaded_data_1.startswith(test_jpeg_header_data)

        uploaded_data_2 = mock_blob_storage.download(
            settings.WEARABLES_BUCKET, wearable_2.image_key
        )
        assert uploaded_data_2.startswith(test_jpeg_header_data)

        # WOA image creation should have been triggered twice
        assert mock_create_woa_image.call_count == 2

    def test_wrong_field_count(self, session: Session, client: TestClient):
        # Make request with mismatched number of images and metadata fields
        response = client.post(
            "/wearables",
            files=[
                ("image", ("test.webp", b"", "image/webp")),
                ("image", ("test.webp", b"", "image/webp")),
            ],
            data={
                "category": ["upper_body", "lower_body"],
                "description": ["test description"],
            },  # missing description for the second wearable
        )
        assert response.status_code == 422


class TestGetOutfits:
    def test_success_with_outfits(self, session: Session, client: TestClient):
        # Create user with avatar
        user = db.User(auth0_user_id=test_user_id, avatar_image_key="avatar.jpg")
        session.add(user)

        # Create top wearable (completed WOA)
        top_wearable = db.Wearable(
            image_key="top.jpg",
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)
        top_woa_image = db.WearableOnAvatarImage(
            user_id=user.id,
            avatar_image_key="avatar.jpg",
            wearable_image_key="top.jpg",
            image_key="woa_top.jpg",
            mask_image_key="mask_top.jpg",
        )
        session.add(top_woa_image)

        # Create bottom wearable (pending WOA - no WOA image)
        bottom_wearable = db.Wearable(
            image_key="bottom.jpg",
            category="lower_body",
            description="test bottom",
            user_id=user.id,
        )
        session.add(bottom_wearable)

        # Create outfit
        outfit = db.Outfit(
            user_id=user.id, top_id=top_wearable.id, bottom_id=bottom_wearable.id
        )
        session.add(outfit)
        session.commit()

        # Make request
        response = client.get("/outfits")
        assert response.status_code == 200
        data = response.json()

        # Assert response
        assert len(data) == 1
        assert data[0]["id"] == str(outfit.id)
        assert data[0]["top"]["id"] == str(top_wearable.id)
        assert data[0]["top"]["category"] == "upper_body"
        assert data[0]["top"]["description"] == "test top"
        assert "signed-url" in data[0]["top"]["wearable_image_url"]
        assert data[0]["top"]["generation_status"] == "completed"  # WOA exists
        assert data[0]["bottom"]["id"] == str(bottom_wearable.id)
        assert data[0]["bottom"]["category"] == "lower_body"
        assert data[0]["bottom"]["description"] == "test bottom"
        assert "signed-url" in data[0]["bottom"]["wearable_image_url"]
        assert data[0]["bottom"]["generation_status"] == "pending"  # WOA does not exist

    def test_success_no_outfits(self, session: Session, client: TestClient):
        # Create user but no outfits
        user = db.User(auth0_user_id=test_user_id, avatar_image_key="avatar.jpg")
        session.add(user)
        session.commit()

        response = client.get("/outfits")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0


class TestCreateOutfit:
    def _create_user_and_wearables(self, session: Session):
        # Create user with avatar
        user = db.User(auth0_user_id=test_user_id, avatar_image_key="avatar.jpg")
        session.add(user)

        # Create top wearable
        top_wearable = db.Wearable(
            image_key="top.jpg",
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable
        bottom_wearable = db.Wearable(
            image_key="bottom.jpg",
            category="lower_body",
            description="test bottom",
            user_id=user.id,
        )
        session.add(bottom_wearable)

        session.commit()
        return user, top_wearable, bottom_wearable

    def test_success(self, session: Session, client: TestClient):
        user, top_wearable, bottom_wearable = self._create_user_and_wearables(session)

        # Make request
        response = client.post(
            "/outfits",
            params={
                "top_id": str(top_wearable.id),
                "bottom_id": str(bottom_wearable.id),
            },
        )
        assert response.status_code == 201

        # Assert database state
        outfit = session.exec(
            select(db.Outfit)
            .where(db.Outfit.top_id == top_wearable.id)
            .where(db.Outfit.bottom_id == bottom_wearable.id)
            .where(db.Outfit.user_id == user.id)
        ).one_or_none()
        assert outfit is not None

    def test_success_already_exists(self, session: Session, client: TestClient):
        user, top_wearable, bottom_wearable = self._create_user_and_wearables(session)

        # Create the outfit first
        outfit = db.Outfit(
            user_id=user.id, top_id=top_wearable.id, bottom_id=bottom_wearable.id
        )
        session.add(outfit)
        session.commit()

        # Try creating it again
        response = client.post(
            "/outfits",
            params={
                "top_id": str(top_wearable.id),
                "bottom_id": str(bottom_wearable.id),
            },
        )
        assert response.status_code == 200

    def test_top_not_found(self, session: Session, client: TestClient):
        _, _, bottom_wearable = self._create_user_and_wearables(session)
        non_existent_id = uuid4()

        response = client.post(
            "/outfits",
            params={
                "top_id": str(non_existent_id),
                "bottom_id": str(bottom_wearable.id),
            },
        )
        assert response.status_code == 404

    def test_bottom_not_found(self, session: Session, client: TestClient):
        _, top_wearable, _ = self._create_user_and_wearables(session)
        non_existent_id = uuid4()

        response = client.post(
            "/outfits",
            params={"top_id": str(top_wearable.id), "bottom_id": str(non_existent_id)},
        )
        assert response.status_code == 404

    def test_top_wrong_category(self, session: Session, client: TestClient):
        _, _, bottom_wearable = self._create_user_and_wearables(session)

        # Try to create outfit with two bottom wearables
        response = client.post(
            "/outfits",
            params={
                "top_id": str(bottom_wearable.id),
                "bottom_id": str(bottom_wearable.id),
            },
        )
        assert response.status_code == 400
        assert (
            response.json()["detail"] == "Top wearable must have category 'upper_body'."
        )

    def test_bottom_wrong_category(self, session: Session, client: TestClient):
        _, top_wearable, _ = self._create_user_and_wearables(session)

        # Try to create outfit with two top wearables
        response = client.post(
            "/outfits",
            params={
                "top_id": str(top_wearable.id),
                "bottom_id": str(top_wearable.id),
            },
        )
        assert response.status_code == 400
        assert (
            response.json()["detail"]
            == "Bottom wearable must have category 'lower_body'."
        )

    def test_wearable_not_owned(self, session: Session, client: TestClient):
        # Create user 1 (the logged-in user)
        user_1, top_wearable, _ = self._create_user_and_wearables(session)

        # Create user 2 and their bottom wearable
        user_2 = db.User(auth0_user_id="auth0|2", avatar_image_key="avatar2.jpg")
        session.add(user_2)

        # Create bottom wearable for user 2
        bottom_wearable_2 = db.Wearable(
            image_key="bottom2.jpg",
            category="lower_body",
            description=None,
            user_id=user_2.id,  # Belongs to user 2
        )
        session.add(bottom_wearable_2)
        session.commit()

        # Attempt to create outfit as user 1 using user 2's bottom wearable
        response = client.post(
            "/outfits",
            params={
                "top_id": str(top_wearable.id),
                "bottom_id": str(bottom_wearable_2.id),
            },
        )

        assert response.status_code == 404, (
            "User 1 should not be able to use User 2's wearable"
        )

        # Also verify that no outfit was actually created for user 1
        outfit = session.exec(
            select(db.Outfit).where(db.Outfit.user_id == user_1.id)
        ).one_or_none()
        assert outfit is None


class TestDeleteOutfit:
    def _create_user_wearables_outfit(
        self, session: Session, auth0_user_id: str = test_user_id
    ):
        # Create user with avatar
        user = db.User(auth0_user_id=auth0_user_id, avatar_image_key="avatar.jpg")
        session.add(user)

        # Create top wearable
        top_wearable = db.Wearable(
            image_key="top.jpg",
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable
        bottom_wearable = db.Wearable(
            image_key="bottom.jpg",
            category="lower_body",
            description="test bottom",
            user_id=user.id,
        )
        session.add(bottom_wearable)

        # Create outfit
        outfit = db.Outfit(
            user_id=user.id, top_id=top_wearable.id, bottom_id=bottom_wearable.id
        )
        session.add(outfit)
        session.commit()
        session.refresh(outfit)  # Ensure outfit.id is loaded
        return user, outfit

    def test_success(self, session: Session, client: TestClient):
        _, outfit = self._create_user_wearables_outfit(session)

        # Make request
        response = client.delete("/outfits", params={"id": str(outfit.id)})
        assert response.status_code == 200

        # Assert database state
        deleted_outfit = session.exec(
            select(db.Outfit).where(db.Outfit.id == outfit.id)
        ).one_or_none()
        assert deleted_outfit is None

    def test_not_found_wrong_id(self, session: Session, client: TestClient):
        _, _ = self._create_user_wearables_outfit(session)
        non_existent_id = uuid4()

        response = client.delete("/outfits", params={"id": str(non_existent_id)})
        assert response.status_code == 404

    def test_not_found_wrong_user(self, session: Session, client: TestClient):
        # Create outfit for user 2
        _, outfit = self._create_user_wearables_outfit(session, "auth0|2")

        # Try deleting outfit as user 1 (implicit via client fixture)
        response = client.delete("/outfits", params={"id": str(outfit.id)})
        assert (
            response.status_code == 404  # Should fail because outfit belongs to user2
        )

        # Verify outfit still exists
        existing_outfit = session.exec(
            select(db.Outfit).where(db.Outfit.id == outfit.id)
        ).one_or_none()
        assert existing_outfit is not None

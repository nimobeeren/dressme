from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from . import db
from .auth import verify_token
from .main import app, get_current_user, get_session

test_user_id = "auth0|1"

# Minimal valid WebP image data
test_webp_image_data = b'RIFF.\x00\x00\x00WEBPVP8 "\x00\x00\x000\x01\x00\x9d\x01*\n\x00\n\x00\x01@&%\xa4\x00\x03p\x00\xfe\xfa0L f}\x19l\xc5\xd6+\x80\x00\x00'
# JPEG header data
test_jpeg_header_data = b"\xff\xd8\xff"


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    def verify_token_override():
        return {"sub": test_user_id}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[verify_token] = verify_token_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


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
    def test_success(self, session: Session, client: TestClient):
        # Create user and initial avatar image
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)
        session.commit()

        # Make request to get user info
        response = client.get("/users/me")
        assert response.status_code == 200
        assert response.json() == {
            "id": str(user.id),
            "has_avatar_image": True,
        }

    def test_success_no_avatar_image(self, session: Session, client: TestClient):
        # Create user without an avatar image
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=None)
        session.add(user)
        session.commit()

        # Make request to get user info
        response = client.get("/users/me")
        assert response.status_code == 200
        assert response.json() == {
            "id": str(user.id),
            "has_avatar_image": False,
        }


class TestUpdateAvatarImage:
    def test_success(self, session: Session, client: TestClient):
        # Create user without an initial avatar image
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=None)
        session.add(user)
        session.commit()
        assert user.avatar_image_id is None

        # New avatar data to upload
        new_avatar_data = test_webp_image_data

        # Make request to update avatar image
        response = client.put(
            "/images/avatars/me",
            files={"image": ("new_avatar.webp", new_avatar_data, "image/webp")},
        )

        # Assert response status code
        assert response.status_code == 200

        # Refresh user object to get updated relationships
        session.refresh(user)

        # Assert database state
        # Check that the user now has an avatar image ID
        assert user.avatar_image_id is not None

        # Check the new avatar image data
        new_avatar_image = session.get(db.AvatarImage, user.avatar_image_id)
        assert new_avatar_image is not None
        # Verify it's a JPEG by checking the header
        assert new_avatar_image.image_data.startswith(test_jpeg_header_data)

    def test_already_exists(self, session: Session, client: TestClient):
        # Create user and initial avatar image
        initial_avatar_data = b"initial_avatar"
        avatar_image = db.AvatarImage(image_data=initial_avatar_data)
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)
        session.commit()
        initial_avatar_id = avatar_image.id

        # New avatar data to upload
        new_avatar_data = test_webp_image_data

        # Make request to update avatar image
        response = client.put(
            "/images/avatars/me",
            files={"image": ("new_avatar.webp", new_avatar_data, "image/webp")},
        )

        # Assert response status code
        assert response.status_code == 400

        # Refresh user object to get updated relationships
        session.refresh(user)

        # Assert database state
        # Check that the user's avatar image ID has not changed
        assert user.avatar_image is not None
        assert user.avatar_image.id == initial_avatar_id
        assert user.avatar_image.image_data == initial_avatar_data


class TestGetWearables:
    def test_success(self, session: Session, client: TestClient):
        # Create user and avatar
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)

        # Create test wearables with images, associated with the current user
        wearable_image_1 = db.WearableImage(image_data=b"")
        session.add(wearable_image_1)
        wearable_1 = db.Wearable(
            wearable_image_id=wearable_image_1.id,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(wearable_1)

        wearable_image_2 = db.WearableImage(image_data=b"")
        session.add(wearable_image_2)
        wearable_2 = db.Wearable(
            wearable_image_id=wearable_image_2.id,
            category="lower_body",
            description=None,
            user_id=user.id,
        )
        session.add(wearable_2)

        # Create a wearable that does not belong to the user
        other_user = db.User(auth0_user_id="auth0|2", avatar_image_id=avatar_image.id)
        session.add(other_user)

        wearable_image_3 = db.WearableImage(image_data=b"")
        session.add(wearable_image_3)
        wearable_3 = db.Wearable(
            wearable_image_id=wearable_image_3.id,
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
        assert data[1]["id"] == str(wearable_2.id)
        assert data[1]["category"] == wearable_2.category
        assert data[1]["description"] == wearable_2.description


class TestGetWearableImage:
    def _create_user_and_wearable(
        self, session: Session, auth0_user_id: str = test_user_id
    ):
        # Create avatar image for the user
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        # Create user
        user = db.User(auth0_user_id=auth0_user_id, avatar_image_id=avatar_image.id)
        session.add(user)
        # Create test wearable image
        wearable_image = db.WearableImage(image_data=test_webp_image_data)
        session.add(wearable_image)
        # Create the Wearable record linking user and wearable image
        wearable = db.Wearable(
            wearable_image_id=wearable_image.id,
            category="upper_body",
            description=None,
            user_id=user.id,
        )
        session.add(wearable)
        session.commit()
        return user, wearable, wearable_image

    def test_success(self, session: Session, client: TestClient):
        _, _, wearable_image = self._create_user_and_wearable(session)

        # Make request to get wearable image owned by the user
        response = client.get(f"/images/wearables/{wearable_image.id}")
        assert response.status_code == 200
        assert response.content == wearable_image.image_data

    def test_not_found(self, session: Session, client: TestClient):
        # Create user first so the endpoint can check ownership
        self._create_user_and_wearable(session)
        # Make request with non-existent wearable image ID
        response = client.get(f"/images/wearables/{uuid4()}")
        assert response.status_code == 404

    def test_not_found_other_user(self, session: Session, client: TestClient):
        # Create wearable image for user 2
        _, _, wearable_image_2 = self._create_user_and_wearable(
            session, auth0_user_id="auth0|2"
        )
        # Create user 1 (the authenticated user)
        _, _, _ = self._create_user_and_wearable(session, auth0_user_id=test_user_id)

        # Make request as user 1 to get wearable image belonging to user 2
        response = client.get(f"/images/wearables/{wearable_image_2.id}")
        assert (
            response.status_code == 404  # User 1 should not access user 2's image
        )


class TestCreateWearables:
    @patch("dressme.main.create_woa_image")
    def test_success(
        self, mock_create_woa_image: MagicMock, session: Session, client: TestClient
    ):
        # Create user and avatar first
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
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

        wearable_image_1 = session.exec(
            select(db.WearableImage).where(
                db.WearableImage.id == wearable_1.wearable_image_id
            )
        ).one()
        # Verify it's a JPEG by checking the header
        assert wearable_image_1.image_data.startswith(test_jpeg_header_data)

        # Verify database state for second wearable
        wearable_2 = session.exec(
            select(db.Wearable).where(db.Wearable.id == UUID(wearable_data_2["id"]))
        ).one()
        assert wearable_2.category == "lower_body"
        assert wearable_2.description is None
        assert wearable_2.user_id == user.id

        wearable_image_2 = session.exec(
            select(db.WearableImage).where(
                db.WearableImage.id == wearable_2.wearable_image_id
            )
        ).one()
        # Verify it's a JPEG by checking the header
        assert wearable_image_2.image_data.startswith(test_jpeg_header_data)

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


class TestGetOutfitImage:
    def test_success(self, session: Session, client: TestClient):
        # Create a minimal valid WebP image for testing
        test_image_data = b'RIFF.\x00\x00\x00WEBPVP8 "\x00\x00\x000\x01\x00\x9d\x01*\n\x00\n\x00\x01@&%\xa4\x00\x03p\x00\xfe\xfa0L f}\x19l\xc5\xd6+\x80\x00\x00'

        # Create avatar image
        avatar_image = db.AvatarImage(image_data=test_image_data)
        session.add(avatar_image)

        # Create user with avatar
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)

        # Create top wearable and its WOA image
        top_wearable_image = db.WearableImage(image_data=test_image_data)
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            wearable_image_id=top_wearable_image.id,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)
        top_woa_image = db.WearableOnAvatarImage(
            avatar_image_id=avatar_image.id,
            wearable_image_id=top_wearable_image.id,
            image_data=test_image_data,
            mask_image_data=test_image_data,
        )
        session.add(top_woa_image)

        # Create bottom wearable and its WOA image
        bottom_wearable_image = db.WearableImage(image_data=test_image_data)
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            wearable_image_id=bottom_wearable_image.id,
            category="lower_body",
            description="test bottom",
            user_id=user.id,
        )
        session.add(bottom_wearable)
        bottom_woa_image = db.WearableOnAvatarImage(
            avatar_image_id=avatar_image.id,
            wearable_image_id=bottom_wearable_image.id,
            image_data=test_image_data,
            mask_image_data=test_image_data,
        )
        session.add(bottom_woa_image)

        session.commit()

        response = client.get(
            "/images/outfit",
            params={
                "top_id": str(top_wearable.id),
                "bottom_id": str(bottom_wearable.id),
            },
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"
        assert response.headers["cache-control"] == "public, max-age=3600"

    def test_wearable_not_found(self, session: Session, client: TestClient):
        # Create avatar image and user
        avatar_image = db.AvatarImage(image_data=b"")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)

        # Create only the top wearable
        top_wearable_image = db.WearableImage(image_data=b"")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            wearable_image_id=top_wearable_image.id,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)

        session.commit()

        # Try to get outfit with non-existent bottom wearable
        response = client.get(
            "/images/outfit",
            params={"top_id": str(top_wearable.id), "bottom_id": str(uuid4())},
        )
        assert response.status_code == 404

    def test_woa_image_not_found(self, session: Session, client: TestClient):
        # Create avatar image and user
        avatar_image = db.AvatarImage(image_data=b"")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)

        # Create top wearable without WOA image
        top_wearable_image = db.WearableImage(image_data=b"")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            wearable_image_id=top_wearable_image.id,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable with WOA image
        bottom_wearable_image = db.WearableImage(image_data=b"")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            wearable_image_id=bottom_wearable_image.id,
            category="lower_body",
            description="test bottom",
            user_id=user.id,
        )
        session.add(bottom_wearable)
        bottom_woa_image = db.WearableOnAvatarImage(
            avatar_image_id=avatar_image.id,
            wearable_image_id=bottom_wearable_image.id,
            image_data=b"",
            mask_image_data=b"",
        )
        session.add(bottom_woa_image)

        session.commit()

        # Try to get outfit with missing top WOA image
        response = client.get(
            "/images/outfit",
            params={
                "top_id": str(top_wearable.id),
                "bottom_id": str(bottom_wearable.id),
            },
        )
        assert response.status_code == 404


class TestGetOutfits:
    def test_success_with_outfits(self, session: Session, client: TestClient):
        # Create user and avatar
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)

        # Create top wearable (completed WOA)
        top_wearable_image = db.WearableImage(image_data=b"top_data")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            wearable_image_id=top_wearable_image.id,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)
        top_woa_image = db.WearableOnAvatarImage(
            avatar_image_id=avatar_image.id,
            wearable_image_id=top_wearable_image.id,
            image_data=b"woa_top",
            mask_image_data=b"mask_top",
        )
        session.add(top_woa_image)

        # Create bottom wearable (pending WOA)
        bottom_wearable_image = db.WearableImage(image_data=b"bottom_data")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            wearable_image_id=bottom_wearable_image.id,
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
        assert (
            data[0]["top"]["wearable_image_url"]
            == f"/images/wearables/{top_wearable.wearable_image_id}"
        )
        assert data[0]["top"]["generation_status"] == "completed"  # WOA exists
        assert data[0]["bottom"]["id"] == str(bottom_wearable.id)
        assert data[0]["bottom"]["category"] == "lower_body"
        assert data[0]["bottom"]["description"] == "test bottom"
        assert (
            data[0]["bottom"]["wearable_image_url"]
            == f"/images/wearables/{bottom_wearable.wearable_image_id}"
        )
        assert data[0]["bottom"]["generation_status"] == "pending"  # WOA does not exist

    def test_success_no_outfits(self, session: Session, client: TestClient):
        # Create user but no outfits
        avatar_image = db.AvatarImage(image_data=b"")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)
        session.commit()

        response = client.get("/outfits")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0


class TestCreateOutfit:
    def _create_user_and_wearables(self, session: Session):
        # Create user and avatar
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=test_user_id, avatar_image_id=avatar_image.id)
        session.add(user)

        # Create top wearable
        top_wearable_image = db.WearableImage(image_data=b"top_data")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            wearable_image_id=top_wearable_image.id,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable
        bottom_wearable_image = db.WearableImage(image_data=b"bottom_data")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            wearable_image_id=bottom_wearable_image.id,
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
        # Need a separate avatar image for user 2
        avatar_image_2 = db.AvatarImage(image_data=b"avatar_data_2")
        session.add(avatar_image_2)
        user_2 = db.User(auth0_user_id="auth0|2", avatar_image_id=avatar_image_2.id)
        session.add(user_2)

        # Create bottom wearable image for user 2
        bottom_wearable_image_2 = db.WearableImage(image_data=test_webp_image_data)
        session.add(bottom_wearable_image_2)

        # Create bottom wearable for user 2
        bottom_wearable_2 = db.Wearable(
            wearable_image_id=bottom_wearable_image_2.id,
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
        # Create user and avatar
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=auth0_user_id, avatar_image_id=avatar_image.id)
        session.add(user)

        # Create top wearable
        top_wearable_image = db.WearableImage(image_data=b"top_data")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            wearable_image_id=top_wearable_image.id,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable
        bottom_wearable_image = db.WearableImage(image_data=b"bottom_data")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            wearable_image_id=bottom_wearable_image.id,
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

from uuid import UUID, uuid4
from fastapi.testclient import TestClient
import pytest
from sqlmodel import Session, create_engine, SQLModel, select
from sqlmodel.pool import StaticPool
from unittest.mock import patch

from .main import app, get_session
from .auth import verify_token
from . import db

current_user_id = "auth0|1"

# Minimal valid WebP image data
test_webp_image_data = b'RIFF.\x00\x00\x00WEBPVP8 "\x00\x00\x000\x01\x00\x9d\x01*\n\x00\n\x00\x01@&%\xa4\x00\x03p\x00\xfe\xfa0L f}\x19l\xc5\xd6+\x80\x00\x00'


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
        return {"sub": current_user_id}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[verify_token] = verify_token_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


class TestGetWearables:
    def test_success(self, session: Session, client: TestClient):
        # Create user and avatar
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
        session.add(user)

        # Create test wearables with images, associated with the current user
        wearable_image_1 = db.WearableImage(image_data=b"")
        wearable_1 = db.Wearable(
            wearable_image=wearable_image_1,
            category="upper_body",
            description="test top",
            user_id=user.id,
        )
        session.add(wearable_image_1)
        session.add(wearable_1)

        wearable_image_2 = db.WearableImage(image_data=b"")
        wearable_2 = db.Wearable(
            wearable_image=wearable_image_2,
            category="lower_body",
            user_id=user.id,
        )
        session.add(wearable_image_2)
        session.add(wearable_2)

        # Create a wearable that does not belong to the user
        other_user = db.User(auth0_user_id="auth0|2", avatar_image=avatar_image)
        session.add(other_user)

        wearable_image_3 = db.WearableImage(image_data=b"")
        wearable_3 = db.Wearable(
            wearable_image=wearable_image_3,
            category="upper_body",
            user_id=other_user.id,
        )
        session.add(wearable_image_3)
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
        self, session: Session, auth0_user_id=current_user_id
    ):
        # Create avatar image for the user
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        # Create user
        user = db.User(auth0_user_id=auth0_user_id, avatar_image=avatar_image)
        session.add(user)
        # Create test wearable image
        wearable_image = db.WearableImage(image_data=test_webp_image_data)
        session.add(wearable_image)
        # Create the Wearable record linking user and wearable image
        wearable = db.Wearable(
            category="upper_body",  # Example category
            wearable_image=wearable_image,
            user_id=user.id,
        )
        session.add(wearable)
        session.commit()
        return user, wearable, wearable_image

    def test_success(self, session: Session, client: TestClient):
        user, wearable, wearable_image = self._create_user_and_wearable(session)

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
        user_2, wearable_2, wearable_image_2 = self._create_user_and_wearable(
            session, auth0_user_id="auth0|2"
        )
        # Create user 1 (the authenticated user)
        user_1, _, _ = self._create_user_and_wearable(
            session, auth0_user_id=current_user_id
        )

        # Make request as user 1 to get wearable image belonging to user 2
        response = client.get(f"/images/wearables/{wearable_image_2.id}")
        assert (
            response.status_code == 404  # User 1 should not access user 2's image
        )


class TestCreateWearables:
    @patch("dressme.main.create_woa_image")
    def test_success(self, mock_create_woa_image, session: Session, client: TestClient):
        # Create user and avatar first
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
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
        assert wearable_image_1.image_data == test_image_data_1

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
        assert wearable_image_2.image_data == test_image_data_2

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
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
        session.add(user)

        # Create top wearable and its WOA image
        top_wearable_image = db.WearableImage(image_data=test_image_data)
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            category="upper_body",
            description="test top",
            wearable_image=top_wearable_image,
            user_id=user.id,
        )
        session.add(top_wearable)
        top_woa_image = db.WearableOnAvatarImage(
            avatar_image=avatar_image,
            wearable_image=top_wearable_image,
            image_data=test_image_data,
            mask_image_data=test_image_data,
        )
        session.add(top_woa_image)

        # Create bottom wearable and its WOA image
        bottom_wearable_image = db.WearableImage(image_data=test_image_data)
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            category="lower_body",
            description="test bottom",
            wearable_image=bottom_wearable_image,
            user_id=user.id,
        )
        session.add(bottom_wearable)
        bottom_woa_image = db.WearableOnAvatarImage(
            avatar_image=avatar_image,
            wearable_image=bottom_wearable_image,
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
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
        session.add(user)

        # Create only the top wearable
        top_wearable_image = db.WearableImage(image_data=b"")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            category="upper_body",
            description="test top",
            wearable_image=top_wearable_image,
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
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
        session.add(user)

        # Create top wearable without WOA image
        top_wearable_image = db.WearableImage(image_data=b"")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            category="upper_body",
            description="test top",
            wearable_image=top_wearable_image,
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable with WOA image
        bottom_wearable_image = db.WearableImage(image_data=b"")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            category="lower_body",
            description="test bottom",
            wearable_image=bottom_wearable_image,
            user_id=user.id,
        )
        session.add(bottom_wearable)
        bottom_woa_image = db.WearableOnAvatarImage(
            avatar_image=avatar_image,
            wearable_image=bottom_wearable_image,
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
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
        session.add(user)

        # Create top wearable (completed WOA)
        top_wearable_image = db.WearableImage(image_data=b"top_data")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            category="upper_body",
            description="test top",
            wearable_image=top_wearable_image,
            user_id=user.id,
        )
        session.add(top_wearable)
        top_woa_image = db.WearableOnAvatarImage(
            avatar_image=avatar_image,
            wearable_image=top_wearable_image,
            image_data=b"woa_top",
            mask_image_data=b"mask_top",
        )
        session.add(top_woa_image)

        # Create bottom wearable (pending WOA)
        bottom_wearable_image = db.WearableImage(image_data=b"bottom_data")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            category="lower_body",
            description="test bottom",
            wearable_image=bottom_wearable_image,
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
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
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
        user = db.User(auth0_user_id=current_user_id, avatar_image=avatar_image)
        session.add(user)

        # Create top wearable
        top_wearable_image = db.WearableImage(image_data=b"top_data")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            category="upper_body",
            description="test top",
            wearable_image=top_wearable_image,
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable
        bottom_wearable_image = db.WearableImage(image_data=b"bottom_data")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            category="lower_body",
            description="test bottom",
            wearable_image=bottom_wearable_image,
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
        user, _, bottom_wearable = self._create_user_and_wearables(session)
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
        user, top_wearable, _ = self._create_user_and_wearables(session)
        non_existent_id = uuid4()

        response = client.post(
            "/outfits",
            params={"top_id": str(top_wearable.id), "bottom_id": str(non_existent_id)},
        )
        assert response.status_code == 404

    def test_top_wrong_category(self, session: Session, client: TestClient):
        user, _, bottom_wearable = self._create_user_and_wearables(session)

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
            response.json()["error"]["message"]
            == "Top wearable must have category 'upper_body'."
        )

    def test_bottom_wrong_category(self, session: Session, client: TestClient):
        user, top_wearable, _ = self._create_user_and_wearables(session)

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
            response.json()["error"]["message"]
            == "Bottom wearable must have category 'lower_body'"
        )

    def test_wearable_not_owned(self, session: Session, client: TestClient):
        # Create user 1 (the logged-in user)
        user_1, top_wearable, _ = self._create_user_and_wearables(session)

        # Create user 2 and their bottom wearable
        # Need a separate avatar image for user 2
        avatar_image_2 = db.AvatarImage(image_data=b"avatar_data_2")
        session.add(avatar_image_2)
        user_2 = db.User(auth0_user_id="auth0|2", avatar_image=avatar_image_2)
        session.add(user_2)

        # Create bottom wearable image for user 2
        bottom_wearable_image_2 = db.WearableImage(image_data=test_webp_image_data)
        session.add(bottom_wearable_image_2)

        # Create bottom wearable for user 2
        bottom_wearable_2 = db.Wearable(
            category="lower_body",
            wearable_image=bottom_wearable_image_2,
            user_id=user_2.id,  # Belongs to user 2
        )
        session.add(bottom_wearable_2)
        session.commit()

        # Attempt to create outfit as user 1 using user 2's bottom wearable
        response = client.post(
            "/outfits",
            params={"top_id": top_wearable.id, "bottom_id": bottom_wearable_2.id},
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
        self, session: Session, auth0_user_id=current_user_id
    ):
        # Create user and avatar
        avatar_image = db.AvatarImage(image_data=b"avatar_data")
        session.add(avatar_image)
        user = db.User(auth0_user_id=auth0_user_id, avatar_image=avatar_image)
        session.add(user)

        # Create top wearable
        top_wearable_image = db.WearableImage(image_data=b"top_data")
        session.add(top_wearable_image)
        top_wearable = db.Wearable(
            category="upper_body",
            description="test top",
            wearable_image=top_wearable_image,
            user_id=user.id,
        )
        session.add(top_wearable)

        # Create bottom wearable
        bottom_wearable_image = db.WearableImage(image_data=b"bottom_data")
        session.add(bottom_wearable_image)
        bottom_wearable = db.Wearable(
            category="lower_body",
            description="test bottom",
            wearable_image=bottom_wearable_image,
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
        user, outfit = self._create_user_wearables_outfit(session)

        # Make request
        response = client.delete("/outfits", params={"id": str(outfit.id)})
        assert response.status_code == 200

        # Assert database state
        deleted_outfit = session.exec(
            select(db.Outfit).where(db.Outfit.id == outfit.id)
        ).one_or_none()
        assert deleted_outfit is None

    def test_not_found_wrong_id(self, session: Session, client: TestClient):
        user, _ = self._create_user_wearables_outfit(session)
        non_existent_id = uuid4()

        response = client.delete("/outfits", params={"id": str(non_existent_id)})
        assert response.status_code == 404

    def test_not_found_wrong_user(self, session: Session, client: TestClient):
        # Create outfit for user 2
        user2, outfit = self._create_user_wearables_outfit(session, "auth0|2")

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

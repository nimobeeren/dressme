from uuid import UUID, uuid4
from fastapi.testclient import TestClient
import pytest
from sqlmodel import Session, create_engine, SQLModel, select
from sqlmodel.pool import StaticPool
from unittest.mock import patch

from .main import app, get_session
from .wardrobe.auth import verify_token
from .wardrobe import db


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
        return {"sub": "auth0|123"}

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[verify_token] = verify_token_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


class TestGetUsers:
    def test_success(self, session: Session, client: TestClient):
        avatar_image_1 = db.AvatarImage(image_data=b"")
        user_1 = db.User(auth0_user_id="auth0|123", avatar_image=avatar_image_1)
        session.add(avatar_image_1)
        session.add(user_1)

        avatar_image_2 = db.AvatarImage(image_data=b"")
        user_2 = db.User(auth0_user_id="auth0|456", avatar_image=avatar_image_2)
        session.add(avatar_image_2)
        session.add(user_2)

        session.commit()

        response = client.get("/users")
        assert response.status_code == 200
        data = response.json()

        assert len(data) == 2
        assert data[0]["id"] == str(user_1.id)
        assert data[0]["auth0_user_id"] == user_1.auth0_user_id
        assert (
            data[0]["avatar_image_url"] == f"/images/avatars/{user_1.avatar_image_id}"
        )
        assert data[1]["id"] == str(user_2.id)
        assert data[1]["auth0_user_id"] == user_2.auth0_user_id
        assert (
            data[1]["avatar_image_url"] == f"/images/avatars/{user_2.avatar_image_id}"
        )


class TestGetWearables:
    def test_success(self, session: Session, client: TestClient):
        wearable_image_1 = db.WearableImage(image_data=b"")
        wearable_1 = db.Wearable(
            wearable_image=wearable_image_1,
            category="upper_body",
            description="test top",
        )
        session.add(wearable_image_1)
        session.add(wearable_1)

        wearable_image_2 = db.WearableImage(image_data=b"")
        wearable_2 = db.Wearable(wearable_image=wearable_image_2, category="lower_body")
        session.add(wearable_image_2)
        session.add(wearable_2)

        session.commit()

        response = client.get("/wearables")
        assert response.status_code == 200
        data = response.json()

        assert len(data) == 2
        assert data[0]["id"] == str(wearable_1.id)
        assert data[0]["category"] == wearable_1.category
        assert data[0]["description"] == wearable_1.description
        assert data[1]["id"] == str(wearable_2.id)
        assert data[1]["category"] == wearable_2.category
        assert data[1]["description"] == wearable_2.description


class TestGetWearableImage:
    def test_success(self, session: Session, client: TestClient):
        wearable_image = db.WearableImage(
            image_data=b'RIFF.\x00\x00\x00WEBPVP8 "\x00\x00\x000\x01\x00\x9d\x01*\n\x00\n\x00\x01@&%\xa4\x00\x03p\x00\xfe\xfa0L f}\x19l\xc5\xd6+\x80\x00\x00'
        )
        session.add(wearable_image)
        session.commit()

        response = client.get(f"/images/wearables/{wearable_image.id}")
        assert response.status_code == 200
        assert response.content == wearable_image.image_data

    def test_not_found(self, session: Session, client: TestClient):
        response = client.get(f"/images/wearables/{uuid4()}")
        assert response.status_code == 404


class TestCreateWearables:
    @patch("api.main.create_woa_image")
    def test_success(self, mock_create_woa_image, session: Session, client: TestClient):
        # Create test image data
        test_image_data_1 = b'RIFF.\x00\x00\x00WEBPVP8 "\x00\x00\x000\x01\x00\x9d\x01*\n\x00\n\x00\x01@&%\xa4\x00\x03p\x00\xfe\xfa0L f}\x19l\xc5\xd6+\x80\x00\x00'
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
                    "",
                ],  # empty string means no description
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

        wearable_image_2 = session.exec(
            select(db.WearableImage).where(
                db.WearableImage.id == wearable_2.wearable_image_id
            )
        ).one()
        assert wearable_image_2.image_data == test_image_data_2

        # WOA image creation should have been triggered twice
        assert mock_create_woa_image.call_count == 2

    def test_wrong_field_count(self, session: Session, client: TestClient):
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

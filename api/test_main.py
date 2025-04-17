from uuid import uuid4
from fastapi.testclient import TestClient
import pytest
from sqlmodel import Session, create_engine, SQLModel
from sqlmodel.pool import StaticPool

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
            wearable_image=wearable_image_1, category="top", description="test top"
        )
        session.add(wearable_image_1)
        session.add(wearable_1)

        wearable_image_2 = db.WearableImage(image_data=b"")
        wearable_2 = db.Wearable(wearable_image=wearable_image_2, category="bottom")
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

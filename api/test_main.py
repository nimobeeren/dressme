from fastapi.testclient import TestClient
import pytest
from sqlmodel import Session, create_engine, SQLModel
from sqlmodel.pool import StaticPool

from .main import app, get_session
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

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def test_get_users(session: Session, client: TestClient):
    avatar_image_1 = db.AvatarImage(image_data=b"")
    user_1 = db.User(name="Nimo", avatar_image=avatar_image_1)
    session.add(avatar_image_1)
    session.add(user_1)

    avatar_image_2 = db.AvatarImage(image_data=b"")
    user_2 = db.User(name="Sebastián", avatar_image=avatar_image_2)
    session.add(avatar_image_2)
    session.add(user_2)

    session.commit()

    response = client.get("/users")
    app.dependency_overrides.clear()
    data = response.json()

    assert response.status_code == 200

    assert len(data) == 2
    assert data[0]["id"] == str(user_1.id)
    assert data[0]["name"] == user_1.name
    assert data[0]["avatar_image_url"] == f"/images/avatars/{user_1.avatar_image_id}"
    assert data[1]["id"] == str(user_2.id)
    assert data[1]["name"] == user_2.name
    assert data[1]["avatar_image_url"] == f"/images/avatars/{user_2.avatar_image_id}"

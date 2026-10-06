import os

# Set the environment BEFORE any "app" import. Settings and the DB engine are created at import time.
os.environ["JWT_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ANTHROPIC_API_KEY"] = "test-key"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base, get_db  # noqa: E402
from app.limiter import limiter  # noqa: E402
from app.main import app  # noqa: E402
from app.services.story_generator import (  # noqa: E402
    GeneratedStory,
    StoryGenerationError,
    get_story_generator,
)

limiter.enabled = False


class FakeGenerator:
    """Stands in for Claude. No network calls."""

    def __init__(self):
        self.calls = []
        self.error = None

    def generate(self, keywords, level, language, is_torah, previous=None, child_age=6, length_minutes=3, prompt=None):
        self.calls.append(
            dict(
                keywords=keywords,
                level=level,
                language=language,
                is_torah=is_torah,
                previous=previous,
                child_age=child_age,
                length_minutes=length_minutes,
                prompt=prompt,
            )
        )
        if self.error:
            raise self.error
        n = len(self.calls)
        return GeneratedStory(
            title=f"Story {n}",
            content=f"Once upon a time, number {n}.",
            source_reference="Genesis 6-9" if is_torah else None,
        )


@pytest.fixture(autouse=True)
def media_dir(tmp_path, monkeypatch):
    """Recordings go to a temporary folder, never to the real media folder."""
    from app.config import settings

    monkeypatch.setattr(settings, "media_dir", str(tmp_path / "media"))
    return tmp_path / "media"


@pytest.fixture
def fake_generator():
    return FakeGenerator()


@pytest.fixture
def client(fake_generator):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_story_generator] = lambda: fake_generator
    test_client = TestClient(app)
    test_client.session_factory = Session  # tests that need their own database session use this
    yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)


def _register(client, email):
    r = client.post("/api/auth/register", json={"email": email, "password": "password123"})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
def auth(client):
    return _register(client, "one@example.com")


@pytest.fixture
def auth2(client):
    return _register(client, "two@example.com")


@pytest.fixture
def make_error():
    return StoryGenerationError

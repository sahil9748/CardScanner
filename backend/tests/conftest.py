import os
import io
import pytest
from PIL import Image, ImageDraw
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Set test environment
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["PIN_HMAC_SECRET"] = "test-hmac-secret-for-cardscan-tests-32chars"
os.environ["SECRET_KEY"] = "test-secret-key-for-admin-session-tests-32"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["LOCAL_STORAGE_DIR"] = "/tmp/cardscan_test_uploads"

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import User
from app.core.security import get_password_hash
from app.core.rate_limit import pin_rate_limiter, admin_rate_limiter
from app.services.pin_service import PinService

# Test database in memory
TEST_SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    TEST_SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    pin_rate_limiter.reset_all()
    admin_rate_limiter.reset_all()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_user(db_session):
    user = User(
        email="testadmin@cardscan.io",
        password_hash=get_password_hash("AdminTest123!"),
        role="admin",
        status="active",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_image_bytes():
    """Create a realistic dummy card image (800x500 PNG)."""
    img = Image.new("RGB", (800, 500), color=(230, 240, 255))
    draw = ImageDraw.Draw(img)
    # Draw card border and text pattern
    draw.rectangle([20, 20, 780, 480], outline=(40, 80, 160), width=6)
    draw.text((50, 50), "CARDSCAN GIFT CARD", fill=(20, 40, 90))
    draw.text((50, 120), "5000 1234 5678 9010", fill=(20, 20, 20))
    draw.rectangle([50, 300, 250, 400], fill=(70, 130, 240))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()

import os
from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "CardScan"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"

    # Environment
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Security
    SECRET_KEY: str = "supersecret-session-encryption-key-change-in-production-min-32-chars-long"
    PIN_HMAC_SECRET: str = "cardscan-pin-hmac-server-secret-never-expose-to-database-or-frontend-999"
    SESSION_COOKIE_NAME: str = "cardscan_session"
    ADMIN_COOKIE_NAME: str = "cardscan_admin_session"
    COOKIE_SECURE: bool = False  # Set to True for HTTPS in production
    COOKIE_SAMESITE: str = "lax"
    SESSION_EXPIRY_MINUTES: int = 30
    ADMIN_SESSION_EXPIRY_HOURS: int = 12

    # Database
    DATABASE_URL: str = "sqlite:///./cardscan.db"

    # Storage: "local" or "s3"
    STORAGE_BACKEND: str = "local"
    LOCAL_STORAGE_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../uploads"))
    S3_BUCKET_NAME: str = "cardscan-private-storage"
    S3_ENDPOINT_URL: Union[str, None] = None
    S3_ACCESS_KEY_ID: Union[str, None] = None
    S3_SECRET_ACCESS_KEY: Union[str, None] = None
    S3_REGION_NAME: str = "us-east-1"

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

    # Rate Limiting
    PIN_MAX_FAILED_ATTEMPTS: int = 5
    PIN_LOCKOUT_SECONDS: int = 60
    ADMIN_LOGIN_MAX_FAILED: int = 5
    ADMIN_LOGIN_LOCKOUT_SECONDS: int = 120

    # Scanner Image limits
    MAX_IMAGE_UPLOAD_BYTES: int = 15 * 1024 * 1024  # 15 MB
    ALLOWED_IMAGE_MIME_TYPES: List[str] = ["image/jpeg", "image/png", "image/webp"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()

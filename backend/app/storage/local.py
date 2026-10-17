import os
from typing import Optional
from app.core.config import settings
from app.storage.base import StorageProvider


class LocalStorageProvider(StorageProvider):
    """Local filesystem implementation of StorageProvider."""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = os.path.abspath(base_dir or settings.LOCAL_STORAGE_DIR)
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_safe_path(self, key: str) -> str:
        # Sanitize key and prevent directory traversal
        clean_key = key.lstrip("/\\").replace("..", "")
        safe_path = os.path.abspath(os.path.join(self.base_dir, clean_key))
        if not safe_path.startswith(self.base_dir):
            raise ValueError("Path traversal detected")
        return safe_path

    def save_image(self, data: bytes, key: str, content_type: str = "image/jpeg") -> str:
        safe_path = self._get_safe_path(key)
        os.makedirs(os.path.dirname(safe_path), exist_ok=True)
        with open(safe_path, "wb") as f:
            f.write(data)
        return key

    def get_image_bytes(self, key: str) -> bytes:
        safe_path = self._get_safe_path(key)
        if not os.path.exists(safe_path):
            raise FileNotFoundError(f"Image not found: {key}")
        with open(safe_path, "rb") as f:
            return f.read()

    def get_private_download_url(self, key: str, expires_in: int = 3600, filename: Optional[str] = None) -> str:
        # For local dev, download URL is proxied through the authenticated API route
        # e.g., /api/v1/storage/raw?key=...
        return f"{settings.API_V1_PREFIX}/storage/raw?key={key}"

    def delete_image(self, key: str) -> bool:
        safe_path = self._get_safe_path(key)
        if os.path.exists(safe_path):
            os.remove(safe_path)
            return True
        return False

    def image_exists(self, key: str) -> bool:
        safe_path = self._get_safe_path(key)
        return os.path.exists(safe_path)

from abc import ABC, abstractmethod
from typing import Optional, Tuple


class StorageProvider(ABC):
    """Abstract base class for private image storage providers."""

    @abstractmethod
    def save_image(self, data: bytes, key: str, content_type: str = "image/jpeg") -> str:
        """Store image bytes under key. Returns key."""
        pass

    @abstractmethod
    def get_image_bytes(self, key: str) -> bytes:
        """Retrieve raw image bytes for key."""
        pass

    @abstractmethod
    def get_private_download_url(self, key: str, expires_in: int = 3600, filename: Optional[str] = None) -> str:
        """Return authorized download/view URL."""
        pass

    @abstractmethod
    def delete_image(self, key: str) -> bool:
        """Delete image from storage."""
        pass

    @abstractmethod
    def image_exists(self, key: str) -> bool:
        """Check if image exists in storage."""
        pass

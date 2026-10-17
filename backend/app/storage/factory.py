from app.core.config import settings
from app.storage.base import StorageProvider
from app.storage.local import LocalStorageProvider
from app.storage.s3 import S3StorageProvider

_storage_singleton = None


def get_storage() -> StorageProvider:
    """Return configured storage provider singleton."""
    global _storage_singleton
    if _storage_singleton is None:
        if settings.STORAGE_BACKEND.lower() == "s3":
            _storage_singleton = S3StorageProvider()
        else:
            _storage_singleton = LocalStorageProvider()
    return _storage_singleton

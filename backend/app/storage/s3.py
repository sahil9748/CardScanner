import io
from typing import Optional
import boto3
from botocore.exceptions import ClientError
from app.core.config import settings
from app.storage.base import StorageProvider


class S3StorageProvider(StorageProvider):
    """S3-compatible private object storage provider."""

    def __init__(self):
        client_kwargs = {
            "region_name": settings.S3_REGION_NAME,
        }
        if settings.S3_ENDPOINT_URL:
            client_kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
        if settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY:
            client_kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
            client_kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY

        self.s3_client = boto3.client("s3", **client_kwargs)
        self.bucket = settings.S3_BUCKET_NAME

    def save_image(self, data: bytes, key: str, content_type: str = "image/jpeg") -> str:
        clean_key = key.lstrip("/\\")
        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=clean_key,
            Body=data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        return clean_key

    def get_image_bytes(self, key: str) -> bytes:
        clean_key = key.lstrip("/\\")
        try:
            response = self.s3_client.get_object(Bucket=self.bucket, Key=clean_key)
            return response["Body"].read()
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchKey":
                raise FileNotFoundError(f"Image not found in S3: {key}")
            raise

    def get_private_download_url(self, key: str, expires_in: int = 3600, filename: Optional[str] = None) -> str:
        clean_key = key.lstrip("/\\")
        params = {"Bucket": self.bucket, "Key": clean_key}
        if filename:
            params["ResponseContentDisposition"] = f'attachment; filename="{filename}"'

        url = self.s3_client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expires_in,
        )
        return url

    def delete_image(self, key: str) -> bool:
        clean_key = key.lstrip("/\\")
        try:
            self.s3_client.delete_object(Bucket=self.bucket, Key=clean_key)
            return True
        except ClientError:
            return False

    def image_exists(self, key: str) -> bool:
        clean_key = key.lstrip("/\\")
        try:
            self.s3_client.head_object(Bucket=self.bucket, Key=clean_key)
            return True
        except ClientError:
            return False

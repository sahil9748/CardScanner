import io
from typing import Tuple, Dict, Any
from PIL import Image
import numpy as np
import cv2
from fastapi import HTTPException, status
from app.core.config import settings


class ImageValidationError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def validate_image_upload(data: bytes) -> Dict[str, Any]:
    """
    Validate uploaded image bytes:
    1. Size within limit.
    2. Real image format (not relying on headers).
    3. Decodable by PIL and OpenCV.
    4. Minimum and maximum dimensions.
    Returns metadata dict: {width, height, format, mime_type, file_size, is_sharp}
    """
    file_size = len(data)
    if file_size > settings.MAX_IMAGE_UPLOAD_BYTES:
        raise ImageValidationError(
            f"Image exceeds maximum permitted size of {settings.MAX_IMAGE_UPLOAD_BYTES // (1024*1024)}MB"
        )
    if file_size < 30:
        raise ImageValidationError("Image file is too small or empty")

    try:
        with Image.open(io.BytesIO(data)) as img:
            img.verify()
    except Exception:
        raise ImageValidationError("Corrupted or unsupported image file")

    # Re-open to read properties (verify leaves image in closed state)
    try:
        with Image.open(io.BytesIO(data)) as img:
            format_name = img.format
            width, height = img.size
            mode = img.mode
    except Exception:
        raise ImageValidationError("Unable to decode image dimensions")

    format_upper = format_name.upper() if format_name else ""
    if format_upper not in ("JPEG", "JPG", "PNG", "WEBP"):
        raise ImageValidationError(f"Invalid image format: {format_name}. Only JPEG, PNG, WEBP are accepted.")

    # MIME type normalization
    mime_type_map = {
        "JPEG": "image/jpeg",
        "JPG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }
    mime_type = mime_type_map.get(format_upper, "image/jpeg")

    # Verify dimensions are reasonable for camera scans
    if width < 200 or height < 200:
        raise ImageValidationError("Image resolution is too low for card scanning (min 200x200)")

    # Decode with OpenCV to calculate Laplacian sharpness
    try:
        nparr = np.frombuffer(data, np.uint8)
        cv_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if cv_img is None:
            raise ImageValidationError("Failed to decode image buffer")
        gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        is_sharp = bool(laplacian_var > 15.0)
    except Exception:
        laplacian_var = 0.0
        is_sharp = True  # Fallback gracefully if OpenCV check has quirks

    return {
        "width": width,
        "height": height,
        "format": format_upper,
        "mime_type": mime_type,
        "file_size": file_size,
        "sharpness_score": round(float(laplacian_var), 2),
        "is_sharp": is_sharp,
    }


def create_thumbnail(data: bytes, max_size: Tuple[int, int] = (400, 250)) -> bytes:
    """Generate high-quality JPEG thumbnail maintaining aspect ratio."""
    with Image.open(io.BytesIO(data)) as img:
        # Convert RGBA to RGB for JPEG compatibility
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        img.thumbnail(max_size, Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue()

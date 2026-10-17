import io
from PIL import Image
import pytest
from app.vision.validator import validate_image_upload, create_thumbnail, ImageValidationError


def test_validate_valid_image(test_image_bytes):
    meta = validate_image_upload(test_image_bytes)
    assert meta["width"] == 800
    assert meta["height"] == 500
    assert meta["format"] in ("JPEG", "JPG")
    assert meta["mime_type"] == "image/jpeg"
    assert meta["file_size"] > 0
    assert "sharpness_score" in meta


def test_validate_corrupted_image():
    garbage = b"This is not a real image at all, just plain text bytes"
    with pytest.raises(ImageValidationError):
        validate_image_upload(garbage)


def test_validate_too_small_dimensions():
    # 50x50 image is too small for card scan
    img = Image.new("RGB", (50, 50), color="white")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    with pytest.raises(ImageValidationError) as exc:
        validate_image_upload(buf.getvalue())
    assert "resolution is too low" in str(exc.value.detail)


def test_create_thumbnail(test_image_bytes):
    thumb = create_thumbnail(test_image_bytes, max_size=(200, 150))
    assert len(thumb) > 0
    with Image.open(io.BytesIO(thumb)) as img:
        assert img.width <= 200
        assert img.height <= 150

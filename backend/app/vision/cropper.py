import io
from typing import Tuple, Optional, List
import cv2
import numpy as np
from PIL import Image


def order_points(pts: np.ndarray) -> np.ndarray:
    """
    Order coordinates: top-left, top-right, bottom-right, bottom-left.
    """
    rect = np.zeros((4, 2), dtype="float32")

    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # Top-Left has smallest sum
    rect[2] = pts[np.argmax(s)]  # Bottom-Right has largest sum

    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # Top-Right has smallest difference
    rect[3] = pts[np.argmax(diff)]  # Bottom-Left has largest difference

    return rect


def auto_crop_card(image_bytes: bytes, target_aspect_ratio: float = 1.586) -> bytes:
    """
    Server-side automated gift card edge detection, perspective warp, and rectification.
    1. Uses native OpenCV bilateral filtering, Canny edge detection, and contour analysis.
    2. Identifies quadrilateral card boundaries matching standard card aspect ratio (~1.586).
    3. Applies perspective transform (homography) to unskew and rectify the card into a clean rectangle.
    4. Falls back to an aligned center crop if no distinct boundary is detected.
    Returns JPEG bytes of the cropped and rectified card.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes

    img_h, img_w = img.shape[:2]
    if img_h < 100 or img_w < 100:
        return image_bytes

    # Work on a scaled-down copy for fast, noise-tolerant edge detection
    scale_w = 640
    scale = scale_w / float(img_w)
    scale_h = int(img_h * scale)
    small = cv2.resize(img, (scale_w, scale_h), interpolation=cv2.INTER_AREA)

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    blurred = cv2.bilateralFilter(gray, 9, 75, 75)
    edges = cv2.Canny(blurred, 30, 120)

    # Morphological closing to connect card perimeter gaps
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best_contour_rect = None
    max_score = -1.0
    min_area = (scale_w * scale_h) * 0.15  # Card must be at least 15% of frame
    max_area = (scale_w * scale_h) * 0.95

    center_x = scale_w / 2.0
    center_y = scale_h / 2.0

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.035 * peri, True)

        candidate_pts = None

        # Strategy A: 4-corner polygon
        if len(approx) == 4 and cv2.isContourConvex(approx):
            pts = approx.reshape(4, 2)
            candidate_pts = pts
        # Strategy B: Rotated bounding box for rounded corners
        elif 4 <= len(approx) <= 12:
            rot_rect = cv2.minAreaRect(cnt)
            rect_w, rect_h = rot_rect[1]
            rect_area = rect_w * rect_h
            if rect_area > 0 and (area / rect_area) >= 0.60:
                box = cv2.boxPoints(rot_rect)
                candidate_pts = np.intp(box)

        if candidate_pts is not None:
            # Scale points back to original image size
            orig_pts = candidate_pts.astype("float32") / scale
            ordered = order_points(orig_pts)

            # Compute dimensions
            (tl, tr, br, bl) = ordered
            width_a = np.linalg.norm(br - bl)
            width_b = np.linalg.norm(tr - tl)
            max_w = max(int(width_a), int(width_b))

            height_a = np.linalg.norm(tr - br)
            height_b = np.linalg.norm(tl - bl)
            max_h = max(int(height_a), int(height_b))

            longer = max(max_w, max_h)
            shorter = min(max_w, max_h)
            aspect = longer / float(shorter) if shorter > 0 else 1.0

            # Card aspect ratio standard is 1.586
            if 1.25 <= aspect <= 1.95:
                # Check center proximity
                cnt_center_x = float(np.mean(candidate_pts[:, 0]))
                cnt_center_y = float(np.mean(candidate_pts[:, 1]))
                dist_center = np.hypot(cnt_center_x - center_x, cnt_center_y - center_y)

                aspect_diff = abs(aspect - target_aspect_ratio)
                score = area * (1.0 - aspect_diff * 0.4) - dist_center * 20.0

                if score > max_score:
                    max_score = score
                    best_contour_rect = ordered

    # 1. If card quadrilateral was found, apply perspective transformation
    if best_contour_rect is not None:
        (tl, tr, br, bl) = best_contour_rect
        w_top = np.linalg.norm(tr - tl)
        w_bottom = np.linalg.norm(br - bl)
        h_left = np.linalg.norm(tl - bl)
        h_right = np.linalg.norm(tr - br)

        card_w = max(int(w_top), int(w_bottom))
        card_h = max(int(h_left), int(h_right))

        # Enforce landscape card orientation matching 1.586 ratio
        out_w = max(card_w, int(card_h * target_aspect_ratio))
        out_h = int(out_w / target_aspect_ratio)

        out_w = max(600, min(out_w, 2048))
        out_h = int(out_w / target_aspect_ratio)

        dst_pts = np.array([
            [0, 0],
            [out_w - 1, 0],
            [out_w - 1, out_h - 1],
            [0, out_h - 1]
        ], dtype="float32")

        M = cv2.getPerspectiveTransform(best_contour_rect, dst_pts)
        warped = cv2.warpPerspective(img, M, (out_w, out_h), flags=cv2.INTER_LANCZOS4)

        success, enc = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 95])
        if success:
            return enc.tobytes()

    # 2. Fallback: High-resolution Center Guide Box Crop
    guide_w = int(img_w * 0.78)
    guide_h = int(guide_w / target_aspect_ratio)
    if guide_h > img_h * 0.90:
        guide_h = int(img_h * 0.85)
        guide_w = int(guide_h * target_aspect_ratio)

    start_x = max(0, (img_w - guide_w) // 2)
    start_y = max(0, (img_h - guide_h) // 2)
    cropped = img[start_y:start_y + guide_h, start_x:start_x + guide_w]

    success, enc = cv2.imencode(".jpg", cropped, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if success:
        return enc.tobytes()

    return image_bytes

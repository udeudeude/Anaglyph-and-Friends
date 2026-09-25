import io

import cv2
import numpy as np


def normalise_depth(array: np.ndarray) -> np.ndarray:
    """Convert image/numeric depth data to a finite float32 0..1 map."""
    if array.ndim == 3:
        if array.shape[2] == 4:
            array = cv2.cvtColor(array, cv2.COLOR_BGRA2GRAY)
        else:
            array = cv2.cvtColor(array, cv2.COLOR_BGR2GRAY)
    if array.ndim != 2:
        raise ValueError("Depth map must be a 2D array or an image")

    original_dtype = array.dtype
    depth = np.nan_to_num(array.astype(np.float32), nan=0.0, posinf=1.0, neginf=0.0)
    if np.issubdtype(original_dtype, np.integer):
        maximum = float(np.iinfo(original_dtype).max)
        if maximum > 0:
            depth /= maximum
    else:
        minimum = float(np.min(depth))
        maximum = float(np.max(depth))
        if minimum < 0.0 or maximum > 1.0:
            span = maximum - minimum
            depth = np.zeros_like(depth) if span <= 1e-12 else (depth - minimum) / span
    return np.clip(depth, 0.0, 1.0).astype(np.float32)


def load_depth_upload(upload) -> np.ndarray:
    filename = (upload.filename or "").lower()
    raw = upload.read()
    if not raw:
        raise ValueError("Depth map file is empty")
    if filename.endswith(".npy"):
        return normalise_depth(np.load(io.BytesIO(raw), allow_pickle=False))
    encoded = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("Could not read depth map image")
    return normalise_depth(image)


def align_depth(depth: np.ndarray, target_width: int, target_height: int, mode: str = "crop") -> np.ndarray:
    """Align an arbitrary depth-map aspect ratio with the source image."""
    mode = mode.lower()
    if mode not in {"crop", "fit", "stretch"}:
        mode = "crop"
    source_h, source_w = depth.shape[:2]
    if mode == "stretch":
        return np.clip(cv2.resize(depth, (target_width, target_height), interpolation=cv2.INTER_CUBIC), 0.0, 1.0).astype(np.float32)

    source_ratio = source_w / source_h
    target_ratio = target_width / target_height
    if mode == "crop":
        if source_ratio > target_ratio:
            crop_w = max(1, int(round(source_h * target_ratio)))
            x0 = (source_w - crop_w) // 2
            depth = depth[:, x0:x0 + crop_w]
        elif source_ratio < target_ratio:
            crop_h = max(1, int(round(source_w / target_ratio)))
            y0 = (source_h - crop_h) // 2
            depth = depth[y0:y0 + crop_h, :]
        return np.clip(cv2.resize(depth, (target_width, target_height), interpolation=cv2.INTER_CUBIC), 0.0, 1.0).astype(np.float32)

    scale = min(target_width / source_w, target_height / source_h)
    width = max(1, int(round(source_w * scale)))
    height = max(1, int(round(source_h * scale)))
    resized = cv2.resize(depth, (width, height), interpolation=cv2.INTER_CUBIC)
    left = (target_width - width) // 2
    right = target_width - width - left
    top = (target_height - height) // 2
    bottom = target_height - height - top
    fitted = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_REPLICATE)
    return np.clip(fitted, 0.0, 1.0).astype(np.float32)


def apply_depth_brush(depth: np.ndarray, points, radius_fraction: float = 0.03, delta: float = 0.08) -> np.ndarray:
    """Apply smooth additive brush strokes to a normalized float32 depth map.

    Points are normalized 0..1 image coordinates. Positive delta lightens the
    depth value, negative delta darkens it. A feathered mask avoids hard edges.
    """
    result = np.clip(depth.astype(np.float32), 0.0, 1.0).copy()
    height, width = result.shape[:2]
    radius = max(1, int(round(max(0.001, min(0.25, float(radius_fraction))) * min(width, height))))
    amount = max(-1.0, min(1.0, float(delta)))
    if not points or abs(amount) <= 1e-9:
        return result

    for point in points:
        try:
            nx = float(point.get("x", 0.5))
            ny = float(point.get("y", 0.5))
        except (AttributeError, TypeError, ValueError):
            continue
        cx = int(round(max(0.0, min(1.0, nx)) * (width - 1)))
        cy = int(round(max(0.0, min(1.0, ny)) * (height - 1)))
        x0, x1 = max(0, cx - radius), min(width, cx + radius + 1)
        y0, y1 = max(0, cy - radius), min(height, cy + radius + 1)
        yy, xx = np.ogrid[y0:y1, x0:x1]
        distance = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        mask = np.clip(1.0 - distance / max(1, radius), 0.0, 1.0).astype(np.float32)
        # Smoothstep feather gives a soft but still controllable brush edge.
        mask = mask * mask * (3.0 - 2.0 * mask)
        result[y0:y1, x0:x1] += amount * mask

    return np.clip(result, 0.0, 1.0).astype(np.float32)


def adjust_depth_map(
    depth: np.ndarray,
    black: float = 0.0,
    white: float = 1.0,
    gamma: float = 1.0,
    blur_radius: float = 0.0,
) -> np.ndarray:
    """Apply levels/gamma/blur while preserving normalized float32 depth."""
    result = np.clip(depth.astype(np.float32), 0.0, 1.0)
    black = max(0.0, min(0.99, float(black)))
    white = max(black + 1e-4, min(1.0, float(white)))
    gamma = max(0.1, min(5.0, float(gamma)))
    result = np.clip((result - black) / (white - black), 0.0, 1.0)
    result = np.power(result, 1.0 / gamma).astype(np.float32)

    blur_radius = max(0.0, min(100.0, float(blur_radius)))
    if blur_radius > 0.0:
        sigma = max(0.1, blur_radius)
        result = cv2.GaussianBlur(result, (0, 0), sigmaX=sigma, sigmaY=sigma)

    return np.clip(result, 0.0, 1.0).astype(np.float32)

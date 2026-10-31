"""Independent stereo projection experiment.

This module is an original implementation of a pinhole-style horizontal
disparity field and visibility-tested image splatting. It is intentionally
isolated from the inherited anaglyph_generator.py implementation.

Input convention: RGB or BGR arrays are passed through unchanged; depth
values are finite floats in [0, 1], where 1 is nearer to the camera.
"""
from __future__ import annotations

import numpy as np


def project_eye(image: np.ndarray, depth: np.ndarray, eye_offset: float,
                convergence: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Project a view using depth-dependent horizontal shifts.

    eye_offset is the pixel shift at unit depth difference. The convergence
    plane remains stationary. Nearest-pixel splats resolve collisions by
    keeping the nearer source sample; unoccupied pixels remain masked.
    """
    pixels = np.asarray(image)
    z = np.asarray(depth, dtype=np.float32)
    if pixels.ndim != 3 or pixels.shape[2] not in (3, 4):
        raise ValueError("Expected an H x W x 3/4 color image")
    height, width, _ = pixels.shape
    if z.shape != (height, width):
        raise ValueError("Depth dimensions must match the image")
    if not np.isfinite(z).all() or (z < 0).any() or (z > 1).any():
        raise ValueError("Depth must contain finite values in [0, 1]")
    if not np.isfinite(eye_offset) or not np.isfinite(convergence):
        raise ValueError("Offsets and convergence must be finite")
    if not 0 <= convergence <= 1:
        raise ValueError("Convergence must be in [0, 1]")

    yy, xx = np.indices((height, width))
    dest_x = np.rint(xx + (z - convergence) * eye_offset).astype(np.int64)
    valid = (dest_x >= 0) & (dest_x < width)
    src_y = yy[valid]
    src_x = xx[valid]
    target_x = dest_x[valid]
    source_depth = z[valid]

    # Stable ordering: farther samples first, nearer samples overwrite them.
    order = np.argsort(source_depth, kind="stable")
    output = np.zeros_like(pixels)
    coverage = np.zeros((height, width), dtype=np.uint8)
    output[src_y[order], target_x[order]] = pixels[src_y[order], src_x[order]]
    coverage[src_y[order], target_x[order]] = 255
    return output, coverage


def stereo_pair(image: np.ndarray, depth: np.ndarray,
                maximum_disparity_px: float,
                convergence: float = 0.5) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Return left/right projected views and their respective coverage masks."""
    if not np.isfinite(maximum_disparity_px) or maximum_disparity_px < 0:
        raise ValueError("Maximum disparity must be nonnegative and finite")
    half = maximum_disparity_px / 2
    left, left_mask = project_eye(image, depth, half, convergence)
    right, right_mask = project_eye(image, depth, -half, convergence)
    return left, right, left_mask, right_mask


def repair_uncovered(view: np.ndarray, coverage: np.ndarray) -> np.ndarray:
    """Fill unobserved pixels using OpenCV Telea inpainting.

    The mask is based on geometric coverage, not pixel brightness: black
    source pixels must never be mistaken for holes.
    """
    import cv2

    if view.dtype != np.uint8 or view.ndim != 3 or view.shape[2] != 3:
        raise ValueError("Inpainting expects a uint8 three-channel image")
    if coverage.shape != view.shape[:2]:
        raise ValueError("Coverage dimensions must match")
    missing = np.where(coverage == 0, 255, 0).astype(np.uint8)
    if not np.any(missing):
        return view.copy()
    if not np.any(coverage):
        return view.copy()
    return cv2.inpaint(view, missing, 3, cv2.INPAINT_TELEA)


def red_cyan(left: np.ndarray, right: np.ndarray, *, channel_order: str = "BGR") -> np.ndarray:
    """Assemble a basic red/cyan anaglyph from two registered views."""
    if left.shape != right.shape or left.ndim != 3 or left.shape[2] != 3:
        raise ValueError("Views must have matching H x W x 3 dimensions")
    if channel_order not in ("RGB", "BGR"):
        raise ValueError("channel_order must be RGB or BGR")
    red = 0 if channel_order == "RGB" else 2
    result = right.copy()
    result[..., red] = left[..., red]
    return result

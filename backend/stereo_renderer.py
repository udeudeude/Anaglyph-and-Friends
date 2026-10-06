"""CPU stereo synthesis with subpixel visibility and background-aware repairs.

Depth is 0..1 nearness. Work in row tiles so full-resolution local exports do
not allocate a dozen full-image float arrays. No model or GPU dependency.
"""

import numpy as np


RENDERER_VERSION = "subpixel-background-v1"
SURFACE_TOLERANCE = 0.02


def sample_depth(depth, x, y):
    """Bilinear sample at normalized ORIGINAL-image coordinates."""
    x, y = float(x), float(y)
    if not np.isfinite(x) or not np.isfinite(y) or not (0 <= x <= 1 and 0 <= y <= 1):
        raise ValueError("Choose a point inside the original image")
    height, width = depth.shape
    px, py = x * (width - 1), y * (height - 1)
    x0, y0 = int(px), int(py)
    x1, y1 = min(x0 + 1, width - 1), min(y0 + 1, height - 1)
    fx, fy = px - x0, py - y0
    value = ((1 - fy) * ((1 - fx) * depth[y0, x0] + fx * depth[y0, x1])
             + fy * ((1 - fx) * depth[y1, x0] + fx * depth[y1, x1]))
    return float(np.clip(value, 0, 1))


def _repair_gaps(colors, visible_depth, gaps):
    """Use background borders at depth breaks; interpolate continuous surfaces.

The mask describes missing source coverage BEFORE repair, including frame
edges. Valid black image pixels never become gaps. Hidden texture remains an
approximation; foreground colors are excluded when a background border exists.
"""
    rows, width = gaps.shape
    cols = np.broadcast_to(np.arange(width), (rows, width))
    left = np.maximum.accumulate(np.where(~gaps, cols, -1), axis=1)
    right = np.minimum.accumulate(np.where(~gaps, cols, width)[:, ::-1], axis=1)[:, ::-1]
    has_left, has_right = left >= 0, right < width
    li, ri = left.clip(0, width - 1), right.clip(0, width - 1)
    yy = np.arange(rows)[:, None]
    lc, rc = colors[yy, li], colors[yy, ri]
    ld, rd = visible_depth[yy, li], visible_depth[yy, ri]
    fraction = ((cols - left) / np.maximum(1, right - left)).astype(np.float32)
    continuous = has_left & has_right & (np.abs(ld - rd) <= SURFACE_TOLERANCE)
    interpolated = lc * (1 - fraction[..., None]) + rc * fraction[..., None]
    choose_left = has_left & (~has_right | (ld <= rd))
    background = np.where(choose_left[..., None], lc, rc)
    repairs = np.where(continuous[..., None], interpolated, background)
    colors[gaps] = repairs[gaps]


def render_view(image, depth, displacement_px, screen_depth, tile_rows=64):
    """Return (BGR uint8 view, bool repair mask) using two-tap forward splats.

Pixels on the same surface blend at fractional coordinates. Across a depth
break, the nearer surface wins. Out-of-frame pixels are discarded rather than
collapsed onto the frame border.
"""
    height, width = image.shape[:2]
    if depth.shape != (height, width):
        raise ValueError("Depth map must match the source image")
    if not np.isfinite(displacement_px) or not np.isfinite(screen_depth):
        raise ValueError("Stereo settings must be finite")
    depth = np.clip(np.nan_to_num(depth, nan=0.5, posinf=1, neginf=0), 0, 1)
    if abs(displacement_px) < 1e-8:
        return image.copy(), np.zeros((height, width), dtype=bool)
    output = np.empty_like(image)
    repair_mask = np.zeros((height, width), dtype=bool)
    cols = np.arange(width, dtype=np.float32)[None, :]
    for y0 in range(0, height, tile_rows):
        y1 = min(height, y0 + tile_rows)
        d = depth[y0:y1].astype(np.float32)
        source = image[y0:y1].astype(np.float32)
        rows = np.broadcast_to(np.arange(y1 - y0)[:, None], d.shape)
        destination = cols + float(displacement_px) * (d - float(screen_depth))
        lo = np.floor(destination).astype(np.int32)
        fraction = destination - lo
        taps = [(lo, 1 - fraction), (lo + 1, fraction)]
        nearest = np.full(d.shape, -np.inf, dtype=np.float32)
        # Explicit visibility avoids dependence on NumPy's duplicate-index writes.
        for target, weight in taps:
            valid = (target >= 0) & (target < width) & (weight > 1e-6)
            np.maximum.at(nearest, (rows[valid], target[valid]), d[valid])
        total = np.zeros(d.shape, dtype=np.float32)
        colors = np.zeros((*d.shape, 3), dtype=np.float32)
        for target, weight in taps:
            tc = target.clip(0, width - 1)
            valid = ((target >= 0) & (target < width) & (weight > 1e-6)
                     & (d >= nearest[rows, tc] - SURFACE_TOLERANCE))
            indices = (rows[valid], target[valid])
            weights = weight[valid].astype(np.float32)
            np.add.at(total, indices, weights)
            for channel in range(3):
                np.add.at(colors[..., channel], indices, source[..., channel][valid] * weights)
        gaps = total <= 1e-6
        colors /= np.maximum(total[..., None], 1e-6)
        if gaps.any():
            _repair_gaps(colors, nearest, gaps)
        output[y0:y1] = np.rint(colors).clip(0, 255).astype(np.uint8)
        repair_mask[y0:y1] = gaps
    return output, repair_mask

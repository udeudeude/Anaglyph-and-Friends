import cv2
import numpy as np


def _hex_rgb(value: str, fallback):
    text = str(value or "").strip().lstrip("#")
    if len(text) == 3:
        text = "".join(char * 2 for char in text)
    try:
        if len(text) != 6:
            raise ValueError
        return tuple(int(text[index:index + 2], 16) for index in (0, 2, 4))
    except (TypeError, ValueError):
        return fallback


def make_anaglyph(
    left: np.ndarray,
    right: np.ndarray,
    glasses: str = "red-cyan",
    color_mode: str = "full",
    left_color: str = "#ff0000",
    right_color: str = "#00ffff",
    left_gain: float = 100.0,
    right_gain: float = 100.0,
) -> np.ndarray:
    """Combine a stereo pair for standard or calibrated color-filter glasses.

    The established red/cyan, red/green, and red/blue modes retain their
    historical color-rendering behavior. Yellow and custom profiles use the
    luminance of each eye, tinted by independently calibrated RGB output colors.
    """
    glasses = glasses.lower()
    standard = {"red-cyan", "red-green", "red-blue"}

    if glasses not in standard:
        left_gray = cv2.cvtColor(left, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        right_gray = cv2.cvtColor(right, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        left_rgb = np.array(_hex_rgb(left_color, (255, 0, 0)), dtype=np.float32) * max(0.0, min(1.5, float(left_gain) / 100.0))
        right_rgb = np.array(_hex_rgb(right_color, (0, 255, 255)), dtype=np.float32) * max(0.0, min(1.5, float(right_gain) / 100.0))
        rgb = left_gray[:, :, None] * left_rgb[None, None, :] + right_gray[:, :, None] * right_rgb[None, None, :]
        return np.clip(rgb[:, :, ::-1], 0, 255).astype(np.uint8)

    raw_mode = str(color_mode).lower()
    legacy_amounts = {"full": 100.0, "half": 50.0, "gray": 0.0}
    if raw_mode in legacy_amounts:
        color_amount = legacy_amounts[raw_mode]
    else:
        try:
            color_amount = float(raw_mode)
        except (TypeError, ValueError):
            color_amount = 100.0
        color_amount = max(0.0, min(100.0, color_amount))

    left_gray = cv2.cvtColor(left, cv2.COLOR_BGR2GRAY).astype(np.float32)
    right_gray = cv2.cvtColor(right, cv2.COLOR_BGR2GRAY).astype(np.float32)
    left_red_full = left[:, :, 2].astype(np.float32)
    right_blue_full = right[:, :, 0].astype(np.float32)
    right_green_full = right[:, :, 1].astype(np.float32)

    if color_amount >= 50.0:
        t = (color_amount - 50.0) / 50.0
        left_red = left_gray * (1.0 - t) + left_red_full * t
        right_blue = right_blue_full
        right_green = right_green_full
    else:
        t = color_amount / 50.0
        left_red = left_gray
        right_blue = right_gray * (1.0 - t) + right_blue_full * t
        right_green = right_gray * (1.0 - t) + right_green_full * t

    output = np.zeros_like(left)
    output[:, :, 2] = np.clip(left_red, 0, 255).astype(np.uint8)
    if glasses == "red-cyan":
        output[:, :, 0] = np.clip(right_blue, 0, 255).astype(np.uint8)
        output[:, :, 1] = np.clip(right_green, 0, 255).astype(np.uint8)
    elif glasses == "red-green":
        output[:, :, 1] = np.clip(right_green, 0, 255).astype(np.uint8)
    else:
        output[:, :, 0] = np.clip(right_blue, 0, 255).astype(np.uint8)
    return output


def compatibility_stereo(left: np.ndarray, right: np.ndarray, kind: str) -> np.ndarray:
    """Package a stereo pair for common display/video compatibility formats."""
    kind = kind.lower()
    if kind == "topbottom":
        return np.vstack((left, right))
    if kind == "halfsbs":
        height, width = left.shape[:2]
        half_width = max(1, width // 2)
        left_half = cv2.resize(left, (half_width, height), interpolation=cv2.INTER_AREA)
        right_half = cv2.resize(right, (width - half_width, height), interpolation=cv2.INTER_AREA)
        return np.hstack((left_half, right_half))
    if kind == "rowinterlaced":
        output = left.copy()
        output[1::2] = right[1::2]
        return output
    if kind == "columninterlaced":
        output = left.copy()
        output[:, 1::2] = right[:, 1::2]
        return output
    if kind == "checkerboard":
        output = left.copy()
        yy, xx = np.indices(left.shape[:2])
        mask = ((xx + yy) % 2) == 1
        output[mask] = right[mask]
        return output
    raise ValueError("Unknown stereo compatibility layout")

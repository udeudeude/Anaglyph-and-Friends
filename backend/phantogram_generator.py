"""Physical-plane phantogram projection.

Coordinates are millimetres. The print lies on z=0, x spans its width, and y runs
from the near edge toward the far edge. The viewer is at y=-view_distance.
Depth is interpreted as relief height above the print, not as an arbitrary 2-D warp.
"""
import cv2
import numpy as np
from PIL import Image, ImageDraw


def fit_to_print(image, depth, width, height):
    """Center-crop source and depth together, then resize to the physical print raster."""
    source_h, source_w = image.shape[:2]
    source_ratio = source_w / source_h
    target_ratio = width / height
    if source_ratio > target_ratio:
        crop_w = max(1, int(round(source_h * target_ratio)))
        x0 = (source_w - crop_w) // 2
        image = image[:, x0:x0 + crop_w]
        depth = depth[:, x0:x0 + crop_w]
    elif source_ratio < target_ratio:
        crop_h = max(1, int(round(source_w / target_ratio)))
        y0 = (source_h - crop_h) // 2
        image = image[y0:y0 + crop_h, :]
        depth = depth[y0:y0 + crop_h, :]
    image = cv2.resize(image, (width, height), interpolation=cv2.INTER_AREA if width < image.shape[1] else cv2.INTER_CUBIC)
    depth = cv2.resize(depth.astype(np.float32), (width, height), interpolation=cv2.INTER_CUBIC)
    return image, np.clip(depth, 0.0, 1.0).astype(np.float32)


def warp_ground_plane_to_print(image, depth, corners, width, height):
    """Rectify a photographed rectangular ground plane into the print rectangle.

    Corners are normalized source coordinates ordered top-left, top-right,
    bottom-right, bottom-left. Source image and depth map use the same homography
    so all later physical phantogram geometry stays registered.
    """
    if len(corners) != 4:
        raise ValueError("Ground plane requires four corners")
    source_h, source_w = image.shape[:2]
    source = []
    for point in corners:
        if len(point) != 2:
            raise ValueError("Each ground-plane corner must contain x and y")
        x = max(0.0, min(1.0, float(point[0]))) * max(1, source_w - 1)
        y = max(0.0, min(1.0, float(point[1]))) * max(1, source_h - 1)
        source.append([x, y])
    source = np.asarray(source, dtype=np.float32)
    target = np.asarray([
        [0.0, 0.0],
        [max(0, width - 1), 0.0],
        [max(0, width - 1), max(0, height - 1)],
        [0.0, max(0, height - 1)],
    ], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(source, target)
    warped_image = cv2.warpPerspective(image, matrix, (width, height), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    warped_depth = cv2.warpPerspective(depth.astype(np.float32), matrix, (width, height), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return warped_image, np.clip(warped_depth, 0.0, 1.0).astype(np.float32)


def project_relief(image, depth, print_width_mm, print_height_mm, view_distance_mm,
                   eye_height_mm, eye_x_mm, relief_mm, reverse_depth=False, tile_rows=128):
    """Project a textured height field onto the print plane with a tiled z-buffer.

    Tiling keeps peak memory bounded enough for 300/600-DPI print rasters instead of
    sorting every source pixel in one enormous array.
    """
    h, w = image.shape[:2]
    if depth.shape != (h, w):
        depth = cv2.resize(depth.astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
    d = np.clip(depth.astype(np.float32), 0.0, 1.0)
    if reverse_depth:
        d = 1.0 - d

    relief_mm = max(0.0, float(relief_mm))
    eye_y = -max(1.0, float(view_distance_mm))
    eye_z = max(relief_mm + 1.0, float(eye_height_mm))
    xs = np.linspace(-print_width_mm / 2.0, print_width_mm / 2.0, w, dtype=np.float32)[None, :]

    out = np.zeros_like(image)
    out_flat = out.reshape(-1, 3)
    zbuffer = np.full(h * w, -1.0, dtype=np.float32)
    tile_rows = max(16, min(512, int(tile_rows)))

    for y0 in range(0, h, tile_rows):
        y1 = min(h, y0 + tile_rows)
        tile_depth = d[y0:y1]
        z = tile_depth * relief_mm
        ys = np.linspace(
            print_height_mm * y0 / max(1, h - 1),
            print_height_mm * (y1 - 1) / max(1, h - 1),
            y1 - y0,
            dtype=np.float32,
        )[:, None]

        # Ray from each eye through each relief point intersects the physical print plane z=0.
        t = eye_z / np.maximum(1e-6, eye_z - z)
        px = eye_x_mm + t * (xs - eye_x_mm)
        py = eye_y + t * (ys - eye_y)
        u = np.rint((px / print_width_mm + 0.5) * (w - 1)).astype(np.int32)
        v = np.rint((py / print_height_mm) * (h - 1)).astype(np.int32)
        valid = (u >= 0) & (u < w) & (v >= 0) & (v < h)
        if not np.any(valid):
            continue

        valid_flat = valid.ravel()
        dest = (v.ravel()[valid_flat].astype(np.int64) * w + u.ravel()[valid_flat].astype(np.int64))
        zvals = z.ravel()[valid_flat]
        source = image[y0:y1].reshape(-1, 3)[valid_flat]

        # Higher relief is nearer the eye and wins destination collisions.
        np.maximum.at(zbuffer, dest, zvals)
        winners = zvals >= (zbuffer[dest] - 1e-6)
        out_flat[dest[winners]] = source[winners]

    holes = (zbuffer.reshape(h, w) < 0.0).astype(np.uint8) * 255
    if np.any(holes):
        out = cv2.inpaint(out, holes, 2, cv2.INPAINT_TELEA)
    return out


def render_phantogram(image, depth, print_width_mm=203.2, print_height_mm=152.4,
                       view_distance_mm=508.0, eye_height_mm=355.6, ipd_mm=63.0,
                       relief_mm=35.0, glasses='red-cyan', reverse_depth=False):
    left = project_relief(image, depth, print_width_mm, print_height_mm, view_distance_mm,
                          eye_height_mm, -ipd_mm / 2.0, relief_mm, reverse_depth)
    right = project_relief(image, depth, print_width_mm, print_height_mm, view_distance_mm,
                           eye_height_mm, ipd_mm / 2.0, relief_mm, reverse_depth)
    out = np.zeros_like(image)
    if glasses == 'red-green':
        out[:, :, 2] = left[:, :, 2]
        out[:, :, 1] = right[:, :, 1]
    elif glasses == 'red-blue':
        out[:, :, 2] = left[:, :, 2]
        out[:, :, 0] = right[:, :, 0]
    else:
        out[:, :, 2] = left[:, :, 2]
        out[:, :, 1] = right[:, :, 1]
        out[:, :, 0] = right[:, :, 0]
    return out, left, right


def calibration_ruler(dpi=300):
    """Return a small PNG-ready image containing a physically exact 100 mm ruler."""
    dpi = max(72, min(1200, int(dpi)))
    px_per_mm = dpi / 25.4
    width_mm, height_mm = 120.0, 28.0
    width = int(round(width_mm * px_per_mm))
    height = int(round(height_mm * px_per_mm))
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    y = int(round(13 * px_per_mm))
    x0 = int(round(10 * px_per_mm))
    x1 = int(round(110 * px_per_mm))
    line = max(1, int(round(0.35 * px_per_mm)))
    draw.line((x0, y, x1, y), fill='black', width=line)
    for mm in range(0, 101, 10):
        x = int(round((10 + mm) * px_per_mm))
        tick = 5 if mm % 50 == 0 else 3
        draw.line((x, y - int(round(tick * px_per_mm)), x, y + int(round(tick * px_per_mm))), fill='black', width=line)
        draw.text((x, y + int(round(5 * px_per_mm))), str(mm), fill='black', anchor='ma')
    draw.text((width // 2, int(round(2 * px_per_mm))), '100 mm PRINT CHECK - PRINT AT 100% / ACTUAL SIZE', fill='black', anchor='ma')
    return image

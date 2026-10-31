"""End-to-end API contract with automatic AI depth inference.

Uses a deterministic stand-in for the actual licensed Depth Anything model.
The browser model and real checkpoint are tested separately at deployment.
"""
from io import BytesIO
from tempfile import TemporaryDirectory
from unittest.mock import patch

import cv2
import numpy as np
from PIL import Image
import app as backend


def test_full_image_depth_and_stereo():
    # Test the real Flask endpoints and replacement stereo generator together.
    rgb = np.zeros((24, 36, 3), dtype=np.uint8)
    rgb[:, :, 0] = np.arange(36, dtype=np.uint8)[None, :] * 7
    rgb[6:18, 12:24, 1] = 220
    data = BytesIO()
    Image.fromarray(rgb, "RGB").save(data, "PNG")
    data.seek(0)
    depth = np.tile(np.linspace(0, 1, 36, dtype=np.float32), (24, 1))
    with TemporaryDirectory() as directory:
        with patch.object(backend, "SESSION_DATA_FOLDER", directory):
            with patch.object(backend.depth_map_generator, "generate_depth_map", return_value=depth) as infer:
                with backend.app.test_client() as client:
                    upload = client.post("/image", data={"file": (data, "photo.png")})
                    assert upload.status_code == 200, upload.json
                    result = client.get("/depth-map?generator=automatic")
                    assert result.status_code == 200, result.json
                    assert infer.call_count >= 1
                    assert client.get("/depth-map").status_code == 200
                    # The app must preserve the complete stereo pipeline.
                    source = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
                    left, right, lmask, rmask = backend.anaglyph_generator.generate_stereo_with_masks(
                        source, depth, max_disparity_percentage=4, screen_depth=0.5)
                    assert left.shape == source.shape and right.shape == source.shape
                    assert lmask.shape == depth.shape and rmask.shape == depth.shape
                    assert backend.anaglyph_generator.generate_pure_anaglyph(left, right).shape == source.shape


if __name__ == "__main__":
    test_full_image_depth_and_stereo()

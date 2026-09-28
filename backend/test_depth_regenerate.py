"""Regeneration must use the retained source and replace the active map only on success."""
from unittest.mock import patch
from tempfile import TemporaryDirectory
from io import BytesIO
import numpy as np
from PIL import Image
import app as backend


def test_local_regeneration():
    depth = np.array([[0.2, 0.8]], dtype=np.float32)
    backend.last_cleanup_at = float("inf")
    with backend.app.test_client() as client:
        with patch.object(backend, "get_ai_depth", return_value=depth) as generate, patch.object(backend, "save_active_depth") as save:
            response = client.post("/depth-map/regenerate", json={"generator": "automatic", "invert": True})
            assert response.status_code == 200, response.json
            assert response.json["generator"] == "depth-anything-v2-small"
            generate.assert_called_once_with("automatic", force=True)
            np.testing.assert_allclose(save.call_args.args[0], 1.0 - depth)
        with patch.object(backend, "get_ai_depth") as generate, patch.object(backend, "save_active_depth") as save:
            response = client.post("/depth-map/regenerate", json={"generator": "depth-anything-v3-small"})
            assert response.status_code == 400
            assert "Unsupported local depth generator" in response.json["error"]
            generate.assert_not_called()
            save.assert_not_called()


def test_browser_import_read_without_local_generator_query():
    def image_bytes(mode, value):
        data = BytesIO()
        Image.new(mode, (8, 8), value).save(data, format="PNG")
        data.seek(0)
        return data

    with TemporaryDirectory() as directory, patch.object(backend, "SESSION_DATA_FOLDER", directory), patch.dict("os.environ", {"AAF_BROWSER_DEPTH": "true"}):
        with backend.app.test_client() as client:
            response = client.post("/image", data={"file": (image_bytes("RGB", "white"), "source.png")})
            assert response.status_code == 200, response.json
            response = client.post("/depth-map/ai-import", data={"file": (image_bytes("L", 128), "browser-depth.png")})
            assert response.status_code == 200, response.json
            assert client.get("/depth-map").status_code == 200
            assert client.get("/depth-map?generator=depth-anything-v3-small").status_code == 400


if __name__ == "__main__":
    test_local_regeneration()
    test_browser_import_read_without_local_generator_query()
    print("Local regeneration and hosted depth-map read passed")

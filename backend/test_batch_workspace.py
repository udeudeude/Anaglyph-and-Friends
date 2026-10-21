"""Batch sources, maps, patterns and cleanup cannot overwrite the Studio."""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import numpy as np
from PIL import Image
import app as backend


def image_bytes(color="white", size=(40, 30), mode="RGB"):
    data = BytesIO()
    Image.new(mode, size, color).save(data, "PNG")
    data.seek(0)
    return data


def test_batch_isolation_and_downloads():
    with TemporaryDirectory() as folder, patch.object(backend, "SESSION_DATA_FOLDER", folder):
        backend.last_cleanup_at = float("inf")
        studio = backend.app.test_client()
        other = backend.app.test_client()
        assert studio.post("/image", data={"file": (image_bytes("red"), "original.png")}).status_code == 200
        assert studio.post("/depth-map/ai-import", data={"file": (image_bytes(128, mode="L"), "depth.png")}).status_code == 200
        assert studio.post("/pattern", data={"file": (image_bytes("blue", (8, 8)), "pattern.png")}).status_code == 200
        original = studio.get("/output/anaglyph?scope=full&format=png&max_disparity_percentage=1.7&screen_depth=0.38").data
        response = studio.post("/batch-workspace")
        assert response.status_code == 201, response.json
        workspace = response.json["workspace"]
        headers = {"X-AAF-Workspace": workspace}
        assert len(workspace) == 32
        # Two consecutive uploads keep the captured custom pattern.
        for color, size in [("green", (36, 24)), ("yellow", (48, 32))]:
            assert studio.post("/image", headers=headers, data={"file": (image_bytes(color, size), "batch.png")}).status_code == 200
            with patch.object(backend, "get_ai_depth", return_value=np.full((size[1], size[0]), .25, dtype=np.float32)):
                response = studio.post("/depth-map/regenerate", headers=headers, json={"generator": "automatic", "invert": True})
                assert response.status_code == 200, response.json
            result = studio.get("/output/anaglyph?scope=full&format=png&max_disparity_percentage=1.7&screen_depth=0.38", headers=headers)
            assert result.status_code == 200, result.json
            assert Image.open(BytesIO(result.data)).size == size
            depth = studio.get("/depth-map/download?kind=gray16", headers=headers)
            assert depth.status_code == 200
            decoded = np.array(Image.open(BytesIO(depth.data)))
            assert decoded.shape == (size[1], size[0]) and decoded.max() > 255
            assert abs(int(decoded[0, 0]) - int(.75 * 65535)) <= 1
            assert studio.get("/output/anaglyph?scope=full&format=png&max_disparity_percentage=1.7&screen_depth=0.38").data == original
        with studio.session_transaction() as session:
            prefix = session["session_id"]
        assert (Path(folder) / f"{prefix}__{workspace}_pattern.png").is_file()
        assert studio.delete("/batch-workspace").status_code == 400
        assert studio.delete("/batch-workspace", headers={"X-AAF-Workspace": "viewmaster"}).status_code == 400
        # Knowing a workspace ID doesn't let another cookie session read it.
        assert other.get("/depth-map/download?kind=gray16", headers=headers).status_code == 400
        assert other.delete("/batch-workspace", headers=headers).status_code == 200
        assert studio.get("/depth-map/download?kind=gray16", headers=headers).status_code == 200
        # Studio source changes must also leave existing batch data intact.
        assert studio.post("/image", data={"file": (image_bytes("red"), "changed.png")}).status_code == 200
        assert studio.get("/depth-map/download?kind=gray16", headers=headers).status_code == 200
        assert studio.delete("/batch-workspace", headers=headers).status_code == 200
        assert not list(Path(folder).glob(f"{prefix}__{workspace}_*"))
        assert (Path(folder) / f"{prefix}_image.png").is_file()


if __name__ == "__main__":
    test_batch_isolation_and_downloads()
    print("Batch workspace isolation, inverted 16-bit maps, pattern capture and scoped cleanup passed")

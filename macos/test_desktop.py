"""Dependency-free regression protection for the standalone wrapper."""

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import desktop


class DesktopRuntimeTests(unittest.TestCase):
    def test_stable_origin_for_saved_browser_profiles(self):
        self.assertEqual(desktop.DESKTOP_PORT, 8765)

    def test_writable_state_and_explicit_frozen_resources(self):
        with tempfile.TemporaryDirectory(prefix="aaf-path-test-") as directory:
            with patch.dict(os.environ, {}, clear=True), patch.object(desktop.sys, "_MEIPASS", "/read-only/app/Frameworks", create=True):
                data = desktop.configure_runtime(directory)
                self.assertEqual(data, Path(directory))
                self.assertEqual(os.environ["AAF_SESSION_DATA_FOLDER"], str(Path(directory) / "sessions"))
                self.assertEqual(os.environ["AAF_FRONTEND_DIST"], "/read-only/app/Frameworks/frontend/dist")
                self.assertEqual(os.environ["AAF_DEPTH_MODEL_DIR"], "/read-only/app/Frameworks/ai_models/checkpoints")
                self.assertEqual(os.environ["AAF_BROWSER_DEPTH"], "false")
                self.assertEqual(len(os.environ["FLASK_SECRET_KEY"]), 64)

    def test_packaging_does_not_change_hosted_dependencies(self):
        root = Path(__file__).resolve().parents[1]
        docker = (root / "Dockerfile").read_text()
        self.assertIn("backend/requirements-hosted.txt", docker)
        self.assertNotIn("requirements-desktop", docker)
        self.assertNotIn("torch==", (root / "backend/requirements-hosted.txt").read_text())
        self.assertIn("VITE_FLASK_BACKEND_API_URL", (root / ".github/workflows/macos-desktop.yml").read_text())


if __name__ == "__main__":
    unittest.main()

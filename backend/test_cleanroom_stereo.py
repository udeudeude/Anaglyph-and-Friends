"""Independent synthetic tests for the clean-room stereo experiment."""
import unittest
import numpy as np
from cleanroom_stereo import project_eye, stereo_pair, red_cyan


class StereoCoreTests(unittest.TestCase):
    def setUp(self):
        self.image = np.zeros((3, 9, 3), dtype=np.uint8)
        self.image[:, :, 0] = np.arange(9, dtype=np.uint8)
        self.depth = np.full((3, 9), 0.5, dtype=np.float32)

    def test_convergence_plane_stays_stationary(self):
        view, mask = project_eye(self.image, self.depth, 12, 0.5)
        np.testing.assert_array_equal(view, self.image)
        self.assertTrue(np.all(mask == 255))

    def test_zero_disparity_returns_original(self):
        l, r, lm, rm = stereo_pair(self.image, self.depth, 0)
        np.testing.assert_array_equal(l, self.image)
        np.testing.assert_array_equal(r, self.image)
        self.assertTrue(np.all(lm == 255))
        self.assertTrue(np.all(rm == 255))

    def test_foreground_occludes_background(self):
        image = np.zeros((1, 5, 3), dtype=np.uint8)
        image[0, 1, :] = 50
        image[0, 2, :] = 200
        depth = np.zeros((1, 5), dtype=np.float32)
        depth[0, 2] = 1
        # Source 1 stays at x=1; source 2 shifts left to x=1.
        view, mask = project_eye(image, depth, -1, 0)
        self.assertEqual(view[0, 1, 0], 200)
        self.assertEqual(mask[0, 2], 0)

    def test_black_is_valid_content(self):
        view, mask = project_eye(np.zeros((2, 2, 3), dtype=np.uint8),
                                 np.zeros((2, 2), dtype=np.float32), 0)
        self.assertTrue(np.all(mask == 255))
        self.assertTrue(np.all(view == 0))

    def test_bad_depth_is_rejected(self):
        with self.assertRaises(ValueError):
            project_eye(self.image, np.ones((2, 9)), 1)
        with self.assertRaises(ValueError):
            project_eye(self.image, np.full((3, 9), np.nan), 1)

    def test_color_channels(self):
        left = np.zeros((1, 1, 3), dtype=np.uint8)
        right = np.full((1, 1, 3), 25, dtype=np.uint8)
        left[0, 0] = [99, 88, 77]
        np.testing.assert_array_equal(red_cyan(left, right, channel_order="RGB")[0, 0],
                                      [99, 25, 25])


if __name__ == "__main__":
    unittest.main()

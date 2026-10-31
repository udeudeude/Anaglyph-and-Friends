"""Stereo conversion adapter for Anaglyph & Friends.

Original interface-compatible implementation built around the project's
separate subpixel stereo renderer. The Depth Anything model and all existing
application endpoints remain in place.
"""
from __future__ import annotations

import cv2
import numpy as np
from stereo_renderer import render_view


class AnaglyphGenerator:
    """Produce registered stereo views and BGR anaglyphs."""

    def generate_stereo_with_masks(self, image, depth_map_normalised,
                                   pop_out=True, max_disparity_percentage=25,
                                   screen_depth=None):
        if image.ndim != 3 or image.shape[2] != 3:
            raise ValueError("Expected an H x W x 3 BGR image")
        if depth_map_normalised.shape != image.shape[:2]:
            raise ValueError("Depth dimensions must match image dimensions")
        plane = (0.0 if pop_out else 1.0) if screen_depth is None else float(screen_depth)
        distance = float(max_disparity_percentage) * image.shape[1] / 200.0
        left, left_gaps = render_view(image, depth_map_normalised, distance, plane)
        right, right_gaps = render_view(image, depth_map_normalised, -distance, plane)
        return left, right, left_gaps, right_gaps

    def generate_stereo_images(self, image, depth_map_normalised,
                               pop_out=True, max_disparity_percentage=25,
                               screen_depth=None):
        left, right, _, _ = self.generate_stereo_with_masks(
            image, depth_map_normalised, pop_out,
            max_disparity_percentage, screen_depth)
        return left, right

    def generate_stereo_right_from_left(self, left_image, depth_map_normalised,
                                        pop_out=True, max_disparity_percentage=25):
        _, right, _, _ = self.generate_stereo_with_masks(
            left_image, depth_map_normalised, pop_out,
            max_disparity_percentage)
        return left_image.copy(), right

    @staticmethod
    def generate_pure_anaglyph(left_image, right_image):
        if left_image.shape != right_image.shape:
            raise ValueError("Stereo views must have identical dimensions")
        result = right_image.copy()
        result[..., 2] = left_image[..., 2]
        return result

    @staticmethod
    def generate_optimised_RR_anaglyph(left_image, right_image):
        """Apply the published Dubois red/cyan transform to BGR views."""
        if left_image.shape != right_image.shape:
            raise ValueError("Stereo views must have identical dimensions")
        # Published red/cyan coefficients are defined in RGB channel order.
        left_matrix = np.array([
            [0.4561, 0.500484, 0.176381],
            [-0.400822, -0.0378246, -0.0157589],
            [-0.0152161, -0.0205971, -0.00546856],
        ], dtype=np.float32)
        right_matrix = np.array([
            [-0.0434706, -0.0879388, -0.00155529],
            [0.378476, 0.73364, -0.0184503],
            [-0.0721527, -0.112961, 1.2264],
        ], dtype=np.float32)
        left_rgb = left_image[..., ::-1].astype(np.float32)
        right_rgb = right_image[..., ::-1].astype(np.float32)
        combined = cv2.transform(left_rgb, left_matrix) + cv2.transform(right_rgb, right_matrix)
        return np.clip(np.rint(combined), 0, 255).astype(np.uint8)[..., ::-1].copy()


anaglyph_generator = AnaglyphGenerator()

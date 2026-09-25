import numpy as np
from phantogram_generator import calibration_ruler, fit_to_print, project_relief, render_phantogram, warp_ground_plane_to_print


def main():
    h, w = 80, 120
    image = np.zeros((h, w, 3), dtype=np.uint8)
    image[:, :, 0] = np.arange(w, dtype=np.uint8)
    image[:, :, 1] = 140
    image[:, :, 2] = 220
    flat = np.zeros((h, w), dtype=np.float32)

    # Zero relief must map identically to the print plane for either eye.
    left = project_relief(image, flat, 254, 190.5, 508, 355.6, -31.5, 35)
    right = project_relief(image, flat, 254, 190.5, 508, 355.6, 31.5, 35)
    assert np.array_equal(left, image)
    assert np.array_equal(right, image)

    depth = np.tile(np.linspace(0, 1, w, dtype=np.float32), (h, 1))
    fitted_image, fitted_depth = fit_to_print(image, depth, 160, 120)
    assert fitted_image.shape == (120, 160, 3)
    assert fitted_depth.shape == (120, 160)
    assert fitted_depth.dtype == np.float32

    rectified_image, rectified_depth = warp_ground_plane_to_print(
        image,
        depth,
        [[0, 0], [1, 0], [1, 1], [0, 1]],
        w,
        h,
    )
    assert rectified_image.shape == image.shape
    assert rectified_depth.shape == depth.shape
    assert rectified_depth.dtype == np.float32
    assert np.max(np.abs(rectified_depth - depth)) < 1e-4

    perspective_corners = [[0.12, 0.18], [0.88, 0.12], [0.95, 0.92], [0.08, 0.86]]
    perspective_image, perspective_depth = warp_ground_plane_to_print(image, depth, perspective_corners, 160, 100)
    assert perspective_image.shape == (100, 160, 3)
    assert perspective_depth.shape == (100, 160)
    assert perspective_depth.min() >= 0 and perspective_depth.max() <= 1

    anaglyph, l, r = render_phantogram(image, depth, relief_mm=35)
    assert anaglyph.shape == image.shape and l.shape == image.shape and r.shape == image.shape
    assert not np.array_equal(l, r)
    assert np.all(anaglyph[:, :, 2] == l[:, :, 2])

    ruler = calibration_ruler(300)
    assert abs(ruler.width - round(120 / 25.4 * 300)) <= 1
    assert abs(ruler.height - round(28 / 25.4 * 300)) <= 1

    print('Phantogram projection tests passed')


if __name__ == '__main__':
    main()

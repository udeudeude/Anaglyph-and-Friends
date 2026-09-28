import cv2
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
    for bad_corners in (
        [[0.5, 0.5]] * 4,
        [[0, 0], [1, 0], [0, 1], [1, 1]],
        [[0, 0], [0, 0], [1, 1], [0, 1]],
        [[0, 0], [float('nan'), 0], [1, 1], [0, 1]],
    ):
        try:
            warp_ground_plane_to_print(image, depth, bad_corners, 160, 100)
        except ValueError:
            pass
        else:
            raise AssertionError('Degenerate ground-plane corners were accepted')

    # A raised point projects toward the far (top) edge of an upright print;
    # the left-eye image moves right relative to the right-eye image.
    marker = np.full((h, w, 3), 255, dtype=np.uint8)
    marker[34:46, 54:66] = 0
    raised = np.zeros((h, w), dtype=np.float32)
    raised[34:46, 54:66] = 1
    left_mark = project_relief(marker, raised, 254, 190.5, 508, 355.6, -31.5, 35)
    right_mark = project_relief(marker, raised, 254, 190.5, 508, 355.6, 31.5, 35)
    def dark_center_x(output):
        ys, xs = np.where(np.all(output < 30, axis=2))
        assert len(xs) > 10
        return float(xs.mean()), float(ys.mean())
    left_x, left_y = dark_center_x(left_mark)
    right_x, right_y = dark_center_x(right_mark)
    expected_separation = (35 / (355.6 - 35)) * 63 / 254 * (w - 1)
    assert abs((left_x - right_x) - expected_separation) < 1.2
    assert left_y < 40 and right_y < 40

    anaglyph, l, r = render_phantogram(image, depth, relief_mm=35)
    assert anaglyph.shape == image.shape and l.shape == image.shape and r.shape == image.shape
    assert not np.array_equal(l, r)
    assert np.array_equal(anaglyph[:, :, 2], cv2.cvtColor(l, cv2.COLOR_BGR2GRAY))
    # Direct color channels previously made a red subject completely invisible
    # through the cyan lens. Luminance gives both eyes real image detail.
    red = np.zeros_like(image)
    red[:, :, 2] = 255
    red_output, _, _ = render_phantogram(red, depth, relief_mm=35)
    assert np.any(red_output[:, :, 1] > 25)
    assert np.any(red_output[:, :, 0] > 25)
    legacy_color, _, _ = render_phantogram(red, depth, relief_mm=35, color_mode='color')
    assert not np.any(legacy_color[:, :, :2])
    try:
        render_phantogram(image, depth, eye_height_mm=35, relief_mm=35)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid eye height was accepted')

    ruler = calibration_ruler(300)
    assert abs(ruler.width - round(120 / 25.4 * 300)) <= 1
    assert abs(ruler.height - round(28 / 25.4 * 300)) <= 1

    print('Phantogram projection tests passed')


if __name__ == '__main__':
    main()

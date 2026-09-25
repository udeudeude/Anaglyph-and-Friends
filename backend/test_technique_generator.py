import numpy as np

from depth_sources import adjust_depth_map, align_depth, apply_depth_brush, normalise_depth
from stereo_formats import compatibility_stereo, make_anaglyph
from technique_generator import technique_generator


def sample_data(width=96, height=64):
    x = np.linspace(0, 255, width, dtype=np.uint8)
    y = np.linspace(0, 255, height, dtype=np.uint8)[:, None]
    image = np.zeros((height, width, 3), dtype=np.uint8)
    image[:, :, 0] = x
    image[:, :, 1] = y
    image[:, :, 2] = 180
    depth = np.tile(np.linspace(0.0, 1.0, width, dtype=np.float32), (height, 1))
    return image, depth


def main():
    image, depth = sample_data()

    view = technique_generator.generate_view(image, depth, 0.5, False, 2.0)
    assert view.shape == image.shape and view.dtype == np.uint8

    chroma = technique_generator.chromadepth(image, depth, 0.9, False)
    assert chroma.shape == image.shape and chroma.dtype == np.uint8

    red_cyan = make_anaglyph(image, view, 'red-cyan', 'full')
    red_green = make_anaglyph(image, view, 'red-green', 'half')
    red_blue = make_anaglyph(image, view, 'red-blue', 'gray')
    custom_pair = make_anaglyph(image, view, 'custom', 'gray', '#8040ff', '#20ff60', 75, 125)
    assert red_cyan.shape == image.shape
    assert np.all(red_green[:, :, 0] == 0)
    assert np.all(red_blue[:, :, 1] == 0)
    assert custom_pair.shape == image.shape and np.max(custom_pair) > 0
    assert not np.array_equal(red_cyan, custom_pair)

    assert compatibility_stereo(image, view, 'topbottom').shape == (image.shape[0] * 2, image.shape[1], 3)
    assert compatibility_stereo(image, view, 'halfsbs').shape == image.shape
    assert compatibility_stereo(image, view, 'rowinterlaced').shape == image.shape
    assert compatibility_stereo(image, view, 'columninterlaced').shape == image.shape
    assert compatibility_stereo(image, view, 'checkerboard').shape == image.shape

    depth_small = np.arange(24, dtype=np.uint16).reshape(4, 6)
    normalised = normalise_depth(depth_small)
    assert normalised.dtype == np.float32 and normalised.min() >= 0 and normalised.max() <= 1
    for mode in ('crop', 'fit', 'stretch'):
        aligned = align_depth(normalised, image.shape[1], image.shape[0], mode)
        assert aligned.shape == image.shape[:2]

    editable = np.full((40, 60), 0.5, dtype=np.float32)
    brushed = apply_depth_brush(editable, [{'x': 0.5, 'y': 0.5}], radius_fraction=0.1, delta=0.2)
    assert brushed.dtype == np.float32 and brushed.shape == editable.shape
    assert brushed[20, 30] > editable[20, 30]
    assert brushed[0, 0] == editable[0, 0]
    darkened = apply_depth_brush(brushed, [{'x': 0.5, 'y': 0.5}], radius_fraction=0.1, delta=-0.1)
    assert darkened[20, 30] < brushed[20, 30]

    adjusted = adjust_depth_map(np.linspace(0, 1, 2400, dtype=np.float32).reshape(40, 60), black=0.2, white=0.8, gamma=1.2, blur_radius=1.5)
    assert adjusted.dtype == np.float32 and adjusted.shape == editable.shape
    assert adjusted.min() >= 0 and adjusted.max() <= 1

    cardboard = technique_generator.cardboard(view, view, 640, 360, 121, 63, 0.92)
    assert cardboard.shape == (360, 640, 3)

    card = technique_generator.stereoscope_card(view, view, dpi=72)
    assert card.ndim == 3 and card.shape[2] == 3

    # Stereoscope card regressions: white really means no printed background ink,
    # black-card labeling is truly white, and the photograph tops stay rounded.
    black_source = np.zeros((64, 96, 3), dtype=np.uint8)
    white_card = technique_generator.stereoscope_card(black_source, black_source, dpi=72, card_tone='white', title='TEST', caption='', publisher='')
    assert np.all(white_card[0, 0] == 255)
    iw = max(120, int(round(2.85 * 72)))
    ih = max(120, int(round(2.55 * 72)))
    gap = int(round(0.35 * 72))
    x0 = (white_card.shape[1] - (iw * 2 + gap)) // 2
    y0 = max(2 + 2, int(round(0.16 * 72)))
    assert np.all(white_card[y0, x0] == 255), 'upper outside corner should remain white'
    assert np.max(white_card[y0, x0 + iw // 2]) < 80, 'center of rounded photograph crown should contain the image'

    black_card = technique_generator.stereoscope_card(black_source, black_source, dpi=72, card_tone='black', title='WHITE TEST', caption='', publisher='')
    assert np.all(black_card[0, 0] == 0)
    text_region = black_card[min(black_card.shape[0] - 1, y0 + ih):, :, :]
    assert np.max(text_region) == 255, 'black-card lettering should contain true white pixels'

    mirror_source = np.zeros((20, 30, 3), dtype=np.uint8)
    mirror_source[:, :10] = (0, 0, 255)
    mirror_card = technique_generator.mirror_stereoscope(mirror_source, mirror_source, dpi=72, card_width_in=6, card_height_in=3, image_width_in=2, image_height_in=2, mirror_gap_in=.4, reflected_eye='right', show_guide=True)
    assert mirror_card.ndim == 3 and mirror_card.shape[2] == 3
    assert mirror_card.shape[0] == 216 and mirror_card.shape[1] == 432
    assert np.any(mirror_card != 255), 'mirror stereoscope card should contain stereo image content'

    parallel = technique_generator.autostereogram(depth, style='random', separation_percent=10, depth_percent=2, dot_size=2, viewing='parallel')
    cross = technique_generator.autostereogram(depth, style='random', separation_percent=10, depth_percent=2, dot_size=2, viewing='cross')
    assert parallel.shape == image.shape
    assert cross.shape == image.shape
    assert not np.array_equal(parallel, cross)

    guided = technique_generator.autostereogram(depth, style='random', separation_percent=10, depth_percent=2, dot_size=2, viewing='parallel-guides')
    assert guided.shape[0] > image.shape[0] and guided.shape[1:] == image.shape[1:]

    patterned = technique_generator.autostereogram(depth, style='pattern', separation_percent=10, depth_percent=2)
    assert patterned.shape == image.shape
    assert np.unique(patterned.reshape(-1, 3), axis=0).shape[0] > 2

    frames = technique_generator.wiggle_frames(image, depth, frame_count=5, strength=2.0)
    assert len(frames) == 8
    assert all(frame.shape == image.shape for frame in frames)

    lenticular = technique_generator.lenticular(image, depth, 300, 200, dpi=150, lpi=60, views=3)
    assert lenticular.shape == (200, 300, 3)

    calibration = technique_generator.lenticular_calibration(dpi=150, nominal_lpi=60, span=0.2, step=0.1, width_in=2)
    assert calibration.width == 300 and calibration.height > 0

    print('Technique renderer smoke tests passed')


if __name__ == '__main__':
    main()

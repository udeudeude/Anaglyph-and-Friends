"""Stereo visibility, reconstruction, screen-depth and export contracts."""
from io import BytesIO
from tempfile import TemporaryDirectory
from unittest.mock import patch

import cv2
import numpy as np
from PIL import Image

import app as backend
from anaglyph_generator import anaglyph_generator
from stereo_renderer import render_view, sample_depth
from technique_generator import technique_generator


def test_subpixel_and_visibility():
    gradient = np.repeat(np.arange(12, dtype=np.uint8)[None, :, None] * 20, 3, axis=2)
    depth = np.ones((1, 12), dtype=np.float32)
    identity, mask = render_view(gradient, depth, 8, 1)
    np.testing.assert_array_equal(identity, gradient)
    assert not mask.any()
    half, mask = render_view(gradient, depth, .5, 0)
    np.testing.assert_array_equal(half[0, 1:, 0], np.arange(11) * 20 + 10)
    assert not mask.any()
    quarter, _ = render_view(gradient, depth, .25, 0)
    assert quarter[0, 5, 0] == 95 and half[0, 5, 0] == 90

    # Foreground moves right: exposed background must not borrow red foreground.
    image = np.zeros((3, 20, 3), dtype=np.uint8)
    image[:] = [220, 40, 20]
    image[:, 6:10] = [0, 0, 255]
    depth = np.zeros((3, 20), dtype=np.float32)
    depth[:, 6:10] = 1
    view, mask = render_view(image, depth, 3, 0)
    assert mask[:, 6:9].all() and mask.sum() == 9
    np.testing.assert_array_equal(view[:, 6:9], image[:, :3])
    assert (view[:, 9:13] == [0, 0, 255]).all(), 'Near surface must win collisions'
    tiled, tiled_mask = render_view(image, depth, 3, 0, tile_rows=1)
    np.testing.assert_array_equal(tiled, view)
    np.testing.assert_array_equal(tiled_mask, mask)

    black, mask = render_view(np.zeros_like(image), depth, 0, .5)
    assert not black.any() and not mask.any()
    left, right, lm, rm = anaglyph_generator.generate_stereo_with_masks(image, depth, False, 0)
    np.testing.assert_array_equal(left, image)
    np.testing.assert_array_equal(right, image)
    assert not lm.any() and not rm.any()
    flat = np.full(depth.shape, .4, dtype=np.float32)
    for pop_out in (True, False):
        left, right = anaglyph_generator.generate_stereo_images(image, flat, pop_out, 6, .4)
        np.testing.assert_array_equal(left, image)
        np.testing.assert_array_equal(right, image)
        for frame in technique_generator.wiggle_frames(image, flat, 3, 6, pop_out, .4):
            np.testing.assert_array_equal(frame, image)


def test_sampling():
    depth = np.array([[0, 1], [.5, .5]], dtype=np.float32)
    assert sample_depth(depth, .5, .5) == .5
    assert sample_depth(depth, 0, 0) == 0
    assert sample_depth(depth, 1, 0) == 1
    for x, y in ((-.1, .5), (1.1, 0), (float('nan'), 0), (0, float('inf'))):
        try:
            sample_depth(depth, x, y)
        except ValueError:
            pass
        else:
            raise AssertionError('Invalid image coordinate accepted')


def test_api_cache_and_clean_exports():
    image = np.zeros((20, 200, 3), dtype=np.uint8)
    image[:] = [30, 180, 210]
    image[:, 60:100] = [250, 20, 30]
    depth = np.zeros(image.shape[:2], dtype=np.float32)
    depth[:, 60:100] = 1
    source = BytesIO()
    Image.fromarray(image).save(source, format='PNG')
    source.seek(0)
    with TemporaryDirectory() as directory, patch.object(backend, 'SESSION_DATA_FOLDER', directory):
        with backend.app.test_client() as client:
            assert client.post('/image', data={'file': (source, 'source.png')}).status_code == 200
            with client.session_transaction() as session:
                session_id = session['session_id']
            with backend.app.test_request_context('/'):
                from flask import session
                session['session_id'] = session_id
                backend.save_active_depth(depth)
            response = client.get('/stereo/source')
            assert response.status_code == 200
            assert Image.open(BytesIO(response.data)).size == (200, 20)
            point = client.post('/stereo/screen-depth', json={'x': .4, 'y': .5})
            assert point.status_code == 200 and point.json['screen_depth'] == 1
            assert client.post('/stereo/screen-depth', json={'x': -1, 'y': .5}).status_code == 400
            assert client.get('/render?screen_depth=nan').status_code == 400
            assert client.get('/render?screen_depth=2').status_code == 400
            assert client.get('/render?max_disparity_percentage=nan').status_code == 400

            query = 'format=png&pop_out=true&max_disparity_percentage=6&screen_depth=0'
            with patch.object(backend.anaglyph_generator, 'generate_stereo_with_masks', wraps=backend.anaglyph_generator.generate_stereo_with_masks) as generate:
                meta = client.get('/render?' + query).json
                assert meta['screen_depth'] == 0 and meta['repair_percent'] > 0
                client.get('/render?' + query)
                assert generate.call_count == 1, 'Matching settings must reuse the cache'
                client.get('/render?' + query.replace('screen_depth=0', 'screen_depth=1'))
                assert generate.call_count == 2, 'Plane change must regenerate both eyes'

            def output(kind, extra=''):
                response = client.get('/output/' + kind + '?' + query + extra)
                assert response.status_code == 200, response.data
                return cv2.imdecode(np.frombuffer(response.data, np.uint8), cv2.IMREAD_COLOR)

            for kind in ('left', 'right', 'anaglyph', 'parallel', 'cross', 'topbottom', 'halfsbs', 'rowinterlaced', 'columninterlaced', 'checkerboard'):
                for swap in ('false', 'true'):
                    clean = output(kind, '&swap_eyes=' + swap)
                    marked = output(kind, '&swap_eyes=' + swap + '&repairs=true')
                    assert clean.shape == marked.shape
                    assert np.any(clean != marked), (kind, swap)
                    np.testing.assert_array_equal(output(kind, '&swap_eyes=' + swap + '&repairs=true&download=true'), clean)
                    full = output(kind, '&scope=full&swap_eyes=' + swap)
                    np.testing.assert_array_equal(output(kind, '&scope=full&swap_eyes=' + swap + '&repairs=true'), full)

            # The overlay changes only the missing-coverage pixels.
            left = output('left')
            marked = output('left', '&repairs=true')
            with backend.app.test_request_context('/'):
                session['session_id'] = session_id
                mask_path = backend.cache_paths('preview')['left_repair']
            mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE) > 0
            np.testing.assert_array_equal(left[~mask], marked[~mask])
            assert client.post('/depth-map/edit', json={'operation': 'brush', 'points': [{'x': .4, 'y': .5}], 'radius': .1, 'delta': -.3}).status_code == 200
            with patch.object(backend.anaglyph_generator, 'generate_stereo_with_masks', wraps=backend.anaglyph_generator.generate_stereo_with_masks) as generate:
                assert client.get('/render?' + query).status_code == 200
                assert generate.call_count == 1, 'Depth edits must invalidate eyes and masks'


if __name__ == '__main__':
    test_subpixel_and_visibility()
    test_sampling()
    test_api_cache_and_clean_exports()
    print('Subpixel stereo, background repair, plane sampling, cache invalidation and clean exports passed')

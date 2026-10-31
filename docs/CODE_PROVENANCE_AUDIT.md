# Code provenance audit: Anaglyph & Friends

Date: 2026-10-30. This project is a fork of [Senacen/Anaglyph-AI](https://github.com/Senacen/Anaglyph-AI), credited to Duy Huynh. No upstream root LICENSE was found. Public availability is not permission to redistribute or relicense its code. **Do not apply a blanket AGPL license to this combined implementation.**

## Direct source comparisons

Exact matching *distinct trimmed lines longer than 25 characters* in corresponding files on the current default branches. This is a triage signal, not a complete similarity or copyright analysis.

| File | Upstream chars | Current chars | Matching long lines / upstream long lines |
|---|---:|---:|---:|
| backend/anaglyph_generator.py | 12,874 | 9,370 | 105/138 |
| backend/depth_map_generator.py | 7,299 | 7,198 | 18/89 |
| backend/app.py | 12,867 | 49,948 | 17/166 |
| frontend/src/ImageUpload.tsx | 13,079 | 41,941 | 11/136 |
| frontend/src/AnaglyphEditor.tsx | 6,082 | 37,581 | 3/59 |
| frontend/src/App.tsx | 1,245 | 12,171 | 4/14 |
| frontend/src/main.tsx | 237 | 2,426 | 5/5 |
| frontend/src/styles/index.css | 1,222 | 490 | 3/12 |
| frontend/package.json | 749 | 782 | 8/8 |

The stereo core retains substantial inherited implementation; expanded frontend files still need provenance review. Nonmatching code is not automatically original.

## Independent implementation plan

1. Freeze current feature specifications and create regression fixtures for stereo geometry, occlusion, depth normalization, color mixing, batch processing, and output formats. Use independently created test images.
2. Independently implement stereo warp/disparity, depth ordering, fractional-pixel sampling, gap reconstruction, and anaglyph color transforms from mathematical and published technical descriptions, **not by translating upstream source**.
3. Replace inherited depth-loading wrappers with independent adapters; check Depth Anything source and checkpoint licenses separately.
4. Replace inherited Flask routes/helpers, retaining independently developed APIs and all current user-facing functionality.
5. Reimplement inherited React upload/editor components from functional specifications, retaining batch workflows and 3D techniques; replace inherited expressive assets and UI text.
6. Inventory dependencies, fonts, icons, images, model files, and release artifacts; preserve third-party license notices.
7. Perform final file and Git-history provenance review and functional tests. New independently authored code can then be licensed AGPL-3.0-or-later.
8. Consider publishing the clean implementation in a **new repository with independent Git history**: removing files from a fork does not remove the upstream history. Preserve truthful historical attribution in documentation.

## Distribution caution

The current public fork and downloadable releases may still include code whose redistribution permission is unresolved. Seek written upstream permission or avoid distributing inherited implementation while replacing it. This report is not a legal clearance. User photos and third-party model weights are not automatically licensed by any future AGPL grant.

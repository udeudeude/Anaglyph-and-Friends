# Anaglyph & Friends technical reference

[Back to the main README](../README.md)

This document keeps the detailed implementation, interface, format, and architecture notes that would otherwise overwhelm the repository front page.

## Hosted vs local processing

The two editions deliberately split the expensive depth-estimation step differently:

- **Hosted web edition:** Depth Anything V2 runs in the browser (WebGPU where available, otherwise browser CPU). This avoids trying to fit PyTorch and the model into Render's small free server. The generated depth map is then sent to the backend for the established stereo and print pipeline. The first successful use may need to download the browser AI library/model. If that stage fails, the interface now distinguishes download/startup/inference failures, keeps the source image loaded, and provides **Retry AI depth** without making the user choose the image again.
- **Local edition:** the Python backend runs Depth Anything V2 directly with PyTorch. This remains the better route for offline use and for machines where browser inference is undesirable.

The optional **AI depth generator** control is tucked away in Studio and View-Master. Automatic (recommended) uses Depth Anything V2 Small in both editions. The hosted browser edition also offers Depth Anything V3 Small as an explicit choice; its first use downloads about 105 MB of model files and may require a capable browser/device. The local edition continues to use V2. See [depth generator research and adapter contract](docs/DEPTH_GENERATORS.md).

Both editions can also use an imported depth map or an imported left/right stereo pair. Imported stereo pairs can optionally carry a depth map aligned to the left-eye image; that map unlocks ChromaDepth, multi-view wiggle, and random-dot/pattern autostereograms without pretending that depth can be recovered reliably from every arbitrary stereo pair.

## Known validation / roadmap

The hosted architecture has now been exercised with repeated real use after removing server-side PyTorch from the Render build. GitHub also builds and starts the same production Docker image, checks its lightweight health endpoint, and verifies that the compiled frontend is served before changes reach Render.

The current code intentionally leaves physical calibration items explicit rather than pretending uncertain real-world measurements are exact:

- **View-Master physical geometry:** reel/frame/transport dimensions remain labeled prototype until checked against a real reel and viewer.
- **Single-mirror stereoscope:** the generic software layout is implemented; an exact DK/book preset still requires measurements from the real object.
- **Polarized projection:** software alignment, crosstalk tests, linear/circular choices, independent projector windows, and projector exports are implemented, but real two-projector/filter/silver-screen testing remains hardware-dependent.
- **Physical color-filter calibration:** exact screen and print profiles require the actual glasses/filters, display, printer, ink, paper, and illumination.
- **Lenticular and phantogram calibration:** final physical defaults still depend on real printer/material/viewer tests.

## Current techniques

### Direct stereo / glasses

- **Anaglyph**, including red/cyan, red/green, red/blue, and arbitrary two-color filter calibration
  - separate screen and print calibration values
  - saved named glasses/filter profiles stored in the browser
- **Parallel stereo**
- **Cross-eyed stereo**
- **ChromaDepth**, with depth-coded spectral color while retaining image brightness

### Viewer formats

- **Cardboard / phone VR viewer**
  - Google Cardboard-style starting preset
  - generic phone-viewer preset
  - editable screen resolution, physical screen width, lens-center separation, and image fill
- **Traditional stereoscope card**
  - Holmes-style 7 × 3.5 inch starting preset
  - traditional arched photograph tops
  - configurable print DPI, card/image dimensions, spacing, mount color, and arch depth
  - title, caption, and publisher/credit text rendered directly onto the card
- **Single-mirror stereoscope**
  - configurable card and image dimensions
  - configurable mirror gap and reflected eye
  - reflected eye is horizontally reversed for mirror restoration
  - optional mirror-placement guide
  - intentionally generic until a specific physical viewer/book is measured

### Autostereograms

- **Random-dot stereogram**
  - parallel or cross-eyed interpretation
  - dot size, separation, depth strength, and monochrome/color dots
- **Pattern stereogram**
  - built-in repeating geometric texture
  - optional user-uploaded pattern image
  - parallel/cross-eyed and depth/separation controls

### Animation

- **Wiggle-gram**
  - multiple synthesized virtual viewpoints rather than simple left/right alternation
  - configurable viewpoint count and frame timing
  - looping GIF output
- **Pulfrich Motion 3D**
  - smooth horizontal depth-dependent motion generated from the active depth map
  - intended for a neutral-density / dark filter over one eye
  - configurable darkened eye, motion depth, frame count, and timing
  - looping GIF output

### Compositing and color-filter layered artwork

- **Layered 3D Composite**
  - overlays one independent foreground object on the current depth-generated base stereo scene
  - transparent PNG/WebP foregrounds preserve alpha
  - move, scale, rotate, and adjust opacity independently
  - independent stereo depth position can place the layer in front of or behind the base plane
  - optional grayscale foreground depth adds internal relief instead of treating the object as a flat card
  - outputs the composited left/right views as the current anaglyph profile, parallel stereo, cross-eyed stereo, or individual eye images
  - full-resolution PNG export
- Layered projects can be saved and reopened as portable JSON files that embed the foreground image, optional object depth map, and compositor settings
- **RGB Reveal / CMY Layers**
  - combine three independent source images as cyan, magenta, and yellow separations
  - red-, green-, and blue-filter simulations
  - independent layer strength
  - full-resolution composite and separation proof downloads
  - intended for Carnovsky-family color-filter artwork rather than stereo

### Physical print techniques

- **Print calibration & setup** (under **More techniques -> Advanced tools**)
  - one-click general calibration sheet using a ready-to-use Letter / 300 DPI default
  - exact 100 mm and 4 inch scale rulers
  - registration targets, grayscale ramp, RGB/CMY/filter patches, and fine-line tests
  - embedded PNG physical-resolution metadata
  - optional A4/custom page sizes and selectable test sections under a collapsed **Advanced print setup** panel
  - optional saved printer/paper/material profiles and a setup JSON export for recording the exact test conditions
  - normal users do not encounter these controls unless they deliberately open the calibration tool
- **Prepare print page** (under **More techniques -> Advanced tools**)
  - send the current static 3D Studio output directly with **Prepare print page**, without downloading and re-uploading it
  - imported stereo-pair Studio outputs can use the same direct handoff
  - or place any finished PNG/JPEG/WebP artwork on a Letter, A4, or custom physical page
  - set intended artwork width and margins while preserving aspect ratio
  - optional crop marks, registration targets, 50 mm scale bar, title, print instructions, and page metadata
  - export a print-page PNG with embedded physical DPI metadata
  - export the page settings as JSON for traceability
- **Lenticular 3D interlacing**
  - 60 LPI / 600 DPI / 6-view starting preset
  - 50 LPI and 40 LPI starting presets
  - editable printer DPI, measured LPI, physical print size, number of views, and lenticule slant
  - multi-view synthesis from the AI depth map
  - printable **black/white calibration bars** across a user-selected LPI range
  - calibration PNG includes DPI metadata; print it at **100% / Actual Size with all fit-to-page scaling disabled**
- **Phantogram**
  - separate physical-print workspace using the current source and active depth map
  - AI-relief mode treats the depth map as a height field above a flat print and projects it from two physical eye positions
  - calibrated ground-plane mode lets you mark four corners of a photographed rectangular plane and perspective-rectifies that plane to the physical print before stereo projection
  - configurable print size, DPI, viewing distance, eye height, eye separation, maximum relief, and depth direction
  - red/cyan, red/green, and red/blue output
  - hollow wireframe cube and two tetrahedron orientations on one US Letter landscape vector PDF, with three labeled eye-height or viewing-distance candidates and a 50 mm print check
  - viewing comparison accessible above all phantogram source modes; marked-plane mode can download a known 8 × 6 inch rectangle to photograph under a small object
  - print-ready PNG with physical DPI metadata
  - downloadable exact **100 mm calibration ruler** for checking printer scaling
  - experimental: arbitrary photographs are interpreted as textured reliefs; calibrated ground-plane rectification is available when the photograph contains a known rectangular plane

### Display and compatibility formats

- **Half-width side-by-side**
- **Top / bottom stereo**
- **Row-interlaced stereo**
- **Column-interlaced stereo**
- **Checkerboard stereo**

Device- and print-specific information is deliberately hidden until that technique is selected. Each such mode opens with a practical standard starting point rather than an empty form. Calibration and printer-management controls are treated as advanced tools: they remain available, but the ordinary image-making workflow does not require users to see or understand them.

## Interface

The local frontend is a dark desktop-style workspace with:

- top-level **3D Studio**, **View-Master Reel**, and **Polarized Projection** workspaces;
- dual-projector presentation windows that can be moved to separate displays and independently fullscreened;
- **Phantogram** lives under **More techniques -> Print** inside 3D Studio;
- drag-and-drop, file-picker, and clipboard-paste image loading;
- full-resolution source retention;
- source and depth-map inspection views;
- a resizable/collapsible source sidebar;
- fast Red/Cyan, Parallel, and Cross-Eyed controls plus a grouped **More techniques** selector;
- technique-specific configuration panels that appear only when relevant;
- discrete controls such as buttons, selectors, and toggles applying immediately, while sliders can be adjusted first and then committed with **Apply settings** to avoid repeated expensive renders;
- independent on-screen preview sizing;
- zoom and pan for preview inspection;
- fullscreen viewing on black with technique controls available near the bottom edge;
- full-quality downloads;
- individual left/right-eye downloads for stereo-based techniques;
- downloadable 16-bit and raw float32 depth maps;
- browser-local persistence for rendering, viewer, and print settings.

### Keyboard shortcuts

There is intentionally **no global regenerate shortcut**.

| Key | Action |
| --- | --- |
| `R` | Red/cyan anaglyph |
| `V` | Parallel view |
| `X` | Cross-eyed view |
| `F` | Fullscreen selected output |
| `D` | Download selected output |
| `Command-S` / `Ctrl-S` | Download/save the selected output instead of invoking the browser's Save Page command |
| `U` | Open image chooser |
| `Command-O` / `Ctrl-O` | Open image chooser |
| `Command-V` | Paste an image using the normal macOS paste action |
| `Command-Z` / `Ctrl-Z` | Undo a depth edit while the depth editor is open |
| `Command-Shift-Z` / `Ctrl-Shift-Z` | Redo a depth edit |
| `Ctrl-Y` | Redo a depth edit on platforms that use the Windows convention |
| `Esc` | Leave the depth editor or close the image-inspection overlay |

No casual keyboard shortcut changes stereo strength, Pop Out, lenticular calibration, or other rendering parameters.

## Full-resolution architecture

Earlier versions resized uploads to a maximum dimension of 1500 pixels. The current application does **not** discard the original resolution.

The pipeline now separates interactive previews from final rendering:

1. Retain the decoded source at original pixel dimensions.
2. Estimate and retain a normalized source-size depth map.
3. Build smaller interactive products when a technique permits it.
4. Cache the ordinary left/right stereo pair for reuse by Red/Cyan, Parallel, Cross-Eyed, Cardboard, stereoscope, and eye-view exports.
5. Create final static downloads from the full-resolution source or, for physical print techniques, from the requested print dimensions and DPI.

Special formats such as wiggle-grams, autostereograms, ChromaDepth, lenticular interlacing, phantograms, and layered 3D compositing reuse the same source/depth foundation but have their own rendering modules. The layered compositor first generates the ordinary base stereo pair, then synthesizes the imported foreground independently for each eye before combining the result.

## Shared stereo controls

Stereo-based techniques expose:

- **3D strength**, maximum disparity from 0% to 6% of image width;
- **Pop Out**, changing the depth/disparity orientation;
- **On-screen preview size**, which affects only display size and never download resolution.

The Red/Cyan technique additionally offers **Reduce retinal rivalry**.

## Depth-map downloads and imports

The source sidebar exposes:

- **16-bit depth PNG**: full source dimensions, normalized 0-65535 depth values;
- **Raw float32**: normalized depth in NumPy `.npy` format;
- **Color map**: the colored visualization used by the interface;
- **Editable depth controls**: choosing **Edit depth map** automatically opens a large focused editing canvas; paint directly on the active map with a feathered raise/lower brush, draw a rectangular selection with optional feathering so edits affect only part of the image, adjust black/white points and gamma, apply blur, undo/redo individual edit steps, or reset the edit session.

Depth edits are applied to the underlying float32 map on the backend, not to the 8-bit color preview, so later downloads and 3D techniques use the edited high-precision data. The float32/16-bit products remain preferable to the colored visualization for external image-processing work.

A replacement depth map can also be imported from PNG, JPEG, TIFF, WebP, or float32 `.npy` data. Imported maps can be cropped, fitted, or stretched to match the source and can have near/far depth inverted. The selected depth source is then used by all techniques.

In **Stereo pair** source mode, an additional optional depth file can be attached to the imported pair. It is explicitly registered to the left-eye image, with crop/fit/stretch and near/far inversion controls. Ordinary stereo outputs continue to use the original left/right images directly; ChromaDepth, wiggle-gram, and autostereogram outputs use the left-eye image plus this optional depth map in an isolated backend workspace.

## How conversion works

Core pipeline:

`single image -> Depth Anything V2 -> normalized depth -> selected 3D renderer / presentation`

For ordinary stereo formats, normalized depth becomes horizontal disparity, creating synthetic left/right views. OpenCV Telea inpainting fills holes revealed by displaced foreground objects.

A monocular source does not contain genuinely hidden surfaces, so generated views inevitably have limitations around occlusion boundaries.

The newer technique renderers build on the same depth map:

- ChromaDepth maps near/far depth into spectral color;
- autostereograms vary repeating-pattern separation by depth;
- wiggle-grams synthesize a sequence of virtual camera offsets;
- lenticular output synthesizes several viewpoints and interlaces them according to printer DPI and calibrated lenticular pitch;
- Phantograms project a 3D model from independent left/right eye positions onto the print plane. A built-in wireframe comparison sheet helps check three viewing positions on one print. Photograph + AI depth modes can make an approximate height-field study, but relative depth alone does not reconstruct the original camera or an object's true position above a real ground plane. The marked-plane mode accepts four user-selected corners, optionally from a printable 8 × 6 inch reference plane photographed under an object. See [phantogram setup and limits](docs/PHANTOGRAMS.md).

## Local/offline operation - technical reference

Once dependencies, Depth Anything V2 source, and its checkpoint are installed, image processing works without an Internet connection.

The backend expects:

```text
backend/ai_models/Depth_Anything_V2/depth_anything_v2/...
backend/ai_models/checkpoints/depth_anything_v2_vits.pth
```

The requirements use the stack successfully tested on the 2015 Intel MacBook Pro used for this project:

- Python 3.10.4
- PyTorch 2.2.2
- torchvision 0.17.2
- NumPy 1.26.4

The Flask backend defaults to `http://localhost:8000`. Debug/reloader mode is off by default so the AI model is not loaded twice on an older machine.

Vite normally serves the interface at `http://localhost:5173` and talks to `http://localhost:8000` by default.

The backend accepts `AAF_TORCH_DEVICE=cpu`, `mps`, or `cuda` as an explicit device override. On Intel macOS systems where MPS is exposed, PyTorch CPU fallback is enabled before PyTorch loads so unsupported MPS operators can execute on CPU.

## Important backend endpoints

Core:

- `POST /image` - retain the full-resolution source.
- `POST /pattern` - store an optional texture for pattern stereograms.
- `GET /depth-map` - return the colored depth preview.
- `GET /depth-map/download?kind=gray16|npy|color` - depth-map exports.
- `POST /depth-map/edit` - float32 brush, levels/gamma/blur, and reset operations.
- `GET /render` - build/cache the interactive ordinary stereo pair.
- `GET /prepare-full` - build/cache a full-resolution ordinary stereo pair.
- `GET /output/<kind>` - `anaglyph`, `parallel`, `cross`, `left`, or `right`.

Technique renderers:

- `GET /special/chromadepth`
- `GET /special/cardboard`
- `GET /special/stereoscope`
- `GET /special/mirror-stereoscope`
- `GET /special/wiggle`
- `GET /special/pulfrich`
- `GET /special/autostereogram?style=random|pattern`
- `GET /special/lenticular`
- `GET /lenticular/calibration`
- `GET /special/phantogram` - AI-relief or calibrated-ground-plane physical projection
- `GET /phantogram/calibration`

Legacy `/anaglyph` and `/stereo-pair` routes remain for compatibility.

## Project structure

```text
backend/
  app.py
  depth_map_generator.py
  anaglyph_generator.py
  technique_generator.py       specialized viewer / print / animation renderers
  phantogram_generator.py      physical-plane AI relief projection
frontend/src/
  App.tsx
  ImageUpload.tsx
  AnaglyphEditor.tsx           technique-studio orchestration
  TechniqueControls.tsx        conditional device/print/technique settings
  PhantogramBuilder.tsx        physical phantogram workspace
  ViewMasterBuilder.tsx        seven-scene reel workspace
  techniques.ts                technique definitions and starting presets
ROADMAP.md                      deliberately deferred and potential future techniques
```

## Future work

See **[ROADMAP.md](ROADMAP.md)**. The core editable depth map, layered compositor, Pulfrich animation, and marked ground-plane phantogram are implemented. Follow-up work includes a self-contained macOS package, stronger source-camera calibration for photograph-based phantograms, and physical-print validation. Other possible additions include MPO/stereo JPEG, additional display/viewer profiles, historical stereograph templates, and measured lenticular profiles.

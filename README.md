# Anaglyph & Friends

> GitHub repository: `udeudeude/Anaglyph-and-Friends`  
> Application name: **Anaglyph & Friends**

Anaglyph & Friends turns one ordinary photograph into a growing collection of stereoscopic, autostereoscopic, viewer-specific, animated, and print-oriented 3D formats using a **Depth Anything V2** monocular depth estimate.

**Public web app:** https://anaglyph-and-friends.onrender.com

The hosted edition runs Depth Anything V2 in the visitor's browser, then uses the lightweight hosted backend for stereo/output rendering. The local edition retains the Python/PyTorch model and can work offline after setup. Render's free service can take tens of seconds to wake after inactivity.

**This expanded version was created with help from ChatGPT.** If you are new to GitHub, Terminal, Python, or Node, using ChatGPT as an installation companion is a perfectly reasonable way to get started. Give it the URL of this repository and ask something like:

> I want to use this on my computer, but I am new to GitHub and Terminal. Please walk me through it one step at a time, and wait for me after each step.

If something fails, paste the exact error message into the same chat. That is often much easier than trying to decode a developer-oriented error message yourself.

The original Anaglyph AI project and hosted demonstration were created by **Duy Huynh**. This repository version extends the original application for local/offline stereoscopic experimentation.

## New to GitHub? Start here

You can use the **hosted web edition** without installing anything, download the **standalone Mac edition**, or set up the **local developer edition** from source.

### Download the Mac app — no Terminal setup

The [Mac downloads](https://github.com/udeudeude/Anaglyph-and-Friends/releases/latest) include Python, the built interface and the local Depth Anything V2 Small model. Choose **Intel** or **Apple Silicon**, unzip, drag the app into Applications, then double-click it. Its small control window opens the workspace in your normal browser; keep it open while working and use **Quit** when finished. Images stay on your Mac and V2 works offline. No separate Python, Node or model installation is required.

The first packages are **not Apple-notarized**. If blocked, follow [Apple's Open Anyway instructions](https://support.apple.com/102445), without disabling Gatekeeper globally. Cloud testing covers macOS 15 Intel and macOS 14 Apple Silicon; older versions and downloaded Finder/Gatekeeper behavior still need testing. This local package uses the established V2 model; the hosted edition continues to offer browser V2/V3. See [standalone release notes](macos/RELEASE-NOTES.md).

### Developer installation from source

The source edition below needs one-time setup in Terminal; afterward, its Mac launcher starts both parts with a double-click. The existing developer installation remains available and is not replaced by the packaged edition.

The beginner guide below is for **macOS**, which is the environment this version has actually been tested on. Windows and Linux should use the same overall architecture, but some installation and virtual-environment commands differ.

### The basic mental model

There are four pieces:

1. **GitHub** stores the project. `git clone` copies it onto your Mac.
2. **Python / Flask** runs the backend that creates the depth map and 3D images.
3. **Node / Vite** runs the frontend that you see in your web browser.
4. The Mac launcher starts both parts, waits for them to be ready, and opens the browser. A second launcher stops them.

Everything runs on your own computer. After the software and AI model have been downloaded once, image processing can work offline.

### 1. Check the required software

You need:

- **Git**
- **Python 3.10.x** - tested with Python 3.10.4
- **Node.js 20 or newer**, including npm - tested with Node 24.20.0

Open **Terminal** on your Mac and paste these commands one at a time:

```bash
git --version
python3 --version
node --version
npm --version
```

If all four print version numbers, continue to the next step.

If `git --version` causes macOS to offer to install Command Line Developer Tools, accept that installation and then try the command again.

If Python is missing or is not a Python 3.10 release, install Python 3.10 from [python.org](https://www.python.org/downloads/). If Node or npm is missing, install a current Node.js release from [nodejs.org](https://nodejs.org/).

### 2. Copy Anaglyph & Friends to your Mac

The following puts it on your Desktop. In Terminal:

```bash
cd ~/Desktop
git clone https://github.com/udeudeude/Anaglyph-and-Friends.git
cd Anaglyph-and-Friends
```

`git clone` is simply GitHub's way of saying "make a local copy of this project and remember where it came from."

If you prefer GitHub's **Code -> Download ZIP** button, that can also give you the files, but cloning is recommended because later updates are then as simple as `git pull`.

### 3. Add Depth Anything V2 and its AI checkpoint

Anaglyph & Friends uses the official **Depth Anything V2 Small** model. From the `Anaglyph-and-Friends` folder, paste:

```bash
mkdir -p backend/ai_models

git clone https://github.com/DepthAnything/Depth-Anything-V2.git backend/ai_models/Depth_Anything_V2

mkdir -p backend/ai_models/checkpoints

curl -L https://huggingface.co/depth-anything/Depth-Anything-V2-Small/resolve/main/depth_anything_v2_vits.pth -o backend/ai_models/checkpoints/depth_anything_v2_vits.pth
```

The final download is the neural-network checkpoint and may take a while. When this step is complete, these locations should exist:

```text
backend/ai_models/Depth_Anything_V2/depth_anything_v2/...
backend/ai_models/checkpoints/depth_anything_v2_vits.pth
```

### 4. Install the backend

This part only needs to be **installed once**. In Terminal:

```bash
cd ~/Desktop/Anaglyph-and-Friends/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

The first dependency installation can take several minutes.

When the virtual environment is active, your Terminal prompt will usually begin with `(.venv)`. That is expected. Once installation finishes, the launcher will start the backend for you.

#### Intel Mac note

Some Intel Macs expose PyTorch's MPS GPU support but do not implement every operation used by Depth Anything V2. Anaglyph & Friends enables PyTorch's **CPU fallback** for unsupported MPS operations while keeping supported work on MPS. This preserves the aspect ratio of the source image without requiring the whole model to run on CPU.

If MPS causes trouble on a particular Mac, you can force the backend to use only the CPU when starting it manually from the `backend` folder with the virtual environment active:

```bash
AAF_TORCH_DEVICE=cpu python app.py
```

### 5. Install the frontend

In the same Terminal window:

```bash
cd ~/Desktop/Anaglyph-and-Friends/frontend
npm install
```

The installation only needs to be done once. You can close Terminal afterward.

### 6. Open the app

In Finder, open the repository's `macos` folder and double-click **Anaglyph & Friends.app**. It starts both local services, checks that both are ready, and opens [http://127.0.0.1:5173](http://127.0.0.1:5173) in your browser. Double-click **Stop Anaglyph & Friends.app** when you finish.

Keep the app bundles in the repository's `macos` folder; Finder aliases can be placed elsewhere. Because these small launchers are not notarized, macOS may require **Control-click → Open** the first time. If startup fails, the launcher shows an error; details are in `~/Library/Logs/Anaglyph-and-Friends/`.

You should now see **Anaglyph & Friends**. Drop, choose, or paste an image into the source panel and the app will create its depth map and selected 3D output.

### Starting it again later

You do **not** repeat the installation steps every time.

Double-click **Anaglyph & Friends.app** again. It reuses healthy services and opens the browser. **Stop Anaglyph & Friends.app** stops only processes started by these launchers; it leaves manually started services alone. The launchers use your installed Python, Node, model files, and dependencies rather than bundling them.

For troubleshooting or development, you can still start the components manually. Open one Terminal window for the backend:

```bash
cd ~/Desktop/Anaglyph-and-Friends/backend
source .venv/bin/activate
python app.py
```

Open a second Terminal window for the frontend:

```bash
cd ~/Desktop/Anaglyph-and-Friends/frontend
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

Use **Control-C** in a Terminal window when you want to stop the server running there.

### Updating to the newest GitHub version

Stop the backend and frontend with **Control-C**. Then in one Terminal:

```bash
cd ~/Desktop/Anaglyph-and-Friends
git pull
```

Usually you can then restart normally. If an update added or changed dependencies, it is safe to refresh them with:

```bash
cd ~/Desktop/Anaglyph-and-Friends/backend
source .venv/bin/activate
pip install -r requirements.txt

cd ../frontend
npm install
```

Then start the backend and frontend again as described above.

### Asking ChatGPT for help with an error

Useful information to include is:

- the URL of this repository;
- your operating system and Mac model if known;
- which numbered setup step you reached;
- the exact Terminal command you entered;
- the complete error message, preferably copied and pasted rather than paraphrased.

A useful prompt is:

> I am trying to run https://github.com/udeudeude/Anaglyph-and-Friends on my Mac. I am new to GitHub. I got the following error during setup. Please explain what it means and give me only the next step to try: [paste error here]

## Hosted vs local processing

The two editions deliberately split the expensive depth-estimation step differently:

- **Hosted web edition:** Depth Anything V2 runs in the browser (WebGPU where available, otherwise browser CPU). This avoids trying to fit PyTorch and the model into Render's small free server. The generated depth map is then sent to the backend for the established stereo and print pipeline. Hosted final renders use at most 1800 pixels along the source image's longest side to keep ordinary downloads within the free service's memory; the local edition retains full-resolution exports. The first successful use may need to download the browser AI library/model. If that stage fails, the interface now distinguishes download/startup/inference failures, keeps the source image loaded, and provides **Retry AI depth** without making the user choose the image again.
- **Local edition:** the Python backend runs Depth Anything V2 directly with PyTorch. This remains the better route for offline use and for machines where browser inference is undesirable.

The optional **AI depth generator** control is tucked away in Studio and View-Master. Automatic (recommended) uses Depth Anything V2 Small in both editions. The hosted browser edition also offers Depth Anything V3 Small as an explicit choice; its first use downloads about 105 MB of model files and may require a capable browser/device. In Studio, changing to a different model reruns depth for the loaded image when its AI map has not been edited. A manual generation button appears when the selected model differs from the current AI map or when an imported/edited map needs explicit replacement; it is hidden for an unchanged AI map. The local edition continues to use V2. See [depth generator research and adapter contract](docs/DEPTH_GENERATORS.md).

In the **View-Master Reel** workspace, seven scene cards run across the top and down the left of a numbered reel mockup. Drop an image onto a scene card or use **Choose image**. In **L + R** mode, drop one image onto the left or right half, or drop two files together (left first, right second). Each image preview has the prototype frame's aspect ratio and rounded corners. Drag an already loaded image within its preview to adjust the crop, or choose **Adjust crop** for a larger drag surface and fine sliders; **Center crop** restores the original position. Imported pairs share one crop position for both eyes to avoid an extra stereo shift. The mockup shows source images until stereo pairs are built, then shows the generated eyes. Its editable reel title is included in the PDF and SVG, as are the rounded frame crops and numbered eye labels. Changing the crop or title after building immediately updates the preview and exports without rerunning AI depth. Physical dimensions remain prototype values pending measurement.

Both editions can also use an imported depth map or an imported left/right stereo pair. Imported stereo pairs can optionally carry a depth map aligned to the left-eye image; that map unlocks ChromaDepth, multi-view wiggle, and random-dot/pattern autostereograms without pretending that depth can be recovered reliably from every arbitrary stereo pair.

**Layered Transparency** under Studio's Print techniques turns the current single image and active depth map into 2–10 numbered clear-sheet pages, plus matching white-paper cut guides. By default, each sheet repeats all shapes in front of it; alternatives keep slices separate or repeat only the complete photograph on the back. The default ten-sheet stack can use a Rack-O rack as an evenly spaced holder, but the rack's actual spacing and fit are not assumed. Background compression, measured gap, artwork width, and print resolution are adjustable. Explanation and assembly instructions are tucked under a disclosure. See [Layered Transparency guide](docs/LAYERED_TRANSPARENCY.md).

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
- visible processing-stage bars on desktop and phone; they animate while work is underway because upload, depth inference, and rendering do not expose a reliable overall completion percentage;
- a resizable/collapsible source sidebar;
- fast Red/Cyan, Parallel, and Cross-Eyed controls plus a grouped **More techniques** selector;
- technique-specific configuration panels that appear only when relevant;
- discrete controls such as buttons, selectors, and toggles applying immediately, while sliders can be adjusted first and then committed with **Apply settings** to avoid repeated expensive renders;
- independent on-screen preview sizing;
- zoom and pan for preview inspection;
- fullscreen viewing on black with technique controls available near the bottom edge;
- full-resolution local downloads and memory-bounded hosted downloads;
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
5. Create final static downloads from the source. The hosted edition limits the rendered source to 1800 pixels on its longest side; the local edition retains the full resolution. Physical print techniques still use their requested output dimensions and DPI, subject to their own resource limits.

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
- `GET /prepare-full` - build/cache an ordinary stereo pair at source resolution locally or at most 1800 source pixels on the hosted edition.
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

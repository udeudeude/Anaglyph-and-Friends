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

You can use the **hosted web edition** without installing anything, or run the **local edition** on your own computer. The local edition is not yet a normal double-clickable Mac app, so its first setup uses Terminal.

The beginner guide below is for **macOS**, which is the environment this version has actually been tested on. Windows and Linux should use the same overall architecture, but some installation and virtual-environment commands differ.

### The basic mental model

There are four pieces:

1. **GitHub** stores the project. `git clone` copies it onto your Mac.
2. **Python / Flask** runs the backend that creates the depth map and 3D images.
3. **Node / Vite** runs the frontend that you see in your web browser.
4. The backend and frontend each stay running in their own Terminal window while you use the app.

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

### 4. Set up and start the backend

This part only needs to be **installed once**. In Terminal:

```bash
cd ~/Desktop/Anaglyph-and-Friends/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

The first dependency installation can take several minutes.

When the virtual environment is active, your Terminal prompt will usually begin with `(.venv)`. That is expected.

When the backend is ready, you should eventually see a line similar to:

```text
* Running on http://127.0.0.1:8000
```

Leave this Terminal window open and running. Messages such as `xFormers not available` can be informational and do not by themselves mean the backend failed.

#### Intel Mac note

Some Intel Macs expose PyTorch's MPS GPU support but do not implement every operation used by Depth Anything V2. Anaglyph & Friends enables PyTorch's **CPU fallback** for unsupported MPS operations while keeping supported work on MPS. This preserves the aspect ratio of the source image without requiring the whole model to run on CPU.

If MPS causes trouble on a particular Mac, you can force the backend to use only the CPU:

```bash
AAF_TORCH_DEVICE=cpu python app.py
```

### 5. Set up and start the frontend

Open a **second Terminal window**. Leave the backend running in the first one.

In the new Terminal:

```bash
cd ~/Desktop/Anaglyph-and-Friends/frontend
npm install
npm run dev
```

When Vite is ready, it normally shows:

```text
http://localhost:5173
```

Leave this second Terminal running too.

### 6. Open the app

Open your web browser and go to:

[http://localhost:5173](http://localhost:5173)

You should now see **Anaglyph & Friends**. Drop, choose, or paste an image into the source panel and the app will create its depth map and selected 3D output.

### Starting it again later

You do **not** repeat the installation steps every time.

On macOS, after the one-time setup above is complete, you can use the small launchers in the repository's `macos` folder:

- double-click **Anaglyph & Friends.app** to start both local servers and open the browser;
- double-click **Stop Anaglyph & Friends.app** when you are finished.

They use your existing local Python environment, Node installation, model files, and dependencies. They are deliberately small launchers rather than a self-contained signed distribution. Because they are not notarized, macOS may require **Control-click -> Open** the first time.

You can still start the components manually. Open one Terminal window for the backend:

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

- **Hosted web edition:** Depth Anything V2 runs in the browser (WebGPU where available, otherwise browser CPU). This avoids trying to fit PyTorch and the model into Render's small free server. The generated depth map is then sent to the backend for the established stereo and print pipeline.
- **Local edition:** the Python backend runs Depth Anything V2 directly with PyTorch. This remains the better route for offline use and for machines where browser inference is undesirable.

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
| `U` | Open image chooser |
| `Command-V` | Paste an image using the normal macOS paste action |

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
- **Editable depth controls**: paint directly on the active map with a feathered raise/lower brush, adjust black/white points and gamma, apply blur, undo/redo individual edit steps, or reset the edit session.

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
- AI relief phantograms place the image/depth pair on a millimetre-scale height field, project that relief from independent left/right eye positions onto a physical print plane, and combine the projections as an anaglyph.

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

See **[ROADMAP.md](ROADMAP.md)**. Larger deliberately deferred projects include editable depth maps, packaging as a double-clickable macOS application, and layered 3D compositing. Phantogram follow-up work now centers on a traditional calibrated ground-plane mode and physical-print testing. Other possible additions include MPO/stereo JPEG, Pulfrich animation, additional display/viewer profiles, additional historical stereograph templates, and saved lenticular calibration profiles.
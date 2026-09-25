# Anaglyph & Friends Roadmap

This file tracks ideas that are intentionally **not** part of the current implementation, so they do not disappear into chat history.

## Explicitly deferred larger projects

1. **Editable depth maps**
   - paint/erase depth corrections
   - levels/contrast/blur controls
   - local masking and edge cleanup
   - preserve/export edited high-bit-depth depth data

2. **Packaged macOS application**
   - double-click launch
   - bundle/start local backend automatically
   - eliminate Terminal setup for normal use
   - eventually consider signing/notarization and Intel/Apple Silicon packaging

3. **Independent transparent 3D foreground layers**
   - import a transparent PNG as a movable object over the base photograph
   - estimate or import a separate depth map for that foreground object
   - synthesize the layer stereoscopically as well as the base image
   - move, scale, rotate, and position the object interactively in the composition
   - control where the object sits in scene depth so it can appear in front of or behind existing geometry
   - preserve alpha edges cleanly in generated left/right views and final techniques
   - potentially support multiple independent 3D layers later

## Phantogram workspace — experimental implementation

The application now includes a separate **AI Relief Phantogram** workspace. It uses the current source and active AI/imported depth map as a physical height field above a flat print, places two virtual eyes in millimetre coordinates, projects the relief independently back onto the print plane, and combines the two projections as a red/cyan, red/green, or red/blue anaglyph.

Implemented:

- physical print width and height
- viewing distance from the near print edge
- eye height above the print
- configurable eye separation / IPD
- maximum apparent relief in millimetres
- reverse-depth option
- center-crop source/depth together to the selected print aspect ratio
- 150 / 300 / 600 DPI print-ready PNG output with embedded physical DPI metadata
- downloadable exact 100 mm ruler for verifying printer scaling
- regression tests and geometric invariants, including exact identity at zero relief

Still worth developing after physical testing:

- a **traditional calibrated phantogram mode** using a photographed/identified physical ground plane rather than AI relief alone
- interactive selection of four ground-plane corners and known plane dimensions
- optional left/right free-view output in addition to anaglyph
- print-page layouts with margins, labels, and viewing-position instructions
- calibration against real printed examples to refine useful default eye height, viewing distance, and relief limits

## Documentation / onboarding

- **Add helpful screenshots to the README and beginner setup instructions.**
  - show the GitHub **Code** / clone step
  - show the two-Terminal backend/frontend setup
  - show a successfully running local app in the browser
  - include only screenshots that clarify steps where a new GitHub/Terminal user could otherwise get lost
- **Add visual output examples so someone considering the project can quickly understand what it produces before installing it.**
  - use one or two strong source images and show the source, AI depth map, and representative finished outputs
  - include examples of at least red/cyan anaglyph, parallel/cross-eyed stereo, ChromaDepth, a traditional stereoscope card, a random-dot or pattern stereogram, wiggle-gram, lenticular output, and AI relief phantogram output
  - favor a compact gallery near the top of the README rather than forcing readers to infer results from feature descriptions
  - label examples clearly when special glasses, free-viewing, a stereoscope, animation, or print calibration are required to perceive the 3D effect
  - where a GitHub README cannot demonstrate the effect directly, show a representative still and explain what the downloaded/animated/printed result is intended to look like

## View-Master reel builder — physical validation remaining

The seven-scene workspace now accepts a mixture of ordinary source images and imported left/right stereo pairs, supports handoff back to 3D Studio, and exports an actual-size PDF print master plus secondary SVG output. Pair-level orientation handling and pure-white cardstock output are regression-protected.

Still to validate/refine with a physical reel and viewer:

- exact center spindle-hole geometry
- exact seven transport/index slot dimensions and phase
- printed registration tolerance and useful overscan around each frame
- final confirmation of the default orientation against a real reel/viewer
- calibration/resolution test reel for comparing printers and transparency films

## Current physical-calibration follow-up

- **Named glasses/filter profiles are implemented** and store both screen and print calibration values locally in the browser. The remaining work is measuring actual glasses, displays, printers, inks, papers, and lighting.
- **Single-mirror stereoscope output is implemented** as a generic configurable layout. A named DK/book preset waits on real measurements.
- **Dual-projector polarized presentation windows are implemented** so each eye can be moved to a separate display and independently fullscreened. Real projector/filter/silver-screen calibration remains hardware work.
- **Lenticular saved hardware profiles** remain future work after real printer + sheet measurements establish trustworthy values.

## Potential future viewing / export techniques

- **MPO / stereo JPEG** for devices and software that store both eye views in one file.
- **Pulfrich animation** using generated horizontal motion for dark-filter Pulfrich viewing.
- **Additional autostereoscopic display profiles** when a specific display/panel is available for calibration.
- **Additional historical stereograph templates**, typography, backs, publisher marks, numbering, and batch card generation.
- **Additional phone/viewer profiles** with saved device dimensions and optional lens-distortion correction.
- **Saved lenticular printer + paper + sheet profiles** once real calibration data is available.
- **Optional depth map alongside an imported stereo pair**, unlocking depth-dependent techniques without pretending the pair itself supplies a reliable depth field.
- **More specialized legacy/display encodings** when a concrete device or workflow calls for them.

## Implemented technique families

The current application includes:

- **Anaglyph**
  - red/cyan
  - red/green
  - red/blue
  - arbitrary two-color calibration
  - independent screen and print profiles
  - saved named glasses/filter profiles
  - adjustable color retention from full color through grayscale
- parallel stereo
- cross-eyed stereo
- ChromaDepth
- Cardboard / phone viewer presentation
- traditional stereoscope cards with arched images and text
- generic single-mirror stereoscope layouts
- wiggle-grams
- random-dot autostereograms
- pattern-based autostereograms
- lenticular 3D interlacing plus printable LPI calibration bars
- experimental AI relief phantogram workspace with physically calibrated PNG output
- experimental seven-scene View-Master reel builder with PDF/SVG print masters and imported-pair scenes
- RGB Reveal / CMY Layers workspace for three-layer color-filter artwork
- dual-projector polarized 3D workspace with independent alignment, crosstalk tests, projector windows, and exports

### Lower-priority display / compatibility formats

These are intentionally placed behind the main technique chooser so they do not compete visually with the primary viewing methods:

- half-width side-by-side
- top/bottom stereo
- row-interlaced stereo
- column-interlaced stereo
- checkerboard stereo

## Depth-source workflow

The visible photograph and the depth source can now be independent.

- Depth Anything V2 remains the default depth source.
- A replacement depth map can be imported from PNG/JPEG/TIFF/WebP or float32 `.npy` data.
- Imported maps do not need to match the source image dimensions or aspect ratio.
- Aspect matching options include crop-to-fill, fit-inside, and stretch-to-image.
- Near/far depth can be inverted.
- Switching the active depth source invalidates the stereo cache and all techniques use the newly selected map.

Device- or print-specific modes expose their extra information only when that technique is selected and begin with practical default presets rather than empty fields.

# Anaglyph & Friends

**Turn ordinary images into a collection of stereoscopic, autostereoscopic, animated, viewer-specific, and print-oriented 3D formats.**

### [Try Anaglyph & Friends in your browser](https://anaglyph-and-friends.onrender.com/)

No installation is required for the hosted edition. The free Render service may take a little while to wake after inactivity.

## What it makes

From a photograph and its depth information, Anaglyph & Friends can produce:

- red/cyan anaglyphs
- parallel and cross-eyed stereo pairs
- random-dot and patterned stereograms
- wiggle-grams
- lenticular interlacing and calibration output
- phantograms
- View-Master reels
- traditional stereoscope cards
- phone-viewer / Cardboard-style stereo
- ChromaDepth and other color-filter experiments
- row, column, checkerboard, top/bottom, and half-width display formats
- downloadable depth maps for further work

The project is deliberately broader than “make an anaglyph.” It is a workshop for exploring many ways of turning depth into something viewable, printable, animated, or physically assembled.

## Web edition and local edition

**Web edition:** runs the depth model in the visitor's browser and uses a lightweight hosted backend for stereo/output rendering.

**Local edition:** uses Python, PyTorch, and Depth Anything V2 on your own computer. After setup and model download it can be used offline.

- [Run it locally, step by step](docs/LOCAL-SETUP.md)
- [Technical reference and complete feature notes](docs/TECHNICAL-REFERENCE.md)
- [Depth-generator notes](docs/DEPTH_GENERATORS.md)
- [Phantogram notes](docs/PHANTOGRAMS.md)
- [Roadmap](ROADMAP.md)

## Interface

The current application is a dark desktop-style workspace built around the image rather than a sequence of separate utilities. It includes dedicated workspaces for the main 3D studio, phantograms, and View-Master reels, with technique-specific controls appearing only when relevant.

Source images retain their full resolution. Preview size can be adjusted independently from export quality.

## Project origin

Anaglyph & Friends grew from **Anaglyph AI**, created by Duy Huynh / Senacen. This repository began as a fork and has since expanded substantially into a broader stereoscopic and depth-based image workshop.

Original project:

https://github.com/Senacen/Anaglyph-AI

The expanded work in this repository was developed with extensive assistance from ChatGPT.

## Repository map

- `frontend/` — browser interface
- `backend/` — rendering and local model services
- `macos/` — Mac-specific work
- `docs/` — setup and technical documentation
- `render.yaml` and `Dockerfile` — hosted deployment
- `ROADMAP.md` — future directions

## Development status

This is active experimental software. Some output modes are mature enough for everyday use; others, especially physical-print and unusual display techniques, remain exploratory and are documented as such.

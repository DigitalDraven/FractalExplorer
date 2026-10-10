# Fractal Explorer 2.0.4

A modular evolution of Fractal Explorer 1.8, retaining its original control panel, navigation, orbit-trap renderer, lighting controls, Julia/Mandelbrot family, and PNG export.

## What's new in 2.0.4
- Split the original single-file app into `index.html`, `css/main.css`, and `js/app.js`.
- Added five editable art-direction presets: Blue Egg, Cosmic Magenta, Thorn Blue Lake, Golden Filigree, and Electric Indigo.
- Added a Gold Filigree shading style intended for luminous, narrow contour-like bands.
- Preserved the existing 1.8 controls and renderer as the foundation.

## Run locally
Because this uses a JavaScript file, run it from a local web server instead of opening `index.html` with `file://`. For example, from this directory:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`. No build step or framework is required.

## Notes
This is an initial 2.0.1 foundation release. The Gemini project's Apollonian Gasket and Julia parameter pad are not yet integrated; they should be added as separate geometry/navigation modules after the current 1.8 behavior is validated. The filigree style is an initial procedural treatment, not a reproduction of the supplied reference images.


## 2.0.1

- Fixed contrast for buttons, presets, dropdowns, labels, and native controls.
- Added explicit dark color-scheme rules so native select menus remain readable.
- Preserved the 2.0.0 layout and rendering behavior.
- Added a small-screen layout fallback.


## 2.0.4

- Rebuilt range-slider tracks and thumbs with explicit WebKit and Firefox styling for improved visibility.
- Fixed the primary export button cascade: the general button background rule no longer overrides the accent background.
- Added distinct disabled and hover states for Save PNG, including a clear Rendering… state during export.
- Kept the renderer, presets, layout, and export dimensions unchanged.


## 2.0.4 patch
- Keeps Save PNG clearly visible at rest and gives it a readable busy state.
- Makes the render progress indicator thicker, brighter, and visible while rendering.
- Improves range slider track and thumb contrast.


## 2.0.4 — Zoom-box visibility
- Raises the zoom-selection overlay above the fractal canvas with a brighter border and translucent fill.
- Keeps drag updates active when the pointer leaves the canvas and constrains the selection to canvas bounds.
- Uses the displayed canvas aspect ratio for the selection geometry.

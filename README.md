# Fractal Explorer 2.4.1

## Changes in 2.4.1
- Glossy Relief: the stripe texture is now interpolated by the smooth escape fraction, removing faint stepped terraces that could show in wide, smooth areas.
- PNG metadata now also records the Julia seed and the Glossy Relief settings, so an exported image can be reproduced exactly.


## Changes in 2.4.0
- **Supersampling for every mode** (Detail section: Off / 2× / 3×). Existing renderers are unchanged; the frame is rendered larger and averaged down. The Gasket (vector) is excluded; Lace and Relief use the same control. Orbit-trap relief is scaled so it looks the same when supersampled.
- **Export note** states the supersampling that will actually apply at the chosen size. Exports above 1600 × 1200 are limited to 1× to protect browser memory; 1600 × 1200 supports up to 2×.
- **PNG metadata:** every exported PNG carries Author / Copyright / Comment "DigitalDraven", the software version, and the view parameters (center, scale, iterations).
- **My Presets:** save the exact view and all settings under a name (stored in this browser). New built-in **Satin Spiral** look preset (keeps your current view).
- Light-controls hint now describes relief lighting when Lace or Glossy Relief is active.
- Burning Ship code is unchanged.

## Changes in 2.3.0
- New shading mode **Glossy Relief — Polished Metal**: smooth escape time drives a cyclic multi-stop gradient and is lit as raised, glossy ribs using the existing light controls. Includes a stripe-average texture slider, relief and color-cycle controls, and 1×/2×/3× supersampling on the worker pipeline.
- **Gradient editor** (3-12 stops) with Turquoise & Ember, Ocean Glass and Molten presets.
- **Canvas shape** option (Landscape 900×650 / Portrait 650×900); exports swap automatically.
- New art preset **Turquoise Spiral**.
- Glossy Relief follows the same compatibility rules as Ornate Lace (Burning Ship, Gasket and the 3-stop palette controls are disabled while it is active).
- No changes to Burning Ship rendering, orientation, or zoom code.

## Changes in 2.2.0
- New shading mode: **Ornate Lace — Gold & Silver Threads** (plus an "Ornate Lace" art preset). Distance-estimated thin threads that alternate gold/silver, an N-fold star orbit trap, relief lighting from the existing light controls, and an optional log-polar spiral warp. Works with Mandelbrot, Julia and Tricorn.
- 2× / 3× supersampling for Ornate Lace, rendered across Web Workers (falls back to the main thread if workers are unavailable). Very large exports reduce supersampling automatically to cap memory.
- While Ornate Lace is selected, incompatible controls are disabled (Burning Ship, Apollonian Gasket, palette stops / band cycle / palette presets). Selecting Burning Ship or the Gasket disables the Lace option.
- No changes to Burning Ship rendering, orientation, or zoom code.

## Changes in 2.1.6a
- Corrected drag-to-zoom vertical center mapping for Burning Ship only; other fractal types and Burning Ship double-click zoom are unchanged.

## Changes in 2.1.6
- Restored aspect-ratio-constrained zoom selection based on the displayed canvas dimensions.
- Made zoom center and scale derive from the exact visible selection rectangle.
- Unified coordinate mapping with the displayed canvas aspect ratio; supports dragging in any direction and clamps the selection to canvas bounds.


## Changes in 2.1.6

- Fixed Burning Ship orientation for orbit-trap bubbles and Gold Filigree orbit lines.
- Routed Burning Ship Potential Folds through the derivative-based lighting renderer instead of the escape-time-only renderer.
- Used the Burning Ship renderer’s wider escape threshold consistently across shading modes.

## Changes in 2.1.5
- Reverted to the validated 2.1.3e baseline before making the Burning Ship changes.
- Burning Ship now uses Gemini's pixel iteration behavior: absolute-value imaginary recurrence, squared escape radius 32, and smooth escape-time coloring.
- Burning Ship renders at 1.5x resolution and downsamples with high-quality canvas smoothing, matching Gemini's enabled supersampling approach.
- Selecting Burning Ship initializes Gemini's framing (center -1.7512, -0.0235; zoom 28 equivalent; 160 iterations). Existing user palette/colors are retained.
- Other fractal types and the Golden Filigree + Circular Ring Trap rendering path remain based on 2.1.3e.

## Validation
JavaScript syntax and ZIP integrity checked. Browser visual comparison is still required.

## Run locally
Keep the folder structure intact and serve the folder from a local web server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.


### 2.1.4a correction
- Burning Ship uses Gemini-compatible vertical complex-plane orientation.
- Selecting Burning Ship defaults to the Red Ember palette.
- Reset View restores the Burning Ship preset framing and iteration count instead of the generic Mandelbrot framing.


### 2.1.5 capitalization cleanup
- Standardized visible palette preset, fractal type, shading mode, and related option labels to consistent Title Case.
- Internal keys and values were left unchanged.

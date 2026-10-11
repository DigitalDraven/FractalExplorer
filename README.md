# Fractal Explorer 2.1.5a

## Changes in 2.1.5a

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

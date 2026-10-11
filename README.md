# Fractal Explorer 2.1.3e

## Changes in 2.1.3e
- When **Golden Filigree** and **Circular Ring Trap** are both selected, use a Gemini-style orbit-trap renderer: track the minimum distance to the circular trap through the orbit and color both escaped and interior pixels using exponential glow plus a small escape-time contribution.
- Other trap shapes continue using Fractal Explorer's existing Golden Filigree renderer; other shading modes are unchanged.
- Circular Ring Trap frequency scales the trap-distance thickness while preserving the Gemini-style minimum-distance coloring approach.
- This is an algorithmic adaptation of Gemini's orbit-trap path, not a wholesale replacement of the app or its UI. Browser visual testing is still required.

## Changes in 2.1.3b

- Fixes Circular Ring Trap so Trap Scale / Frequency changes contour density; radius controls the overall trap scale.

## Changes in 2.1.3a

- Adds a dedicated **Bubble & Trap Settings** section between Shading and Detail.
- Adds Perfect Circles (Bubbles), Circular Ring Trap, Circular Grid, Concentric Rings, and Ortho Cross Lines trap styles for Gold filigree shading.
- Fixes Golden Filigree preset initialization so Bubble & Trap controls and their displayed values update immediately.
- Golden Filigree now selects Circular Ring Trap as its starting geometry.
- Adds Trap Size / Radius, Bubble Glow & Softness, and Trap Scale / Frequency controls.
- The section is active for Gold filigree shading and explains its availability when another shading mode is selected.
- Preserves the existing Circle / Square / Diamond / Cross orbit-trap options and the working Apollonian Gasket controls.

## Run locally

Keep the folder structure intact and serve the folder from a local web server, for example:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Validation status

JavaScript syntax and ZIP integrity are checked. The new visual effects need hands-on browser testing; this is a test build, not a final release.

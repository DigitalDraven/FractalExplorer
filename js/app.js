
(function(){
  const errorBanner = document.getElementById('errorBanner');
  function showError(msg){
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
  }
  function clearError(){
    errorBanner.style.display = 'none';
  }
  // A generic "Script error." with no file/line info (as opposed to a real stack
  // trace) is the browser's cross-origin error-reporting restriction kicking in —
  // it doesn't mean much on its own. Surfacing *something* readable here, and
  // clearing it the moment a render actually succeeds, beats leaving the person
  // staring at a blank canvas with only that generic message in the console.
  window.addEventListener('error', e => {
    showError('Render error: ' + (e.message || 'something went wrong') + '. Try Reset view, or adjust the setting you just changed.');
  });
  window.addEventListener('unhandledrejection', e => {
    showError('Render error: ' + (e.reason && e.reason.message ? e.reason.message : 'something went wrong') + '. Try Reset view, or adjust the setting you just changed.');
  });

  const canvas = document.getElementById('fractalCanvas');
  const ctx = canvas.getContext('2d');
  const selectBox = document.getElementById('selectBox');
  const progressBar = document.getElementById('progress');
  const canvasWrap = document.getElementById('canvasWrap');

  const W = canvas.width, H = canvas.height;
  const ASPECT = W / H;

  // ---- state ----
  const state = {
    type: 'mandelbrot',
    gasketDepth: 5,
    gasketStroke: 1,
    gasketFill: false,
    cx: -0.5, cy: 0.0,     // center in complex plane
    scale: 3.2,             // width of view in complex plane
    maxIter: 300,
    juliaRe: -0.74543,
    juliaIm: 0.11301,
    colors: ['#050512', '#3a2fd6', '#d9d3ff'],
    interior: '#000000',
    bg: '#050512',
    cycleScale: 42,
    shadingMode: 'bands',      // 'bands' or 'lit'
    lightAngle: 135,            // degrees
    lightHeight: 1.4,
    lightAmbient: 0.12,
    lightSpec: 0.55,
    lightShininess: 6,
    autoIter: true,
    trapX: 0,
    trapY: 0,
    trapShape: 'circle',
    bubbleTrapShape: 'perfect',
    bubbleTrapRadius: 0.5,
    bubbleTrapGlow: 10,
    bubbleTrapFrequency: 1,
    trapRadius: 1.1,
    trapAutoRadius: true,
    trapRepeats: 8,
    trapBump: 70,
    trapCycle: false,
    trapBandStyle: 'smooth',
    trapHueShift: 0,
    trapBandWarp: 0,
    trapColorSource: 'distance'
  };

  let renderToken = 0; // increments to cancel stale renders

  // ---- helpers ----
  function hexToRgb(hex){
    const v = parseInt(hex.slice(1), 16);
    return [(v>>16)&255, (v>>8)&255, v&255];
  }
  function lerp(a,b,t){ return a + (b-a)*t; }
  function lerpColor(c1, c2, t){
    return [ lerp(c1[0],c2[0],t), lerp(c1[1],c2[1],t), lerp(c1[2],c2[2],t) ];
  }

  function buildPaletteFn(){
    const stops = state.colors.map(hexToRgb);
    const n = stops.length;
    return function(t){
      // t in [0,1) cyclic
      const scaled = t * n;
      const i = Math.floor(scaled) % n;
      const frac = scaled - Math.floor(scaled);
      const c1 = stops[i];
      const c2 = stops[(i+1)%n];
      return lerpColor(c1, c2, frac);
    };
  }

  function buildPaletteLinearFn(){
    // Non-cyclic interpolation across the stops: used for lighting-driven shading,
    // where t represents brightness (0 = shadow, 1 = highlight) rather than escape count.
    const stops = state.colors.map(hexToRgb);
    const n = stops.length;
    return function(t){
      if(!isFinite(t)) t = 0;
      t = Math.max(0, Math.min(1, t));
      const scaled = t * (n - 1);
      const i = Math.min(n - 2, Math.floor(scaled));
      const frac = scaled - i;
      return lerpColor(stops[i], stops[i+1], frac);
    };
  }

  function updatePalettePreview(){
    const el = document.getElementById('palettePreview');
    el.style.background = `linear-gradient(90deg, ${state.colors.join(',')}, ${state.colors[0]})`;
  }

  // ---- core escape-time + optional derivative tracking ----
  // When shadingMode is 'lit', we track dz (the derivative of z with respect to
  // the varying parameter — c for Mandelbrot-family fractals, z0 for Julia sets)
  // alongside z itself. That derivative lets us build a fake 3D surface normal
  // for the escape-time "potential" surface, which is what produces the glossy,
  // lit-sphere/bubble look instead of flat color bands.
  function computePixelColor(px, py, kind, jr, ji, needDeriv, light, paletteBands, paletteLinear, interiorRgb){
    let zr, zi, cr, ci, dzr, dzi;
    const isJuliaVar = (kind === 'julia');
    if(isJuliaVar){
      zr = px; zi = py; cr = jr; ci = ji; dzr = 1; dzi = 0;
    } else {
      zr = 0; zi = 0; cr = px; ci = py; dzr = 0; dzi = 0;
    }
    const addOne = isJuliaVar ? 0 : 1;
    let n = 0;
    const maxIter = state.maxIter;
    let zr2 = zr*zr, zi2 = zi*zi;

    while(n < maxIter && (zr2 + zi2) < (kind === 'burningship' ? 32.0 : 4)){
      if(needDeriv){
        if(kind === 'burningship'){
          // w = |Re z| + i|Im z|; dw = sign(Re z)*dRe(z) + i*sign(Im z)*dIm(z)
          const sr = zr >= 0 ? 1 : -1, si = zi >= 0 ? 1 : -1;
          const wr = Math.abs(zr), wi = Math.abs(zi);
          const dwr = sr*dzr, dwi = si*dzi;
          const ndzr = 2*(wr*dwr - wi*dwi) + addOne;
          const ndzi = 2*(wr*dwi + wi*dwr);
          dzr = ndzr; dzi = ndzi;
        } else if(kind === 'tricorn'){
          // z' = conj(z)^2 + c  =>  dz' = 2*conj(z)*conj(dz) + addOne
          const czr = zr, czi = -zi, cdzr = dzr, cdzi = -dzi;
          const ndzr = 2*(czr*cdzr - czi*cdzi) + addOne;
          const ndzi = 2*(czr*cdzi + czi*cdzr);
          dzr = ndzr; dzi = ndzi;
        } else {
          // z' = z^2 + c  =>  dz' = 2*z*dz + addOne
          const ndzr = 2*(zr*dzr - zi*dzi) + addOne;
          const ndzi = 2*(zr*dzi + zi*dzr);
          dzr = ndzr; dzi = ndzi;
        }
      }
      if(kind === 'burningship'){
        const nzi = Math.abs(2*zr*zi) + ci;
        const nzr = zr2 - zi2 + cr;
        zr = nzr; zi = nzi;
      } else if(kind === 'tricorn'){
        const nzi = -2*zr*zi + ci;
        const nzr = zr2 - zi2 + cr;
        zr = nzr; zi = nzi;
      } else {
        const nzi = 2*zr*zi + ci;
        const nzr = zr2 - zi2 + cr;
        zr = nzr; zi = nzi;
      }
      zr2 = zr*zr; zi2 = zi*zi;
      n++;
    }

    if(n >= maxIter) return interiorRgb; // never escaped: interior of the set

    if(needDeriv){
      // Build a unit "normal" from z/dz and light it like a sphere (Lambert + specular).
      const denom = dzr*dzr + dzi*dzi;
      let ux = 0, uy = 0;
      if(denom > 1e-300){
        const urr = (zr*dzr + zi*dzi) / denom;
        const uii = (zi*dzr - zr*dzi) / denom;
        const len = Math.sqrt(urr*urr + uii*uii) || 1;
        ux = urr/len; uy = uii/len;
      }
      const diffuseRaw = (ux*light.lx + uy*light.ly + light.h) / (1 + light.h);
      const diffuse = Math.max(0, Math.min(1, diffuseRaw));
      const shade = light.ambient + (1 - light.ambient) * diffuse;
      const spec = Math.pow(diffuse, light.shininess) * light.specStrength;
      const base = paletteLinear(shade);
      return [
        base[0] + spec*(255 - base[0]),
        base[1] + spec*(255 - base[1]),
        base[2] + spec*(255 - base[2])
      ];
    } else {
      const logZn = Math.log(zr2 + zi2) / 2;
      const nu = Math.log(logZn / Math.LN2) / Math.LN2;
      const val = Math.max(0, n + 1 - nu);
      const t = (val / state.cycleScale) % 1;
      return paletteBands(t);
    }
  }

  function buildLight(){
    const rad = state.lightAngle * Math.PI / 180;
    return {
      lx: Math.cos(rad), ly: Math.sin(rad),
      h: state.lightHeight, ambient: state.lightAmbient,
      specStrength: state.lightSpec, shininess: state.lightShininess
    };
  }

  // ---- orbit trap field: tracks the closest approach of the orbit to a fixed trap
  // point. Level sets of "which iteration was closest" are literally arcs of circles
  // centered on the trap, which is what produces the overlapping-sphere "bubble" look.
  function trapDistanceSquared(dx, dy){
    // Gold filigree has its own trap geometry family. Keep the established
    // Circle/Square/Diamond/Cross orbit-trap behavior for the 3D bubble mode.
    if(state.shadingMode === 'filigree'){
      const radius = Math.max(0.1, state.bubbleTrapRadius);
      const frequency = Math.max(0.25, state.bubbleTrapFrequency);
      const x = dx / radius, y = dy / radius;
      const r = Math.sqrt(x*x + y*y);
      let d;
      switch(state.bubbleTrapShape){
        case 'grid': {
          const ring = Math.sin(r * Math.PI * frequency);
          const angle = Math.sin(Math.atan2(y, x) * Math.max(4, Math.round(8 * frequency)));
          d = Math.min(Math.abs(ring), Math.abs(angle) * 0.7) / (Math.PI * frequency);
          break;
        }
        case 'ringtrap': {
          // Circular Ring Trap: center the ring field on the selected radius, then
          // use frequency to repeat contours around it. Radius controls the overall
          // ring scale; frequency controls the spacing of the surrounding rings.
          const ringOffset = r - 1;
          const phase = ringOffset * Math.PI * frequency;
          d = Math.abs(Math.sin(phase)) / (Math.PI * frequency);
          break;
        }
        case 'rings':
          d = Math.abs(Math.sin(r * Math.PI * frequency)) / (Math.PI * frequency);
          break;
        case 'crosslines': {
          const gx = Math.abs(Math.sin(x * Math.PI * frequency));
          const gy = Math.abs(Math.sin(y * Math.PI * frequency));
          d = Math.min(gx, gy) / (Math.PI * frequency);
          break;
        }
        default:
          d = r;
      }
      return d*d;
    }
    const ax = Math.abs(dx), ay = Math.abs(dy);
    switch(state.trapShape){
      case 'square': { const d = Math.max(ax, ay); return d*d; }
      case 'diamond': { const d = (ax + ay) / Math.SQRT2; return d*d; }
      case 'cross': { const d = Math.min(ax, ay); return d*d; }
      default: return dx*dx + dy*dy;
    }
  }

  function computeOrbitField(px, py, kind, jr, ji, trapX, trapY){
    let zr, zi, cr, ci;
    const isJuliaVar = (kind === 'julia');
    if(isJuliaVar){ zr = px; zi = py; cr = jr; ci = ji; }
    else { zr = 0; zi = 0; cr = px; ci = py; }
    let n = 0;
    const maxIter = state.maxIter;
    let zr2 = zr*zr, zi2 = zi*zi;
    // Start at +Infinity rather than the seed point's own distance: for Mandelbrot-family
    // fractals z always starts at exactly (0,0), so with the default trap also at the
    // origin every pixel would trivially "win" with distance 0 before a single iteration
    // ran — flattening the whole field to zero. Only distances from actual iterates count.
    // We track the *squared* distance rather than distance itself: |z-trap| has a conical
    // (non-smooth) singularity right at its minimum, which is what produces a sharp "nipple"
    // point on each bubble instead of a rounded dome. |z-trap|^2 is smooth (parabolic) at
    // its minimum, so the resulting bump map reads as an actual sphere.
    //
    // Julia sets are the exception: there, z0 IS the pixel and varies meaningfully, and the
    // escape loop can legitimately finish with zero iterations (the pixel's own coordinate
    // already sits outside the bailout radius at a zoomed-out view). Without a fallback,
    // those "escaped" pixels would carry no measurement at all — minDist2 stuck at Infinity
    // forever, which poisons every downstream calculation with Infinity/NaN. So for Julia,
    // seed the measurement with the starting point's own distance; for everything else,
    // leave it at Infinity since the loop is guaranteed to run at least once anyway (the
    // origin always starts within the bailout radius).
    let minDist2 = isJuliaVar ? trapDistanceSquared(zr-trapX, zi-trapY) : Infinity;
    let minN = 0;
    while(n < maxIter && (zr2 + zi2) < (kind === 'burningship' ? 32.0 : 4)){
      if(kind === 'burningship'){
        const nzi = Math.abs(2*zr*zi) + ci;
        const nzr = zr2 - zi2 + cr;
        zr = nzr; zi = nzi;
      } else if(kind === 'tricorn'){
        const nzi = -2*zr*zi + ci;
        const nzr = zr2 - zi2 + cr;
        zr = nzr; zi = nzi;
      } else {
        const nzi = 2*zr*zi + ci;
        const nzr = zr2 - zi2 + cr;
        zr = nzr; zi = nzi;
      }
      zr2 = zr*zr; zi2 = zi*zi;
      const dxT = zr - trapX, dyT = zi - trapY;
      const d2 = trapDistanceSquared(dxT, dyT);
      if(d2 < minDist2){ minDist2 = d2; minN = n+1; }
      n++;
    }
    return { minDist2, minN, escaped: n < maxIter };
  }

  // ---- render dispatcher ----
  function render(targetCanvas, targetCtx, tw, th, onDone){
    if(state.type === 'apollonian'){
      renderApollonianGasket(targetCtx, tw, th, onDone);
    } else if(state.shadingMode === 'filigree' && state.bubbleTrapShape === 'ringtrap'){
      // For this specific combination, use the Gemini-style orbit-trap coloring
      // path instead of our usual height-field / bump-lighting Golden Filigree pass.
      renderGeminiRingTrap(targetCtx, tw, th, onDone);
    } else if(state.shadingMode === 'trap' || state.shadingMode === 'filigree'){
      renderTrapField(targetCtx, tw, th, onDone);
    } else {
      renderStandard(targetCtx, tw, th, onDone);
    }
  }

  // ---- Gemini-style circular orbit-trap renderer ----
  // Closely follows the source prototype's algorithm: track the minimum distance
  // from each iterated z to a circular trap, map exp(-glow * dMin) plus a small
  // escape-time contribution into a palette, and color interior points as well as
  // escaped points. The frequency control is retained as a distance-thickness
  // multiplier so it remains useful in this app's Circular Ring Trap mode.
  function renderGeminiRingTrap(targetCtx, tw, th, onDone){
    const token = ++renderToken;
    progressBar.classList.add('is-active');
    progressBar.style.width = '3%';
    const imgData = targetCtx.createImageData(tw, th);
    const data = imgData.data;
    const palette = buildPaletteLinearFn();
    const kind = state.type;
    const maxIter = state.maxIter;
    const jr = state.juliaRe, ji = state.juliaIm;
    const trapX = state.trapX, trapY = state.trapY;
    const trapRadius = Math.max(0.001, state.bubbleTrapRadius);
    const glow = Math.max(0, state.bubbleTrapGlow);
    const frequency = Math.max(0.25, state.bubbleTrapFrequency);
    const scaleX = state.scale;
    const scaleY = state.scale / (tw / th);
    const xmin = state.cx - scaleX/2, xmax = state.cx + scaleX/2;
    const ymin = state.cy - scaleY/2, ymax = state.cy + scaleY/2;
    const rowsPerChunk = Math.max(1, Math.floor(th / 60));
    const t0 = performance.now();
    let row = 0;

    function chunk(){
      if(token !== renderToken) return;
      const rowEnd = Math.min(th, row + rowsPerChunk);
      for(let py = row; py < rowEnd; py++){
        const y0 = kind === 'burningship'
          ? ymin + (py / Math.max(1, th-1)) * (ymax-ymin)
          : ymax - (py / Math.max(1, th-1)) * (ymax-ymin);
        for(let px = 0; px < tw; px++){
          const x0 = xmin + (px / Math.max(1, tw-1)) * (xmax-xmin);
          let x = kind === 'julia' ? x0 : 0;
          let y = kind === 'julia' ? y0 : 0;
          const cx = kind === 'julia' ? jr : x0;
          const cy = kind === 'julia' ? ji : y0;
          let i = 0;
          let dMin = 1e10;
          const escapeRadiusSq = 32.0; // same wider bailout used by Gemini's renderer
          while(i < maxIter){
            const x2 = x*x, y2 = y*y;
            if(x2+y2 > escapeRadiusSq) break;
            let nx, ny;
            if(kind === 'burningship'){
              nx = x2-y2+cx;
              ny = 2*Math.abs(x*y)+cy;
            } else if(kind === 'tricorn'){
              nx = x2-y2+cx;
              ny = -2*x*y+cy;
            } else {
              nx = x2-y2+cx;
              ny = 2*x*y+cy;
            }
            x = nx; y = ny;
            const dx = x-trapX, dy = y-trapY;
            // Gemini's circle trap is |z - trapCenter| - radius. Frequency scales
            // the distance field's width without changing the underlying orbit.
            const d = Math.abs(Math.sqrt(dx*dx+dy*dy)-trapRadius) * frequency;
            if(d < dMin) dMin = d;
            i++;
          }
          const factor = Math.exp(-glow*dMin);
          const escapeBlend = i < maxIter ? i/maxIter : 0;
          const t = Math.max(0, Math.min(1, factor*0.88 + escapeBlend*0.12));
          const color = palette(t);
          const idx = (py*tw+px)*4;
          data[idx] = Math.round(color[0]);
          data[idx+1] = Math.round(color[1]);
          data[idx+2] = Math.round(color[2]);
          data[idx+3] = 255;
        }
      }
      row = rowEnd;
      progressBar.style.width = (row/th*95) + '%';
      if(row < th){
        requestAnimationFrame(chunk);
      } else {
        if(token !== renderToken) return;
        targetCtx.putImageData(imgData, 0, 0);
        progressBar.style.width = '0%';
        progressBar.classList.remove('is-active');
        document.getElementById('renderTime').textContent = `rendered in ${(performance.now()-t0).toFixed(0)}ms`;
        if(onDone) onDone();
      }
    }
    requestAnimationFrame(chunk);
  }

  // ---- Apollonian Gasket: Descartes circle packing ported from the Gemini prototype ----
  function renderApollonianGasket(targetCtx, tw, th, onDone){
    const token = ++renderToken;
    progressBar.classList.add('is-active');
    progressBar.style.width = '8%';
    const bg = hexToRgb(state.bg);
    targetCtx.fillStyle = state.bg;
    targetCtx.fillRect(0, 0, tw, th);

    // The source prototype uses a circular viewport. Keep the same visual framing,
    // while mapping the app's shared center/scale to pan and zoom the gasket.
    const baseRadius = Math.min(tw, th) * 0.46;
    const zoom = 3.2 / Math.max(1e-9, state.scale);
    const outerRadius = baseRadius * Math.min(zoom, 1000);
    const sx = tw / 2 + (-0.5 - state.cx) * (tw / state.scale);
    const sy = th / 2 + state.cy * (th / state.scale);
    const c0 = {x:0, y:0, r:-outerRadius, k:-1/outerRadius, depth:0};
    const rInner = outerRadius * (2 * Math.sqrt(3) - 3);
    const dDist = outerRadius - rInner;
    const makeCircle = (x,y,r,depth) => ({x,y,r,k:1/r,depth});
    const c1 = makeCircle(0,dDist,rInner,0);
    const c2 = makeCircle(dDist*Math.cos(210*Math.PI/180),dDist*Math.sin(210*Math.PI/180),rInner,0);
    const c3 = makeCircle(dDist*Math.cos(330*Math.PI/180),dDist*Math.sin(330*Math.PI/180),rInner,0);
    const circles = [c1,c2,c3];
    const maxDepth = state.gasketDepth;
    const minRadius = Math.max(0.45, Math.min(tw,th)/Math.max(tw,th));
    function recurse(a,b,c,opposite,depth){
      if(depth > maxDepth || circles.length > 180000 || token !== renderToken) return;
      const k = 2*(a.k+b.k+c.k)-opposite.k;
      if(!Number.isFinite(k) || Math.abs(k)<1e-12) return;
      const r = 1/k;
      if(!Number.isFinite(r) || Math.abs(r) < minRadius) return;
      const zkx = 2*(a.x*a.k+b.x*b.k+c.x*c.k) - opposite.x*opposite.k;
      const zky = 2*(a.y*a.k+b.y*b.k+c.y*c.k) - opposite.y*opposite.k;
      const x = zkx/k, y = zky/k;
      if(!Number.isFinite(x) || !Number.isFinite(y)) return;
      const next = makeCircle(x,y,r,depth);
      circles.push(next);
      recurse(a,b,next,c,depth+1);
      recurse(b,c,next,a,depth+1);
      recurse(c,a,next,b,depth+1);
    }
    recurse(c1,c2,c3,c0,1);
    recurse(c0,c1,c2,c3,1);
    recurse(c0,c2,c3,c1,1);
    recurse(c0,c3,c1,c2,1);
    circles.sort((a,b)=>Math.abs(b.r)-Math.abs(a.r));
    const palette = buildPaletteLinearFn();
    const start = performance.now();
    for(let i=0;i<circles.length;i++){
      if(token !== renderToken) return;
      const c = circles[i];
      const radius = Math.abs(c.r);
      const x = sx + c.x, y = sy - c.y;
      if(x+radius<0 || x-radius>tw || y+radius<0 || y-radius>th) continue;
      const t = Math.max(0, Math.min(1, c.depth / Math.max(1,maxDepth)));
      const rgb = palette(state.gasketFill ? 0.15 + 0.8*t : 0.25 + 0.7*t);
      const color = `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
      targetCtx.beginPath();
      targetCtx.arc(x,y,radius,0,Math.PI*2);
      if(state.gasketFill){ targetCtx.fillStyle = color; targetCtx.fill(); }
      targetCtx.lineWidth = state.gasketStroke;
      targetCtx.strokeStyle = state.gasketFill ? 'rgba(5,5,18,0.9)' : color;
      targetCtx.stroke();
    }
    progressBar.style.width = '100%';
    progressBar.classList.remove('is-active');
    progressBar.style.width = '0%';
    document.getElementById('renderTime').textContent = `gasket · ${circles.length} circles · ${(performance.now()-start).toFixed(0)}ms`;
    if(onDone) onDone();
  }

  // ---- Gemini-compatible Burning Ship renderer ----
  // Mirrors Gemini's Burning Ship iteration and smooth escape-time coloring,
  // using this app's current palette and canvas/state architecture.
  function renderBurningShipGemini(targetCtx, tw, th, onDone){
    const factor = 1.5; // Gemini Burning Ship preset enables 1.5x supersampling
    const hiCanvas = document.createElement('canvas');
    hiCanvas.width = Math.max(1, Math.round(tw * factor));
    hiCanvas.height = Math.max(1, Math.round(th * factor));
    const hiCtx = hiCanvas.getContext('2d');
    const token = ++renderToken;
    const imgData = hiCtx.createImageData(hiCanvas.width, hiCanvas.height);
    const data = imgData.data;
    const palette = buildPaletteFn();
    const maxIter = state.maxIter;
    const xmin = state.cx - state.scale / 2;
    const xmax = state.cx + state.scale / 2;
    const scaleY = state.scale / (tw / th);
    const ymin = state.cy - scaleY / 2;
    const ymax = state.cy + scaleY / 2;
    let row = 0;
    const rowsPerChunk = Math.max(1, Math.floor(hiCanvas.height / 100));
    const t0 = performance.now();
    progressBar.classList.add('is-active');
    progressBar.style.width = '3%';

    function chunk(){
      if(token !== renderToken) return;
      const end = Math.min(hiCanvas.height, row + rowsPerChunk);
      for(let py = row; py < end; py++){
        // Match Gemini's complex-plane orientation: y0 starts at ymin and increases down the canvas.
        const ci = ymin + (py / Math.max(1, hiCanvas.height - 1)) * (ymax - ymin);
        for(let px = 0; px < hiCanvas.width; px++){
          const cr = xmin + (px / Math.max(1, hiCanvas.width - 1)) * (xmax - xmin);
          let zr = 0, zi = 0, n = 0;
          let zr2 = 0, zi2 = 0;
          // Gemini uses an escape-radius squared of 32 for its pixel renderer.
          while(n < maxIter && (zr2 + zi2) <= 32.0){
            const nextR = zr2 - zi2 + cr;
            const nextI = 2.0 * Math.abs(zr * zi) + ci;
            zr = nextR; zi = nextI;
            zr2 = zr * zr; zi2 = zi * zi;
            n++;
          }
          let rgb;
          if(n >= maxIter){
            rgb = hexToRgb(state.interior);
          } else {
            // Gemini smooth iteration count: nu = log2(log(|z|)/log(2)).
            const magnitudeSq = Math.max(zr2 + zi2, 1e-300);
            const logZn = Math.log(magnitudeSq) / 2.0;
            const nu = Math.log2(Math.max(logZn, 1e-300) / Math.LN2);
            const smoothN = n + 1.0 - nu;
            const t = Math.max(0, Math.min(0.999999, smoothN / maxIter));
            rgb = palette(t);
          }
          const idx = (py * hiCanvas.width + px) * 4;
          data[idx] = Math.round(rgb[0]);
          data[idx+1] = Math.round(rgb[1]);
          data[idx+2] = Math.round(rgb[2]);
          data[idx+3] = 255;
        }
      }
      row = end;
      progressBar.style.width = (row / hiCanvas.height * 100) + '%';
      if(row < hiCanvas.height){
        requestAnimationFrame(chunk);
      } else {
        hiCtx.putImageData(imgData, 0, 0);
        targetCtx.save();
        targetCtx.imageSmoothingEnabled = true;
        targetCtx.imageSmoothingQuality = 'high';
        targetCtx.clearRect(0, 0, tw, th);
        targetCtx.drawImage(hiCanvas, 0, 0, tw, th);
        targetCtx.restore();
        progressBar.style.width = '0%';
        progressBar.classList.remove('is-active');
        document.getElementById('renderTime').textContent = `rendered in ${(performance.now()-t0).toFixed(0)}ms`;
        if(onDone) onDone();
      }
    }
    requestAnimationFrame(chunk);
  }

  // ---- standard single-pass render (color bands / potential-based lighting) ----
  function renderStandard(targetCtx, tw, th, onDone){
    progressBar.classList.add('is-active');
    progressBar.style.width = '3%';
    const token = ++renderToken;
    const imgData = targetCtx.createImageData(tw, th);
    const data = imgData.data;
    const paletteBands = buildPaletteFn();
    const paletteLinear = buildPaletteLinearFn();
    const interiorRgb = hexToRgb(state.interior);
    const kind = state.type;
    const jr = state.juliaRe, ji = state.juliaIm;
    const needDeriv = state.shadingMode === 'lit';
    const light = buildLight();

    const scaleX = state.scale;
    const scaleY = state.scale / (tw / th);
    const xmin = state.cx - scaleX/2, xmax = state.cx + scaleX/2;
    const ymin = state.cy - scaleY/2, ymax = state.cy + scaleY/2;

    let row = 0;
    const rowsPerChunk = Math.max(1, Math.floor(th / 120));
    const t0 = performance.now();

    function chunk(){
      if(token !== renderToken) return; // cancelled
      const rowEnd = Math.min(th, row + rowsPerChunk);
      for(let y = row; y < rowEnd; y++){
        const py = kind === 'burningship'
          ? ymin + (y / (th-1)) * (ymax - ymin)
          : ymax - (y / (th-1)) * (ymax - ymin);
        for(let x = 0; x < tw; x++){
          const px = xmin + (x / (tw-1)) * (xmax - xmin);
          const rgb = computePixelColor(px, py, kind, jr, ji, needDeriv, light, paletteBands, paletteLinear, interiorRgb);
          const idx = (y*tw + x) * 4;
          data[idx] = rgb[0]; data[idx+1] = rgb[1]; data[idx+2] = rgb[2]; data[idx+3] = 255;
        }
      }
      row = rowEnd;
      progressBar.style.width = (row/th*100) + '%';
      if(row < th){
        requestAnimationFrame(chunk);
      } else {
        targetCtx.putImageData(imgData, 0, 0);
        progressBar.style.width = '0%';
        progressBar.classList.remove('is-active');
        const dt = (performance.now() - t0).toFixed(0);
        document.getElementById('renderTime').textContent = `rendered in ${dt}ms`;
        if(onDone) onDone();
      }
    }
    requestAnimationFrame(chunk);
  }

  // ---- orbit-trap two-pass render (bubble shading) ----
  // Pass 1 fills a height field (closest-approach distance) across the frame.
  // Pass 2 reads neighboring height values to build a normal map and light it,
  // the same way a heightmap-to-bumpmap conversion works for terrain or textures.
  function renderTrapField(targetCtx, tw, th, onDone){
    progressBar.classList.add('is-active');
    progressBar.style.width = '3%';
    const token = ++renderToken;
    const heightArr = new Float32Array(tw*th);
    const minNArr = new Float32Array(tw*th);
    const interiorArr = new Uint8Array(tw*th);
    const kind = state.type;
    const jr = state.juliaRe, ji = state.juliaIm;
    const trapX = state.trapX, trapY = state.trapY;

    const scaleX = state.scale;
    const scaleY = state.scale / (tw / th);
    const xmin = state.cx - scaleX/2, xmax = state.cx + scaleX/2;
    const ymin = state.cy - scaleY/2, ymax = state.cy + scaleY/2;

    let row = 0;
    const rowsPerChunk = Math.max(1, Math.floor(th / 90));
    const t0 = performance.now();

    function chunk1(){
      if(token !== renderToken) return;
      const rowEnd = Math.min(th, row + rowsPerChunk);
      for(let y = row; y < rowEnd; y++){
        const py = kind === 'burningship'
          ? ymin + (y / (th-1)) * (ymax - ymin)
          : ymax - (y / (th-1)) * (ymax - ymin);
        for(let x = 0; x < tw; x++){
          const px = xmin + (x / (tw-1)) * (xmax - xmin);
          const field = computeOrbitField(px, py, kind, jr, ji, trapX, trapY);
          const i = y*tw + x;
          heightArr[i] = field.minDist2;
          minNArr[i] = field.minN;
          interiorArr[i] = field.escaped ? 0 : 1;
        }
      }
      row = rowEnd;
      progressBar.style.width = (row/th*80) + '%';
      if(row < th){
        requestAnimationFrame(chunk1);
      } else {
        requestAnimationFrame(phase2);
      }
    }

    function phase2(){
      if(token !== renderToken) return;
      const imgData = targetCtx.createImageData(tw, th);
      const data = imgData.data;
      const paletteLinear = state.shadingMode === 'filigree' ? buildPaletteLinearFn() : buildPaletteLinearFn();
      const interiorRgb = hexToRgb(state.interior);
      const light = buildLight();
      const lightNorm = Math.sqrt(light.lx*light.lx + light.ly*light.ly + light.h*light.h) || 1;
      const bump = state.shadingMode === 'filigree' ? state.bubbleTrapGlow : state.trapBump;
      const trapCycle = state.trapCycle;
      const stepped2 = state.trapBandStyle === 'stepped2';
      const stepped3 = state.trapBandStyle === 'stepped3';
      const hueShift = state.trapHueShift;
      const bandWarp = state.trapBandWarp;
      const colorSource = state.trapColorSource;
      const stopA = hexToRgb(state.colors[0]);
      const stopB = hexToRgb(state.colors[1]);
      const stopC = hexToRgb(state.colors[2]);

      // Two different quantities can drive the color bands:
      //  - "distance": how close the orbit got to the trap point. Level sets are
      //    circles centered on the trap, so bands always radiate outward from one
      //    fixed point — flat concentric rings (before Band warp bends them locally).
      //  - "sequence": which iteration the closest approach happened on. Points
      //    further along a spiral arm reach their closest approach at later
      //    iterations than points near the start of the arm, so banding by this
      //    instead makes color flow along the spiral's own growth order — following
      //    the curve itself rather than radiating from a point.
      const measureAt = colorSource === 'sequence'
        ? (k => minNArr[k])
        : (k => Math.sqrt(heightArr[k]));

      // "Bubble size" needs to match whatever range of trap-distances actually
      // appears in the current view — and that range shrinks unpredictably (not
      // proportionally to zoom) as you go deeper, so a fixed default is only ever
      // right by luck. With auto on, measure it directly from the height field we
      // just computed instead of trusting a static number.
      let trapRadius = state.trapRadius;
      let baseline = 0;
      if(state.trapAutoRadius){
        let obsMin = Infinity, obsMax = -Infinity;
        for(let k = 0; k < heightArr.length; k++){
          if(!interiorArr[k]){
            const v = measureAt(k);
            // Guard against any stray non-finite measurement (e.g. a point whose
            // escape loop never ran) polluting the observed range with Infinity/NaN,
            // which would otherwise propagate into every pixel's color index below.
            if(isFinite(v)){
              if(v < obsMin) obsMin = v;
              if(v > obsMax) obsMax = v;
            }
          }
        }
        if(!isFinite(obsMin) || !isFinite(obsMax)){ obsMin = 0; obsMax = trapRadius; }
        const span = Math.max(1e-9, obsMax - obsMin);
        const effRepeats = trapCycle ? Math.max(1, state.trapRepeats) : 1;
        trapRadius = span / effRepeats;
        baseline = obsMin;
        if(!isFinite(trapRadius) || trapRadius <= 0) trapRadius = state.trapRadius || 1.1;
        if(!isFinite(baseline)) baseline = 0;
        state.trapRadius = trapRadius;
        const slider = document.getElementById('trapRadius');
        if(slider){
          const lo = parseFloat(slider.min), hi = parseFloat(slider.max);
          slider.value = Math.min(hi, Math.max(lo, trapRadius));
        }
      }

      for(let y = 0; y < th; y++){
        const yUp = Math.max(0, y-1), yDown = Math.min(th-1, y+1);
        for(let x = 0; x < tw; x++){
          const i = y*tw + x;
          const outIdx = i*4;
          if(interiorArr[i]){
            data[outIdx] = interiorRgb[0]; data[outIdx+1] = interiorRgb[1]; data[outIdx+2] = interiorRgb[2]; data[outIdx+3] = 255;
            continue;
          }
          const xL = Math.max(0, x-1), xR = Math.min(tw-1, x+1);
          const hL = heightArr[y*tw + xL], hR = heightArr[y*tw + xR];
          const hU = heightArr[yUp*tw + x], hD = heightArr[yDown*tw + x];
          let nx = -(hR - hL) * bump, ny = -(hD - hU) * bump, nz = 1;
          const nlen = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
          nx /= nlen; ny /= nlen; nz /= nlen;
          const diffuseRaw = (nx*light.lx + ny*light.ly + nz*light.h) / lightNorm;
          const diffuse = Math.max(0, Math.min(1, diffuseRaw));
          const shade = light.ambient + (1 - light.ambient) * diffuse;
          const spec = Math.pow(diffuse, light.shininess) * light.specStrength;
          // Base color source: how far this point's closest orbit approach was from
          // the trap, as a fraction of "Bubble size". With "Repeat gradient" off this
          // runs once (clamped) across the whole scene, like a single sky gradient.
          // With it on, the palette repeats every "Bubble size" units of distance, so
          // neighboring bubbles (which sit at different distance bands from the trap)
          // land on distinctly different solid colors instead of blending together.
          // "Alternating" skips interpolation entirely: each integer band hard-switches
          // to the next stop in rotation (2-color: A/C: 3-color: A/B/C), so there's no
          // blended color between bands — just solid, repeating swaps.
          const raw = 1 - (measureAt(i) - baseline) / trapRadius + hueShift + bandWarp*(diffuse - 0.5);
          let base;
          if(trapCycle && stepped2){
            const band = Math.floor(raw);
            const parity = ((band % 2) + 2) % 2;
            base = parity === 0 ? stopA : stopC;
          } else if(trapCycle && stepped3){
            const band = Math.floor(raw);
            const idx = ((band % 3) + 3) % 3;
            base = idx === 0 ? stopA : (idx === 1 ? stopB : stopC);
          } else {
            const t = trapCycle ? (raw - Math.floor(raw)) : Math.max(0, Math.min(1, raw));
            base = paletteLinear(t);
          }
          if(state.shadingMode === 'filigree'){
            // Fine contour-like luminous bands: narrow gold/ivory lines against a deep umber field.
            const phase = raw * 34 + Math.sqrt(Math.max(0, measureAt(i))) * 7;
            const ridge = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phase)) * 8), 2.2);
            const glow = Math.pow(Math.max(0, 1 - Math.abs(Math.sin(phase)) * 2.2), 3.0);
            const dark = [24, 11, 6], gold = [255, 207, 137], ivory = [255, 244, 218];
            const mix = (a,b,t)=>a+(b-a)*t;
            const line = Math.min(1, ridge * 0.95 + glow * 0.35);
            base = [mix(dark[0],gold[0],line),mix(dark[1],gold[1],line),mix(dark[2],gold[2],line)];
            const halo = glow * 0.25;
            base = [Math.min(255,base[0]+ivory[0]*halo),Math.min(255,base[1]+ivory[1]*halo),Math.min(255,base[2]+ivory[2]*halo)];
          }
          let r = base[0]*shade, g = base[1]*shade, b = base[2]*shade;
          r += spec*(255 - r); g += spec*(255 - g); b += spec*(255 - b);
          data[outIdx] = r; data[outIdx+1] = g; data[outIdx+2] = b; data[outIdx+3] = 255;
        }
      }
      targetCtx.putImageData(imgData, 0, 0);
      progressBar.style.width = '0%';
      progressBar.classList.remove('is-active');
      const dt = (performance.now() - t0).toFixed(0);
      document.getElementById('renderTime').textContent = `rendered in ${dt}ms`;
      if(onDone) onDone();
    }

    requestAnimationFrame(chunk1);
  }

  function applyAutoIter(){
    if(!state.autoIter) return;
    // Deeper zooms need more iterations to resolve new boundary detail; without this,
    // the escape-count field looks nearly flat across the frame and zooming feels like
    // it isn't "going anywhere." Ramp iterations up roughly with log2 of the zoom factor.
    const zoomRatio = Math.max(1, 3.2 / state.scale);
    const computed = Math.round(200 + 65 * Math.log2(zoomRatio + 1));
    const clamped = Math.min(4000, Math.max(80, computed));
    state.maxIter = clamped;
    maxIterRange.value = clamped;
    maxIterNum.value = clamped;
  }

  function renderMain(){
    clearError();
    applyAutoIter();
    canvasWrap.style.background = state.bg;
    render(canvas, ctx, W, H);
    updateReadout();
  }

  // ---- UI sync ----
  function updateReadout(){
    document.getElementById('roCenter').textContent = `${state.cx.toFixed(6)}, ${state.cy.toFixed(6)}`;
    document.getElementById('roScale').textContent = state.scale.toExponential(3);
    document.getElementById('statIter').textContent = state.maxIter;
    document.getElementById('statZoom').textContent = (3.2/state.scale).toFixed(1) + '×';
  }

  // ---- controls wiring ----
  const fractalTypeSel = document.getElementById('fractalType');
  const juliaControls = document.getElementById('juliaControls');
  const gasketControls = document.getElementById('gasketControls');
  const shadingSection = document.getElementById('shadingSection');
  const detailSection = document.getElementById('detailSection');
  function setSectionDisabled(section, disabled, noteId){
    section.classList.toggle('is-disabled', disabled);
    section.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    section.querySelectorAll('input, select, button, textarea').forEach(control => {
      control.disabled = disabled;
    });
    const note = document.getElementById(noteId);
    if(note) note.style.display = disabled ? 'block' : 'none';
  }
  function syncTypeControls(){
    const isGasket = state.type === 'apollonian';
    juliaControls.style.display = state.type === 'julia' ? 'block' : 'none';
    gasketControls.style.display = isGasket ? 'block' : 'none';
    setSectionDisabled(shadingSection, isGasket, 'shadingDisabledNote');
    setSectionDisabled(detailSection, isGasket, 'detailDisabledNote');
  }
  fractalTypeSel.addEventListener('change', () => {
    state.type = fractalTypeSel.value;
    if(state.type === 'burningship'){
      // Gemini Burning Ship preset framing. The app's scale represents the complex-plane width.
      state.cx = -1.7512;
      state.cy = -0.0235;
      state.scale = 3.2 / 28.0;
      state.maxIter = 160;
      state.autoIter = false;
      // Burning Ship defaults to the app's Red Ember palette, without changing it on every render.
      state.colors = ['#0a0303', '#8f1010', '#ffe3d6'];
      state.bg = '#0a0303';
      document.getElementById('colorA').value = state.colors[0];
      document.getElementById('colorB').value = state.colors[1];
      document.getElementById('colorC').value = state.colors[2];
      document.getElementById('colorBg').value = state.bg;
      document.getElementById('maxIter').value = String(state.maxIter);
      document.getElementById('autoIter').checked = false;
      updatePalettePreview();
    }
    syncTypeControls();
    renderMain();
  });
  document.getElementById('gasketDepth').addEventListener('input', e => { state.gasketDepth = parseInt(e.target.value,10); renderMain(); });
  document.getElementById('gasketStroke').addEventListener('input', e => { state.gasketStroke = parseFloat(e.target.value); renderMain(); });
  document.getElementById('gasketFill').addEventListener('change', e => { state.gasketFill = e.target.checked; renderMain(); });
  syncTypeControls();

  document.getElementById('juliaRe').addEventListener('input', e => {
    state.juliaRe = parseFloat(e.target.value); renderMain();
  });
  document.getElementById('juliaIm').addEventListener('input', e => {
    state.juliaIm = parseFloat(e.target.value); renderMain();
  });

  function colorInput(id, idx){
    document.getElementById(id).addEventListener('input', e => {
      if(idx === 'interior'){ state.interior = e.target.value; }
      else if(idx === 'bg'){ state.bg = e.target.value; }
      else { state.colors[idx] = e.target.value; }
      updatePalettePreview();
      renderMain();
    });
  }
  colorInput('colorA', 0);
  colorInput('colorB', 1);
  colorInput('colorC', 2);
  colorInput('colorInterior', 'interior');
  colorInput('colorBg', 'bg');

  document.getElementById('cycleScale').addEventListener('input', e => {
    state.cycleScale = parseFloat(e.target.value); renderMain();
  });

  const shadingModeSel = document.getElementById('shadingMode');
  const litControls = document.getElementById('litControls');
  const trapControls = document.getElementById('trapControls');
  const trapShapeSel = document.getElementById('trapShape');
  if(trapShapeSel){
    trapShapeSel.value = state.trapShape;
    trapShapeSel.addEventListener('change', () => { state.trapShape = trapShapeSel.value; renderMain(); });
  }
  const cycleScaleRow = document.getElementById('cycleScale').closest('.row');
  const bubbleTrapSection = document.getElementById('bubbleTrapSection');
  const bubbleTrapControls = document.getElementById('bubbleTrapControls');
  const bubbleTrapDisabledNote = document.getElementById('bubbleTrapDisabledNote');
  function updateBubbleTrapVisibility(){
    const active = state.shadingMode === 'filigree';
    bubbleTrapControls.style.display = active ? 'block' : 'none';
    bubbleTrapDisabledNote.style.display = active ? 'none' : 'block';
    bubbleTrapSection.classList.toggle('section-disabled', !active);
  }
  updateBubbleTrapVisibility();
  shadingModeSel.addEventListener('change', () => {
    state.shadingMode = shadingModeSel.value;
    const isLit = state.shadingMode === 'lit';
    const isTrap = state.shadingMode === 'trap' || state.shadingMode === 'filigree';
    litControls.style.display = (isLit || isTrap) ? 'block' : 'none';
    trapControls.style.display = isTrap ? 'block' : 'none';
    cycleScaleRow.style.display = (isLit || isTrap) ? 'none' : 'flex';
    updateBubbleTrapVisibility();
    renderMain();
  });
  const bubbleTrapShapeSel = document.getElementById('bubbleTrapShape');
  bubbleTrapShapeSel.addEventListener('change', () => { state.bubbleTrapShape = bubbleTrapShapeSel.value; renderMain(); });
  function bubbleTrapInput(id, key, outputId, decimals){
    const input = document.getElementById(id), output = document.getElementById(outputId);
    input.addEventListener('input', e => {
      state[key] = parseFloat(e.target.value);
      output.value = state[key].toFixed(decimals);
      renderMain();
    });
  }
  bubbleTrapInput('bubbleTrapRadius', 'bubbleTrapRadius', 'bubbleTrapRadiusValue', 2);
  bubbleTrapInput('bubbleTrapGlow', 'bubbleTrapGlow', 'bubbleTrapGlowValue', 1);
  bubbleTrapInput('bubbleTrapFrequency', 'bubbleTrapFrequency', 'bubbleTrapFrequencyValue', 2);

  function lightInput(id, key, isInt){
    document.getElementById(id).addEventListener('input', e => {
      state[key] = isInt ? parseInt(e.target.value) : parseFloat(e.target.value);
      renderMain();
    });
  }
  lightInput('lightAngle', 'lightAngle', true);
  lightInput('lightHeight', 'lightHeight', false);
  lightInput('lightAmbient', 'lightAmbient', false);
  lightInput('lightSpec', 'lightSpec', false);
  lightInput('lightShininess', 'lightShininess', true);
  lightInput('trapX', 'trapX', false);
  lightInput('trapY', 'trapY', false);
  lightInput('trapBump', 'trapBump', false);
  lightInput('trapHueShift', 'trapHueShift', false);
  lightInput('trapBandWarp', 'trapBandWarp', false);
  lightInput('trapRepeats', 'trapRepeats', true);

  const trapAutoRadiusCheckbox = document.getElementById('trapAutoRadius');
  trapAutoRadiusCheckbox.addEventListener('change', () => {
    state.trapAutoRadius = trapAutoRadiusCheckbox.checked;
    renderMain();
  });

  const trapRadiusSlider = document.getElementById('trapRadius');
  trapRadiusSlider.addEventListener('input', e => {
    state.trapRadius = parseFloat(e.target.value);
    state.trapAutoRadius = false;
    trapAutoRadiusCheckbox.checked = false;
    renderMain();
  });

  const trapCycleCheckbox = document.getElementById('trapCycle');
  trapCycleCheckbox.addEventListener('change', () => {
    state.trapCycle = trapCycleCheckbox.checked;
    renderMain();
  });

  const trapColorSourceSel = document.getElementById('trapColorSource');
  trapColorSourceSel.addEventListener('change', () => {
    state.trapColorSource = trapColorSourceSel.value;
    renderMain();
  });

  const trapBandStyleSel = document.getElementById('trapBandStyle');
  trapBandStyleSel.addEventListener('change', () => {
    state.trapBandStyle = trapBandStyleSel.value;
    renderMain();
  });

  const autoIterCheckbox = document.getElementById('autoIter');
  autoIterCheckbox.addEventListener('change', () => {
    state.autoIter = autoIterCheckbox.checked;
    renderMain();
  });

  const maxIterRange = document.getElementById('maxIter');
  const maxIterNum = document.getElementById('maxIterNum');
  maxIterRange.addEventListener('input', e => {
    state.maxIter = parseInt(e.target.value); maxIterNum.value = state.maxIter;
    state.autoIter = false; autoIterCheckbox.checked = false;
    renderMain();
  });
  maxIterNum.addEventListener('change', e => {
    let v = Math.min(4000, Math.max(50, parseInt(e.target.value) || 300));
    state.maxIter = v; maxIterRange.value = v; maxIterNum.value = v;
    state.autoIter = false; autoIterCheckbox.checked = false;
    renderMain();
  });

  const presets = {
    indigo:  ['#050512', '#3a2fd6', '#d9d3ff'],
    ember:   ['#0a0303', '#8f1010', '#ffe3d6'],
    mono:    ['#050505', '#5a5a66', '#f2f2f5'],
    frost:   ['#020617', '#1fb6c9', '#ecfeff'],
    bubble:  ['#15141f', '#4c3fae', '#eeecf8'],
    crimson: ['#0a0505', '#8a1c2b', '#ffe8e0']
  };
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = presets[btn.dataset.preset];
      state.colors = p.slice();
      state.bg = p[0];
      document.getElementById('colorA').value = p[0];
      document.getElementById('colorB').value = p[1];
      document.getElementById('colorC').value = p[2];
      document.getElementById('colorBg').value = p[0];
      updatePalettePreview();
      renderMain();
    });
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if(state.type === 'burningship'){
      // Reset Burning Ship to its Gemini-compatible default view, not the generic Mandelbrot view.
      state.cx = -1.7512;
      state.cy = -0.0235;
      state.scale = 3.2 / 28.0;
      state.maxIter = 160;
      state.autoIter = false;
      document.getElementById('maxIter').value = String(state.maxIter);
      document.getElementById('autoIter').checked = false;
    } else {
      state.cx = -0.5; state.cy = 0.0; state.scale = 3.2;
    }
    renderMain();
  });
  document.getElementById('zoomInBtn').addEventListener('click', () => {
    state.scale *= 0.5; renderMain();
  });
  document.getElementById('zoomOutBtn').addEventListener('click', () => {
    state.scale *= 2; renderMain();
  });

  // ---- canvas coordinate mapping ----
  function pixelToComplex(px, py){
    const rect = canvas.getBoundingClientRect();
    const fx = (px - rect.left) / rect.width;
    const fy = (py - rect.top) / rect.height;
    const scaleX = state.scale;
    const scaleY = state.scale / ASPECT;
    const xmin = state.cx - scaleX/2, ymax = state.cy + scaleY/2;
    return [ xmin + fx*scaleX, ymax - fy*scaleY ];
  }

  // ---- drag-to-zoom ----
  let dragging = false, dragStart = null, dragCurrent = null;
  canvas.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    dragging = true;
    dragStart = {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top))
    };
    dragCurrent = {...dragStart};
    selectBox.style.zIndex = '20';
    selectBox.style.left = dragStart.x + 'px';
    selectBox.style.top = dragStart.y + 'px';
    selectBox.style.width = '0px';
    selectBox.style.height = '0px';
    selectBox.style.display = 'block';
  });

  window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const [re, im] = pixelToComplex(e.clientX, e.clientY);
    document.getElementById('roCursor').textContent = `${re.toFixed(6)}, ${im.toFixed(6)}`;
    if(!dragging || !dragStart) return;
    const boundedX = Math.max(0, Math.min(rect.width, cx));
    const boundedY = Math.max(0, Math.min(rect.height, cy));
    dragCurrent = {x: boundedX, y: boundedY};
    // Keep the box inside the canvas and use a real rectangle in either drag direction.
    const left = Math.min(dragStart.x, boundedX);
    const top = Math.min(dragStart.y, boundedY);
    selectBox.style.left = left + 'px';
    selectBox.style.top = top + 'px';
    selectBox.style.width = Math.abs(boundedX - dragStart.x) + 'px';
    selectBox.style.height = Math.abs(boundedY - dragStart.y) + 'px';
  });

  window.addEventListener('mouseup', e => {
    if(!dragging || !dragStart) return;
    dragging = false;
    selectBox.style.display = 'none';
    const rect = canvas.getBoundingClientRect();
    const endX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const endY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const left = Math.min(dragStart.x, endX), right = Math.max(dragStart.x, endX);
    const top = Math.min(dragStart.y, endY), bottom = Math.max(dragStart.y, endY);
    const boxW = right - left, boxH = bottom - top;
    if(boxW < 8 || boxH < 8){ dragStart = null; dragCurrent = null; return; }

    // Use both selected corners. pixelToComplex handles the inverted screen Y axis.
    const [reA, imA] = pixelToComplex(rect.left + left, rect.top + top);
    const [reB, imB] = pixelToComplex(rect.left + right, rect.top + bottom);
    const newScaleX = Math.abs(reB - reA);
    const newScaleY = Math.abs(imA - imB) * ASPECT;
    state.cx = (reA + reB) / 2;
    state.cy = (imA + imB) / 2;
    state.scale = Math.max(1e-12, Math.max(newScaleX, newScaleY));
    dragStart = null;
    dragCurrent = null;
    renderMain();
  });

  canvas.addEventListener('dblclick', e => {
    if(e.shiftKey) return;
    const [re, im] = pixelToComplex(e.clientX, e.clientY);
    state.cx = re; state.cy = im; state.scale *= 0.4;
    renderMain();
  });

  canvas.addEventListener('click', e => {
    if(!e.shiftKey) return;
    const [re, im] = pixelToComplex(e.clientX, e.clientY);
    state.juliaRe = re; state.juliaIm = im;
    document.getElementById('juliaRe').value = re;
    document.getElementById('juliaIm').value = im;
    fractalTypeSel.value = 'julia';
    state.type = 'julia';
    juliaControls.style.display = 'block';
    renderMain();
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const [re, im] = pixelToComplex(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 0.85 : 1/0.85;
    // zoom toward cursor point: shift center toward point, then scale
    state.cx = re + (state.cx - re) * factor;
    state.cy = im + (state.cy - im) * factor;
    state.scale *= factor;
    renderMain();
  }, { passive: false });

  // ---- export ----
  document.getElementById('exportBtn').addEventListener('click', () => {
    const sizeSel = document.getElementById('exportSize').value;
    const [ew, eh] = sizeSel.split('x').map(Number);
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = ew; exportCanvas.height = eh;
    const exportCtx = exportCanvas.getContext('2d');

    const btn = document.getElementById('exportBtn');
    const originalLabel = btn.textContent;
    btn.textContent = 'Rendering…';
    btn.disabled = true;

    render(exportCanvas, exportCtx, ew, eh, () => {
      exportCanvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().replace(/[:.]/g,'-');
        a.href = url;
        a.download = `fractal-${state.type}-${stamp}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        btn.textContent = originalLabel;
        btn.disabled = false;
        renderMain(); // restore the on-screen canvas, since render() bumps the cancellation token
      }, 'image/png');
    });
  });

  // ---- init ----
  updatePalettePreview();
  renderMain();

  // Version 2.0 art-direction presets. These only set existing state and controls.
  const artPresets = {
    blue: { colors:['#061525','#17618b','#b5f0ff'], interior:'#02070b', bg:'#5c91b4', shadingMode:'trap', trapX:0, trapY:0, trapBump:95, trapBandWarp:0.35, lightAngle:135, lightHeight:1.5, lightAmbient:0.08, lightSpec:0.68, lightShininess:9, trapColorSource:'sequence', trapCycle:true, trapRepeats:12 },
    magenta: { colors:['#08040d','#92245f','#6ac8e8'], interior:'#020207', bg:'#050508', shadingMode:'trap', trapBump:115, trapBandWarp:0.55, lightAngle:140, lightHeight:1.3, lightAmbient:0.04, lightSpec:0.75, lightShininess:8, trapColorSource:'sequence', trapCycle:true, trapRepeats:16 },
    lake: { colors:['#030a20','#123d8c','#e4eaff'], interior:'#020617', bg:'#174fbd', shadingMode:'trap', trapBump:55, trapBandWarp:0.1, lightAngle:145, lightHeight:1.8, lightAmbient:0.18, lightSpec:0.82, lightShininess:12, trapColorSource:'distance', trapCycle:false },
    gold: { colors:['#30170b','#c28a54','#fff0c9'], interior:'#1b0b04', bg:'#180b05', shadingMode:'filigree', bubbleTrapShape:'ringtrap', bubbleTrapRadius:0.5, bubbleTrapGlow:10, bubbleTrapFrequency:1, trapBump:32, trapBandWarp:0.18, lightAngle:130, lightHeight:1.2, lightAmbient:0.22, lightSpec:0.35, lightShininess:5, trapColorSource:'sequence', trapCycle:true, trapRepeats:20 },
    indigo: { colors:['#08071b','#3935df','#d4ccff'], interior:'#03020a', bg:'#07051b', shadingMode:'lit', lightAngle:135, lightHeight:1.7, lightAmbient:0.08, lightSpec:0.9, lightShininess:16 }
  };
  document.querySelectorAll('[data-art-preset]').forEach(button => button.addEventListener('click', () => {
    const p = artPresets[button.dataset.artPreset]; if(!p) return;
    Object.assign(state, p);
    ['colorA','colorB','colorC'].forEach((id,i)=>document.getElementById(id).value=state.colors[i]);
    document.getElementById('colorInterior').value=state.interior; document.getElementById('colorBg').value=state.bg;
    ['trapX','trapY','trapBump','trapBandWarp','lightAngle','lightHeight','lightAmbient','lightSpec','lightShininess','trapRepeats','bubbleTrapRadius','bubbleTrapGlow','bubbleTrapFrequency'].forEach(id=>{if(state[id]!==undefined){const el=document.getElementById(id); if(el) el.value=state[id];}});
    ['bubbleTrapRadius','bubbleTrapGlow','bubbleTrapFrequency'].forEach((key)=>{const out=document.getElementById(key+'Value'); if(out) out.value=Number(state[key]).toFixed(key==='bubbleTrapGlow'?1:2);});
    const bubbleShapeSel=document.getElementById('bubbleTrapShape'); if(bubbleShapeSel){bubbleShapeSel.value=state.bubbleTrapShape;}
    document.getElementById('trapCycle').checked=!!state.trapCycle;
    document.getElementById('trapColorSource').value=state.trapColorSource||'distance';
    shadingModeSel.value=state.shadingMode;
    const isLit=state.shadingMode==='lit'||state.shadingMode==='trap'||state.shadingMode==='filigree';
    const isTrap=state.shadingMode==='trap'||state.shadingMode==='filigree';
    litControls.style.display=isLit?'block':'none'; trapControls.style.display=isTrap?'block':'none'; cycleScaleRow.style.display=isLit?'none':'flex';
    updateBubbleTrapVisibility();
    updatePalettePreview(); renderMain();
  }));

})();

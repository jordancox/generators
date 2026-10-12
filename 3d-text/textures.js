// Procedural canvas textures for the letter faces and the chrome/gold/holo
// reflection maps (the backdrops are in backgrounds.js). Everything is drawn from a
// seed, so the same settings always give the same picture, and every tiled
// texture wraps cleanly (the noise is periodic) so the GIF loops.

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
export const mixRgb = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/* Value noise on a lattice that wraps every `period` cells, summed over
   octaves whose periods double, so the result tiles at any size. */
export function periodicNoise(seed, period) {
  const rand = mulberry32(seed);
  const octaves = [];
  for (let o = 0, p = period; o < 4; o++, p *= 2) {
    const grid = new Float32Array(p * p);
    for (let i = 0; i < grid.length; i++) grid[i] = rand();
    octaves.push({ p, grid });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  // x, y in [0, 1) tile space
  return (x, y) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (const { p, grid } of octaves) {
      const fx = x * p, fy = y * p;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const i0 = ((x0 % p) + p) % p, j0 = ((y0 % p) + p) % p;
      const i1 = (i0 + 1) % p, j1 = (j0 + 1) % p;
      const a = grid[j0 * p + i0], b = grid[j0 * p + i1];
      const c = grid[j1 * p + i0], d = grid[j1 * p + i1];
      sum += amp * mix(mix(a, b, tx), mix(c, d, tx), ty);
      norm += amp;
      amp *= 0.5;
    }
    return sum / norm;
  };
}

function paintPixels(c, fn) {
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  const d = img.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const [r, g, b] = fn(x / c.width, y / c.height);
      const i = (y * c.width + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ---------- letter faces ----------
   "stretch" textures span each line of text once (v = 0 at the bottom of
   the letters, 1 at the top); "tile" textures repeat every 1 em. */

export function rainbow() {
  const c = canvas(4, 256);
  const ctx = c.getContext('2d');
  for (let y = 0; y < 256; y++) {
    // a full hue circle, so scrolling it one repeat per loop has no seam
    ctx.fillStyle = `hsl(${(y / 256) * 360}, 100%, 55%)`;
    ctx.fillRect(0, y, 4, 1);
  }
  return c;
}

export function gradient(top, bottom) {
  const c = canvas(4, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return c;
}

/* Glitter is pixel noise, like MySpace glitter text: drawn small and
   sampled without smoothing, so every frame's swap makes it twinkle. */
export function glitter(base, seed) {
  const rgb = hexToRgb(base);
  const rand = mulberry32(seed);
  const white = [255, 255, 255];
  return paintPixels(canvas(64, 64), () => {
    const r = rand();
    if (r < 0.1) return white;
    if (r < 0.22) return mixRgb(rgb, white, 0.55);
    const k = 0.3 + rand() * 0.75;
    return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
  });
}

export function checker(a, b) {
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? b : a;
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  return c;
}

export function marble(base, vein, seed) {
  const n = periodicNoise(seed, 4);
  const a = hexToRgb(base), b = hexToRgb(vein);
  return paintPixels(canvas(256, 256), (x, y) => {
    const s = Math.abs(Math.sin((x + y + n(x, y) * 2.2) * Math.PI * 3));
    const t = Math.pow(1 - s, 6);
    return mixRgb(a, b, clamp(t * 1.2 + (n(y, x) - 0.5) * 0.15, 0, 1));
  });
}

export function wood(seed) {
  const n = periodicNoise(seed, 3);
  const light = [214, 160, 92], dark = [122, 70, 28];
  return paintPixels(canvas(256, 256), (x, y) => {
    const s = Math.sin((y * 9 + n(x, y) * 3.5) * Math.PI * 2);
    const grain = (n(x * 0.25 + 0.5, y) - 0.5) * 0.25;
    return mixRgb(light, dark, clamp(0.5 + s * 0.35 + grain, 0, 1));
  });
}

/* Puffy cartoon clouds: clumps of blurred white circles on a sky
   gradient, each drawn at the wrapped positions too so the tile repeats. */
export function clouds(seed) {
  const rand = mulberry32(seed);
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3f86e8'); g.addColorStop(1, '#a8d4ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.filter = 'blur(5px)';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < 7; i++) {
    const cx = rand() * 256, cy = rand() * 256, w = 40 + rand() * 50;
    const puffs = [];
    for (let k = 0; k < 6; k++) puffs.push([cx + (rand() - 0.5) * w, cy + (rand() - 0.5) * w * 0.3, w * (0.18 + rand() * 0.16)]);
    for (const ox of [-256, 0, 256]) {
      for (const oy of [-256, 0, 256]) {
        ctx.beginPath();
        for (const [x, y, r] of puffs) { ctx.moveTo(x + ox + r, y + oy); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); }
        ctx.fill();
      }
    }
  }
  ctx.filter = 'none';
  return c;
}

export function camo(seed) {
  const n = periodicNoise(seed, 3);
  const cols = [[84, 98, 54], [120, 128, 76], [58, 52, 36], [150, 140, 98]];
  return paintPixels(canvas(256, 256), (x, y) => {
    const v = n(x, y);
    return cols[v < 0.42 ? 0 : v < 0.52 ? 1 : v < 0.6 ? 2 : 3];
  });
}

export function leopard(seed) {
  const rand = mulberry32(seed);
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9a646';
  ctx.fillRect(0, 0, 256, 256);
  const spots = [];
  for (let i = 0; i < 16; i++) spots.push([rand() * 256, rand() * 256, 16 + rand() * 12, rand()]);
  // draw every spot nine times so the ones crossing an edge wrap round
  for (const [sx, sy, r, k] of spots) {
    for (let ox = -256; ox <= 256; ox += 256) {
      for (let oy = -256; oy <= 256; oy += 256) {
        const x = sx + ox, y = sy + oy;
        ctx.fillStyle = '#b86a1e';
        ctx.beginPath(); ctx.ellipse(x, y, r * 0.7, r * 0.55, k * 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2a1608';
        ctx.lineWidth = 7 + k * 4;
        ctx.lineCap = 'round';
        for (let s = 0; s < 4; s++) {
          const a0 = k * 6 + s * 1.65;
          ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + 0.9); ctx.stroke();
        }
      }
    }
  }
  return c;
}

/* Mirror tiles with dark grout. Three seeds give three sets of lit
   tiles, swapped every couple of frames like the glitter. */
export function discoTiles(seed) {
  const rand = mulberry32(seed);
  const c = canvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c1c22';
  ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const r = rand();
      const v = r < 0.1 ? 255 : 90 + Math.floor(rand() * 110);
      ctx.fillStyle = r < 0.1 ? '#ffffff' : `rgb(${v},${v},${Math.min(255, v + 25)})`;
      ctx.fillRect(x * 8 + 1, y * 8 + 1, 7, 7);
    }
  }
  return c;
}

export function candy(a, b) {
  const A = hexToRgb(a), B = hexToRgb(b);
  // 45-degree stripes, 64 px a tile; the period (32) divides 64 so it wraps
  return paintPixels(canvas(64, 64), (x, y) => ((Math.round(x * 64) + Math.round(y * 64)) % 32 < 16 ? A : B));
}

export function zebra(seed) {
  const n = periodicNoise(seed, 3);
  return paintPixels(canvas(256, 256), (x, y) => {
    const v = Math.sin((x * 3 + n(x, y) * 1.4) * Math.PI * 2);
    return v > 0.15 ? [20, 18, 16] : [245, 242, 232];
  });
}

export function pizza(seed) {
  const rand = mulberry32(seed);
  const n = periodicNoise(seed + 1, 4);
  const c = paintPixels(canvas(256, 256), (x, y) => {
    const v = n(x, y);
    const bake = v > 0.62 ? 0.75 : 1;
    return [242 * bake, (178 + v * 40) * bake, 60 * bake];
  });
  const ctx = c.getContext('2d');
  const wrap = (fn) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) fn(ox, oy); };
  for (let i = 0; i < 7; i++) {
    const px = rand() * 256, py = rand() * 256, r = 20 + rand() * 9;
    const spots = Array.from({ length: 5 }, () => [(rand() - 0.5) * r, (rand() - 0.5) * r]);
    wrap((ox, oy) => {
      ctx.fillStyle = '#b3241a';
      ctx.beginPath(); ctx.arc(px + ox, py + oy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7e1410';
      for (const [sx, sy] of spots) { ctx.beginPath(); ctx.arc(px + ox + sx, py + oy + sy, 2.5, 0, Math.PI * 2); ctx.fill(); }
    });
  }
  ctx.fillStyle = '#2f8a2a';
  for (let i = 0; i < 14; i++) {
    const x = rand() * 256, y = rand() * 256, a = rand() * Math.PI;
    wrap((ox, oy) => {
      ctx.save(); ctx.translate(x + ox, y + oy); ctx.rotate(a); ctx.fillRect(-5, -2, 10, 4); ctx.restore();
    });
  }
  return c;
}

export function galaxy(seed) {
  const n = periodicNoise(seed, 3);
  const rand = mulberry32(seed + 5);
  const deep = [10, 4, 32], mid = [74, 26, 138], hot = [224, 74, 168];
  const c = paintPixels(canvas(256, 256), (x, y) => {
    const v = n(x, y);
    return v < 0.5 ? mixRgb(deep, mid, clamp((v - 0.25) * 4, 0, 1)) : mixRgb(mid, hot, clamp((v - 0.5) * 3, 0, 1));
  });
  const ctx = c.getContext('2d');
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = rand() < 0.8 ? '#ffffff' : '#9fe8ff';
    ctx.fillRect(Math.floor(rand() * 256), Math.floor(rand() * 256), 1, 1);
  }
  return c;
}

/* Flames get repainted every frame. The noise wraps vertically, and `t`
   (0..1 over the loop) scrolls it exactly one period, so the GIF loops. */
const flameNoise = periodicNoise(7, 4);
const FLAME_RAMP = [[90, 0, 0], [200, 20, 0], [255, 110, 0], [255, 200, 30], [255, 250, 190]];
export function flames(c, t) {
  return paintPixels(c, (x, y) => {
    const n = flameNoise(x, y + t);
    // y = 0 is the top row of the canvas, which maps to the top of the letters
    const heat = clamp((y * 1.25 - 0.15) + (n - 0.5) * 0.9, 0, 0.999);
    const f = heat * (FLAME_RAMP.length - 1);
    const i = Math.floor(f);
    return mixRgb(FLAME_RAMP[i], FLAME_RAMP[i + 1], f - i);
  });
}

/* Lava: dark crust with glowing cracks along the noise's mid-line,
   creeping sideways one tile per loop. */
const lavaNoise = periodicNoise(13, 3);
const LAVA_RAMP = [[40, 10, 4], [150, 20, 0], [255, 90, 0], [255, 200, 40], [255, 245, 180]];
export function lava(c, t) {
  return paintPixels(c, (x, y) => {
    const v = lavaNoise(x + t, y);
    const glow = clamp(1 - Math.abs(v - 0.5) * 12, 0, 0.999);
    const f = glow * (LAVA_RAMP.length - 1);
    const i = Math.floor(f);
    return mixRgb(LAVA_RAMP[i], LAVA_RAMP[i + 1], f - i);
  });
}

// the small canvas the live (repainted every frame) finishes draw into
export const liveCanvas = () => canvas(96, 96);

export function picture(img) {
  const c = canvas(512, 512);
  if (!img) return c;
  const ctx = c.getContext('2d');
  const s = Math.max(512 / img.width, 512 / img.height);
  ctx.drawImage(img, (512 - img.width * s) / 2, (512 - img.height * s) / 2, img.width * s, img.height * s);
  return c;
}

/* The flat letter fronts can't pick up a horizon from a reflection (every
   point looks the same way), so chrome and gold paint one on: sky fading
   down to a bright horizon line, then dark ground, as on every 80s logo. */
const METAL_STOPS = {
  gold: [[0, '#4a2600'], [0.42, '#ffd24a'], [0.5, '#fffbe0'], [0.53, '#6a3a00'], [0.78, '#d99a1c'], [1, '#ffe9a0']],
  chrome: [[0, '#0a1648'], [0.3, '#3a6fd0'], [0.47, '#bcdcff'], [0.5, '#ffffff'], [0.53, '#24140a'], [0.76, '#8a5f3a'], [1, '#ecd2b0']],
  // holographic is a pastel rainbow instead of a horizon
  holo: [[0, '#ffb3e6'], [0.2, '#c9b3ff'], [0.4, '#a8e6ff'], [0.6, '#b3ffd9'], [0.8, '#fff3b3'], [1, '#ffc2b3']],
};
export function metalFace(kind) {
  const stops = METAL_STOPS[kind];
  const c = canvas(4, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return c;
}

/* ---------- reflection maps ----------
   An equirectangular sky over a ground plane: the cheap chrome look from
   every 90s 3D package. Gold is the same scene in yellows and browns. */
export function envMap(kind) {
  const c = canvas(512, 256);
  const ctx = c.getContext('2d');
  if (kind === 'holo') {
    // pastel hue bands running round the horizon, tilted a little
    for (let x = 0; x < 512; x += 2) {
      for (let y = 0; y < 256; y += 16) {
        ctx.fillStyle = `hsl(${((x / 512) * 1080 + (y / 256) * 140) % 360}, 95%, 72%)`;
        ctx.fillRect(x, y, 2, 16);
      }
    }
    return c;
  }
  const P = kind === 'gold'
    ? { sky: ['#3a1e00', '#e0a020', '#fff6c4'], ground: ['#fff1a0', '#8a5000', '#1c0e00'] }
    : { sky: ['#050c2a', '#3a7ad8', '#e8f4ff'], ground: ['#ffffff', '#5a3a1e', '#0e0602'] };
  let g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, P.sky[0]); g.addColorStop(0.75, P.sky[1]); g.addColorStop(1, P.sky[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 128);
  g = ctx.createLinearGradient(0, 128, 0, 256);
  g.addColorStop(0, P.ground[0]); g.addColorStop(0.12, P.ground[1]); g.addColorStop(1, P.ground[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 128, 512, 128);
  // a few soft "studio windows" so spinning letters catch a glint
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const x of [60, 300]) ctx.fillRect(x, 70, 50, 26);
  return c;
}

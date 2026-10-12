// Backdrops for the text, drawn at the output size. Each has a still `base`,
// drawn once per settings change, and the ones that move add a `frame`,
// drawn over it every frame. All the movement is periodic in t (0..1 over
// the loop), so frame N would be frame 0 again and the GIF loops cleanly.
import { canvas, mulberry32, periodicNoise, clamp, mixRgb, clouds as cloudTile } from './textures.js';

const TAU = Math.PI * 2;

function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, col] of stops) g.addColorStop(at, col);
  return g;
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function stars(ctx, rand, w, maxY, count) {
  for (let i = 0; i < count; i++) {
    const b = 110 + Math.floor(rand() * 145);
    ctx.fillStyle = `rgb(${b},${b},${Math.min(255, b + 20)})`;
    const s = rand() < 0.07 ? 2 : 1;
    ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * maxY), s, s);
  }
}

// four-point sparkles that brighten and fade; speed is a whole number of
// cycles per loop
function twinklers(rand, n, w, maxY, s) {
  return Array.from({ length: n }, () => ({
    x: Math.round(rand() * w), y: Math.round(rand() * maxY),
    r: Math.max(2, Math.round(s * (0.008 + rand() * 0.012))), phase: rand(), speed: rand() < 0.5 ? 1 : 2,
  }));
}
function drawTwinkle(ctx, list, t) {
  for (const p of list) {
    const a = 0.5 + 0.5 * Math.sin(TAU * (t * p.speed + p.phase));
    ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(p.x - p.r, p.y, p.r * 2 + 1, 1);
    ctx.fillRect(p.x, p.y - p.r, 1, p.r * 2 + 1);
    ctx.globalAlpha = Math.min(1, a * 1.4);
    ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }
  ctx.globalAlpha = 1;
}

// a soft cloud: overlapping circles that fade at the edge
function puffClump(ctx, rand, cx, cy, size) {
  for (let k = 0; k < 7; k++) {
    const x = cx + (rand() - 0.5) * size * 1.4, y = cy + (rand() - 0.5) * size * 0.3, r = size * (0.25 + rand() * 0.22);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    circle(ctx, x, y, r);
  }
}

// a smooth line of hills: y(x) = y0 - amp * (a sum of sines)
function ridge(rand, w, y0, amp) {
  const p = [rand() * TAU, rand() * TAU, rand() * TAU];
  return (x) => y0 - amp * (0.55 + 0.25 * Math.sin((x / w) * TAU * 1.3 + p[0]) +
    0.15 * Math.sin((x / w) * TAU * 3.1 + p[1]) + 0.05 * Math.sin((x / w) * TAU * 9 + p[2]));
}
function fillRidge(ctx, fn, w, yBase, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, yBase);
  for (let x = 0; x <= w + 4; x += 4) ctx.lineTo(x, fn(x));
  ctx.lineTo(w, yBase);
  ctx.closePath();
  ctx.fill();
}

// a broken column of light on water under a moon or sun: short dashes that
// widen towards the viewer and slide about
function glitterPath(ctx, cx, top, bottom, r, t, dashes, rgb) {
  const N = dashes.length;
  for (let k = 0; k < N; k++) {
    const p = k / (N - 1);
    const y = top + 2 + (bottom - top - 2) * Math.pow(p, 1.5);
    const half = r * (0.3 + 1.4 * p);
    const a = (0.75 - 0.45 * p) * (0.55 + 0.45 * Math.sin(TAU * 2 * t + k * 1.9));
    const len = half * (0.4 + dashes[k] * 1.2);
    const x = cx + Math.sin(TAU * t + k * 1.3) * half * 0.35 - len / 2;
    ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(len), p > 0.5 ? 2 : 1);
  }
}

// lines that roll towards the viewer, one spacing per loop
function ripples(ctx, w, top, bottom, t, rgb, n = 8) {
  for (let k = 0; k < n; k++) {
    const p = (k + t) / n;
    const y = top + (bottom - top) * p * p;
    ctx.fillStyle = `rgba(${rgb},${(0.05 + 0.1 * p).toFixed(3)})`;
    ctx.fillRect(0, Math.round(y), w, 1);
  }
}

function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  ctx.fill();
}

const FIRE_RAMP = [[0, 0, 0], [90, 0, 0], [200, 20, 0], [255, 110, 0], [255, 200, 30], [255, 248, 200]];

/* Each entry: label; prepare(w, h, o) returns shared state; base(ctx, w, h,
   o, st) draws the still layer; frame(ctx, w, h, t, f, o, st) draws the
   moving layer. o = { color, img }. */
export const BACKGROUNDS = {
  transparent: { label: 'See-through' },

  color: {
    label: 'Solid colour',
    base(ctx, w, h, o) { ctx.fillStyle = o.color; ctx.fillRect(0, 0, w, h); },
  },

  moonlake: {
    label: 'Moon over the lake',
    prepare(w, h) {
      const rand = mulberry32(7);
      const s = Math.min(w, h), hz = Math.round(h * 0.64);
      return {
        s, hz, moon: { x: w * 0.74, y: h * 0.24, r: s * 0.12 },
        tw: twinklers(rand, Math.round(w / 45), w, hz * 0.8, s),
        dashes: Array.from({ length: 28 }, () => rand()),
      };
    },
    base(ctx, w, h, o, { hz, moon }) {
      const rand = mulberry32(8);
      ctx.fillStyle = vgrad(ctx, 0, hz, [[0, '#01031a'], [0.6, '#0a1650'], [1, '#2c4088']]);
      ctx.fillRect(0, 0, w, hz);
      stars(ctx, rand, w, hz * 0.92, (w * hz) / 600);
      let g = ctx.createRadialGradient(moon.x, moon.y, moon.r * 0.9, moon.x, moon.y, moon.r * 3.6);
      g.addColorStop(0, 'rgba(255,248,215,0.4)');
      g.addColorStop(1, 'rgba(255,248,215,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, hz);
      g = ctx.createRadialGradient(moon.x - moon.r * 0.35, moon.y - moon.r * 0.35, moon.r * 0.1, moon.x, moon.y, moon.r);
      g.addColorStop(0, '#fffff4');
      g.addColorStop(1, '#e6dcb8');
      ctx.fillStyle = g;
      circle(ctx, moon.x, moon.y, moon.r);
      // faint, scattered craters (bigger ones in a row read as a face)
      ctx.fillStyle = 'rgba(140,130,100,0.11)';
      for (let i = 0; i < 11; i++) {
        const a = rand() * TAU, d = Math.sqrt(rand()) * moon.r * 0.75;
        circle(ctx, moon.x + Math.cos(a) * d, moon.y + Math.sin(a) * d, moon.r * (0.04 + rand() * 0.08));
      }
      ctx.fillStyle = vgrad(ctx, hz, h, [[0, '#13225a'], [1, '#01030c']]);
      ctx.fillRect(0, hz, w, h - hz);
      const hills = ridge(mulberry32(9), w, hz, h * 0.07);
      ctx.globalAlpha = 0.55;
      fillRidge(ctx, (x) => hz + (hz - hills(x)) * 0.7, w, hz, '#040716');
      ctx.globalAlpha = 1;
      fillRidge(ctx, hills, w, hz, '#060a22');
      ctx.fillStyle = '#03050f';
      for (let x = 0; x < w * 0.4; x += 4 + rand() * 5) {
        const th = h * (0.03 + rand() * 0.05), by = hills(x) + 1;
        ctx.beginPath(); ctx.moveTo(x - th * 0.28, by); ctx.lineTo(x, by - th); ctx.lineTo(x + th * 0.28, by); ctx.fill();
      }
      ctx.fillStyle = 'rgba(150,170,255,0.25)';
      ctx.fillRect(0, hz, w, 1);
    },
    frame(ctx, w, h, t, f, o, st) {
      ripples(ctx, w, st.hz, h, t, '120,150,255');
      glitterPath(ctx, st.moon.x, st.hz, h, st.moon.r, t, st.dashes, '255,248,210');
      drawTwinkle(ctx, st.tw, t);
    },
  },

  tropical: {
    label: 'Tropical sunset',
    prepare(w, h) {
      const rand = mulberry32(17);
      const s = Math.min(w, h), hz = Math.round(h * 0.66);
      return { s, hz, sun: { x: w * 0.62, y: hz, r: s * 0.2 }, dashes: Array.from({ length: 24 }, () => rand()) };
    },
    base(ctx, w, h, o, { s, hz, sun }) {
      const rand = mulberry32(18);
      ctx.fillStyle = vgrad(ctx, 0, hz, [[0, '#2a0a4a'], [0.45, '#a8326e'], [0.8, '#ff7a3c'], [1, '#ffd36a']]);
      ctx.fillRect(0, 0, w, hz);
      const g = ctx.createRadialGradient(sun.x, sun.y, sun.r, sun.x, sun.y, sun.r * 2.6);
      g.addColorStop(0, 'rgba(255,220,120,0.45)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, hz);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, hz); ctx.clip();
      ctx.fillStyle = vgrad(ctx, sun.y - sun.r, sun.y, [[0, '#fff6b0'], [1, '#ff8a3c']]);
      circle(ctx, sun.x, sun.y, sun.r);
      ctx.restore();
      ctx.fillStyle = vgrad(ctx, hz, h, [[0, '#7a2a6a'], [0.3, '#4a1a5a'], [1, '#12041c']]);
      ctx.fillRect(0, hz, w, h - hz);
      // island and palm tree, in silhouette
      const ink = '#140414';
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.ellipse(w * 0.13, h * 1.03, w * 0.2, h * 0.13, 0, 0, TAU); ctx.fill();
      const x0 = w * 0.13, y0 = h * 0.94, cx = w * 0.09, cy = h * 0.6, x1 = w * 0.19, y1 = h * 0.3;
      for (let i = 0; i <= 30; i++) {
        const u = i / 30, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
        circle(ctx, a * x0 + b * cx + c * x1, a * y0 + b * cy + c * y1, s * (0.022 - u * 0.01));
      }
      for (const ang of [-2.9, -2.4, -1.85, -1.2, -0.55, 0.05, 0.6]) {
        const L = s * 0.24 * (0.8 + rand() * 0.3);
        const ex = x1 + Math.cos(ang) * L, ey = y1 + Math.sin(ang) * L * 0.55 + L * 0.38;
        const mx = x1 + Math.cos(ang) * L * 0.6, my = y1 + Math.sin(ang) * L * 0.6 - L * 0.12;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my - L * 0.09, ex, ey);
        ctx.quadraticCurveTo(mx, my + L * 0.09, x1, y1);
        ctx.fill();
      }
      ctx.strokeStyle = '#2a0a2a';
      ctx.lineWidth = Math.max(1, s * 0.006);
      for (const [bx, by, k] of [[0.4, 0.2, 1], [0.46, 0.15, 0.8], [0.52, 0.22, 0.7]]) {
        const x = w * bx, y = h * by, q = s * 0.025 * k;
        ctx.beginPath();
        ctx.moveTo(x - q, y - q * 0.5);
        ctx.quadraticCurveTo(x - q * 0.5, y - q * 0.7, x, y);
        ctx.quadraticCurveTo(x + q * 0.5, y - q * 0.7, x + q, y - q * 0.5);
        ctx.stroke();
      }
    },
    frame(ctx, w, h, t, f, o, st) {
      ripples(ctx, w, st.hz, h, t, '255,170,120');
      glitterPath(ctx, st.sun.x, st.hz, h, st.sun.r * 0.7, t, st.dashes, '255,220,140');
    },
  },

  space: {
    label: 'Outer space',
    prepare(w, h) {
      const rand = mulberry32(27);
      const s = Math.min(w, h);
      return { s, tw: twinklers(rand, Math.round(w / 35), w, h, s), planet: { x: w * 0.82, y: h * 0.72, r: s * 0.2 } };
    },
    base(ctx, w, h, o, { s, planet }) {
      const rand = mulberry32(28);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const cols = ['106,26,154', '26,74,170', '194,38,106', '20,140,160'];
      for (let i = 0; i < 7; i++) {
        const x = rand() * w, y = rand() * h, r = (0.25 + rand() * 0.4) * w;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${cols[i % 4]},0.3)`);
        g.addColorStop(1, `rgba(${cols[i % 4]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
      stars(ctx, rand, w, h, (w * h) / 300);
      // ringed planet: back half of the ring, the planet, then the front half
      const { x, y, r } = planet;
      const ring = (from, to) => {
        ctx.save();
        ctx.translate(x, y); ctx.rotate(-0.35);
        ctx.strokeStyle = 'rgba(230,205,160,0.8)';
        ctx.lineWidth = r * 0.13;
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.9, r * 0.42, 0, from, to); ctx.stroke();
        ctx.restore();
      };
      ring(Math.PI, TAU);
      ctx.fillStyle = vgrad(ctx, y - r, y + r, [[0, '#c88a4a'], [0.25, '#e8c08a'], [0.45, '#a8642e'], [0.65, '#f0d0a0'], [1, '#b87a40']]);
      circle(ctx, x, y, r);
      const sh = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.2, x, y, r);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.65)');
      ctx.fillStyle = sh;
      circle(ctx, x, y, r);
      ring(0, Math.PI);
      ctx.fillStyle = vgrad(ctx, h * 0.18, h * 0.26, [[0, '#e8e8f0'], [1, '#7a7a8a']]);
      circle(ctx, w * 0.16, h * 0.22, s * 0.04);
    },
    frame(ctx, w, h, t, f, o, st) {
      drawTwinkle(ctx, st.tw, t);
      // one shooting star per loop
      const p = (t - 0.15) / 0.25;
      if (p >= 0 && p <= 1) {
        const hx = w * (0.1 + 0.5 * p), hy = h * (0.08 + 0.25 * p);
        const g = ctx.createLinearGradient(hx, hy, hx - w * 0.1, hy - h * 0.05);
        g.addColorStop(0, `rgba(255,255,255,${(1 - p * 0.6).toFixed(2)})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - w * 0.1, hy - h * 0.05); ctx.stroke();
      }
    },
  },

  synthwave: {
    label: 'Retro grid',
    prepare(w, h) { return { s: Math.min(w, h), hz: Math.round(h * 0.6) }; },
    base(ctx, w, h, o, { s, hz }) {
      const rand = mulberry32(37);
      const sky = vgrad(ctx, 0, hz, [[0, '#0d0221'], [0.55, '#3b0a5c'], [1, '#ff3e9a']]);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hz);
      stars(ctx, rand, w, hz * 0.5, (w * hz) / 1500);
      const r = s * 0.32, cx = w / 2, cy = hz - r * 0.25;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, hz); ctx.clip();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
      ctx.fillStyle = vgrad(ctx, cy - r, cy + r, [[0, '#ffe66a'], [1, '#ff3e9a']]);
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.fillStyle = sky;
      for (let i = 0; i < 7; i++) ctx.fillRect(cx - r, cy + r * (0.05 + i * 0.13), r * 2, 2 + i * 1.6);
      ctx.restore();
      const peaks = ridge(mulberry32(38), w, hz, h * 0.09);
      fillRidge(ctx, peaks, w, hz + 1, '#1a0630');
      ctx.fillStyle = vgrad(ctx, hz, h, [[0, '#1a0035'], [1, '#2a0048']]);
      ctx.fillRect(0, hz, w, h - hz);
    },
    frame(ctx, w, h, t, f, o, { hz }) {
      ctx.save();
      ctx.strokeStyle = '#ff2bd6';
      ctx.shadowColor = '#ff2bd6';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = -16; i <= 16; i++) {
        ctx.moveTo(w / 2 + i * w * 0.02, hz);
        ctx.lineTo(w / 2 + i * w * 0.16, h);
      }
      ctx.stroke();
      for (let k = 0; k < 12; k++) {
        const p = (k + t) / 12;
        const y = hz + (h - hz) * p * p;
        ctx.globalAlpha = 0.25 + 0.75 * p;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,120,220,0.7)';
      ctx.fillRect(0, hz, w, 1);
    },
  },

  underwater: {
    label: 'Under the sea',
    prepare(w, h) {
      const rand = mulberry32(47);
      const s = Math.min(w, h);
      return {
        s,
        bubbles: Array.from({ length: 22 }, () => ({ x: rand() * w, r: 2 + rand() * 4 * (s / 300), k: rand() < 0.4 ? 2 : 1, p0: rand(), ph: rand() * TAU })),
        weeds: Array.from({ length: 7 }, (_, i) => ({ x: w * (0.05 + i * 0.15 + rand() * 0.06), hgt: h * (0.18 + rand() * 0.22), segs: 8, ph: rand() * TAU, col: rand() < 0.5 ? '#1a7a3a' : '#2a9a4a' })),
        fish: [{ y: h * 0.35, size: s * 0.05, dir: 1, off: 0, col: '#ff8a1a' }, { y: h * 0.62, size: s * 0.035, dir: -1, off: 0.45, col: '#ffd21a' }],
      };
    },
    base(ctx, w, h) {
      const rand = mulberry32(48);
      ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#1a8ad0'], [0.5, '#0a4a86'], [1, '#03203f']]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = vgrad(ctx, h * 0.85, h, [[0, '#d8b878'], [1, '#9a7a48']]);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 4; x += 4) ctx.lineTo(x, h * 0.88 + Math.sin((x / w) * TAU * 2) * h * 0.015);
      ctx.lineTo(w, h);
      ctx.fill();
      ctx.fillStyle = 'rgba(90,70,40,0.5)';
      for (let i = 0; i < w / 25; i++) {
        ctx.beginPath(); ctx.ellipse(rand() * w, h * (0.92 + rand() * 0.07), 3 + rand() * 4, 2 + rand() * 2, 0, 0, TAU); ctx.fill();
      }
    },
    frame(ctx, w, h, t, f, o, { s, bubbles, weeds, fish }) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(160,220,255,0.07)';
      for (let i = 0; i < 5; i++) {
        const x = w * (0.1 + i * 0.2) + Math.sin(TAU * t + i) * w * 0.03, sway = Math.sin(TAU * t + i * 2) * w * 0.04;
        ctx.beginPath();
        ctx.moveTo(x - w * 0.02, 0); ctx.lineTo(x + w * 0.03, 0);
        ctx.lineTo(x + w * 0.12 + sway, h); ctx.lineTo(x - w * 0.06 + sway, h);
        ctx.fill();
      }
      ctx.restore();
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(3, s * 0.02);
      for (const wd of weeds) {
        ctx.strokeStyle = wd.col;
        ctx.beginPath();
        ctx.moveTo(wd.x, h * 0.9);
        for (let j = 1; j <= wd.segs; j++) {
          ctx.lineTo(wd.x + Math.sin(TAU * t + j * 0.5 + wd.ph) * s * 0.012 * j, h * 0.9 - j * (wd.hgt / wd.segs));
        }
        ctx.stroke();
      }
      for (const fi of fish) {
        let x = ((t + fi.off) % 1) * (w + fi.size * 6) - fi.size * 3;
        if (fi.dir < 0) x = w - x;
        const z = fi.size, d = fi.dir;
        ctx.fillStyle = fi.col;
        ctx.beginPath(); ctx.ellipse(x, fi.y, z, z * 0.55, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - d * z * 0.8, fi.y); ctx.lineTo(x - d * z * 1.6, fi.y - z * 0.5); ctx.lineTo(x - d * z * 1.6, fi.y + z * 0.5); ctx.fill();
        ctx.fillStyle = '#111';
        circle(ctx, x + d * z * 0.5, fi.y - z * 0.12, Math.max(1, z * 0.1));
      }
      ctx.lineWidth = 1;
      for (const b of bubbles) {
        const y = h * 0.9 - ((b.p0 + t * b.k) % 1) * (h * 0.95);
        const x = b.x + Math.sin(TAU * t * b.k + b.ph) * 3;
        ctx.strokeStyle = 'rgba(220,240,255,0.75)';
        ctx.beginPath(); ctx.arc(x, y, b.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(Math.round(x - b.r * 0.4), Math.round(y - b.r * 0.4), 1, 1);
      }
    },
  },

  firewall: {
    label: 'Wall of fire',
    prepare(w, h) {
      const lw = 120, lh = Math.max(8, Math.round((120 * h) / w));
      const small = canvas(lw, lh);
      return { small, img: small.getContext('2d').createImageData(lw, lh), noise: periodicNoise(21, 4) };
    },
    base(ctx, w, h) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); },
    frame(ctx, w, h, t, f, o, { small, img, noise }) {
      const { width: lw, height: lh, data } = img;
      for (let y = 0; y < lh; y++) {
        for (let x = 0; x < lw; x++) {
          const n = noise(x / lw, (y / lh) * 0.6 + t);
          const heat = clamp((y / lh) * 1.35 - 0.35 + (n - 0.5) * 1.1, 0, 0.999);
          const q = heat * (FIRE_RAMP.length - 1), i = Math.floor(q);
          const c = mixRgb(FIRE_RAMP[i], FIRE_RAMP[i + 1], q - i);
          const at = (y * lw + x) * 4;
          data[at] = c[0]; data[at + 1] = c[1]; data[at + 2] = c[2]; data[at + 3] = 255;
        }
      }
      small.getContext('2d').putImageData(img, 0, 0);
      ctx.drawImage(small, 0, 0, w, h);
    },
  },

  rainbow: {
    label: 'Rainbow',
    base(ctx, w, h) {
      const rand = mulberry32(57);
      ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#3a8cf0'], [1, '#bfe4ff']]);
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2, cy = h * 1.1, R = Math.max(w * 0.48, h * 0.95), band = R * 0.055;
      const cols = ['#ff2a2a', '#ff8c1a', '#ffe21a', '#3ad03a', '#2a8aff', '#4a3aff', '#a03aff'];
      ctx.globalAlpha = 0.85;
      cols.forEach((c, i) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = band + 1;
        ctx.beginPath(); ctx.arc(cx, cy, R - band * (i + 0.5), Math.PI, TAU); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      const s = Math.min(w, h);
      puffClump(ctx, rand, cx - R + band * 3, h * 0.9, s * 0.3);
      puffClump(ctx, rand, cx + R - band * 3, h * 0.9, s * 0.3);
      puffClump(ctx, rand, w * 0.25, h * 0.18, s * 0.2);
      puffClump(ctx, rand, w * 0.8, h * 0.12, s * 0.16);
      ctx.fillStyle = vgrad(ctx, h * 0.82, h, [[0, '#6ad04a'], [1, '#2a8a1e']]);
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 1.25, w * 0.9, h * 0.45, 0, 0, TAU); ctx.fill();
    },
  },

  hills: {
    label: 'Rolling hills',
    prepare(w, h) {
      const rand = mulberry32(67);
      const layer = canvas(w, h);
      const lc = layer.getContext('2d');
      const s = Math.min(w, h);
      for (let i = 0; i < 6; i++) puffClump(lc, rand, (i / 6 + rand() * 0.08) * w, h * (0.1 + rand() * 0.22), s * (0.14 + rand() * 0.12));
      return { layer };
    },
    base(ctx, w, h) {
      ctx.fillStyle = vgrad(ctx, 0, h * 0.75, [[0, '#1f5fd8'], [1, '#9cc8ff']]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3f9a2a';
      ctx.beginPath(); ctx.ellipse(w * 0.85, h * 1.05, w * 0.7, h * 0.42, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = vgrad(ctx, h * 0.5, h, [[0, '#7ad24a'], [1, '#2f8a1e']]);
      ctx.beginPath();
      ctx.moveTo(0, h * 0.74);
      ctx.quadraticCurveTo(w * 0.42, h * 0.48, w, h * 0.8);
      ctx.lineTo(w, h); ctx.lineTo(0, h);
      ctx.fill();
    },
    // the clouds drift one screen width per loop
    frame(ctx, w, h, t, f, o, { layer }) {
      const x = Math.round(-t * w);
      ctx.drawImage(layer, x, 0);
      ctx.drawImage(layer, x + w, 0);
    },
  },

  aurora: {
    label: 'Northern lights',
    prepare(w, h) {
      const rand = mulberry32(77);
      const bandH = Math.round(h * 0.38);
      const strip = canvas(1, bandH);
      const sc = strip.getContext('2d');
      sc.fillStyle = vgrad(sc, 0, bandH, [[0, 'rgba(140,80,255,0)'], [0.35, 'rgba(140,80,255,0.25)'], [0.8, 'rgba(60,255,170,0.5)'], [1, 'rgba(60,255,170,0)']]);
      sc.fillRect(0, 0, 1, bandH);
      const mountains = canvas(w, h);
      const mc = mountains.getContext('2d');
      const pts = [];
      for (let i = 0; i <= 9; i++) pts.push([(i / 9) * w, h * (0.58 + rand() * 0.16)]);
      mc.fillStyle = vgrad(mc, h * 0.55, h * 0.85, [[0, '#d8e8f4'], [0.5, '#6a86a0'], [1, '#1a2a3a']]);
      mc.beginPath(); mc.moveTo(0, h);
      for (const [x, y] of pts) mc.lineTo(x, y);
      mc.lineTo(w, h); mc.fill();
      const front = ridge(rand, w, h * 0.9, h * 0.08);
      fillRidge(mc, front, w, h, '#050c16');
      mc.fillStyle = '#03070d';
      for (let x = 0; x < w; x += 5 + rand() * 8) {
        const th = h * (0.04 + rand() * 0.06), by = front(x) + 2;
        mc.beginPath(); mc.moveTo(x - th * 0.25, by); mc.lineTo(x, by - th); mc.lineTo(x + th * 0.25, by); mc.fill();
      }
      return { strip, bandH, mountains };
    },
    base(ctx, w, h) {
      ctx.fillStyle = vgrad(ctx, 0, h * 0.8, [[0, '#020612'], [1, '#08223a']]);
      ctx.fillRect(0, 0, w, h);
      stars(ctx, mulberry32(78), w, h * 0.7, (w * h) / 700);
    },
    frame(ctx, w, h, t, f, o, { strip, bandH, mountains }) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let x = 0; x < w; x += 2) {
        const u = x / w;
        const c = h * 0.3 + Math.sin(u * TAU * 1.2 + TAU * t) * h * 0.07 + Math.sin(u * TAU * 3.3 - TAU * t * 2) * h * 0.03;
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(u * TAU * 2.1 + TAU * t);
        ctx.drawImage(strip, x, c - bandH * 0.6, 2, bandH);
      }
      ctx.restore();
      ctx.drawImage(mountains, 0, 0);
    },
  },

  hearts: {
    label: 'Hearts',
    prepare(w, h) {
      const rand = mulberry32(87);
      const s = Math.min(w, h);
      const cols = ['#ff1a5a', '#ffffff', '#ff6ab0', '#d4004a'];
      return {
        list: Array.from({ length: 26 }, () => ({
          x: rand() * w, s: s * (0.03 + rand() * 0.05), k: rand() < 0.35 ? 2 : 1, p0: rand(), ph: rand() * TAU,
          col: cols[Math.floor(rand() * cols.length)], a: 0.5 + rand() * 0.5,
        })),
      };
    },
    base(ctx, w, h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, '#ffc2e2');
      g.addColorStop(1, '#ff5aa8');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
    frame(ctx, w, h, t, f, o, { list }) {
      for (const p of list) {
        const y = h + p.s - ((p.p0 + t * p.k) % 1) * (h + 2 * p.s);
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.col;
        heart(ctx, p.x + Math.sin(TAU * t * p.k + p.ph) * p.s * 0.6, y, p.s);
      }
      ctx.globalAlpha = 1;
    },
  },

  disco: {
    label: 'Disco lights',
    prepare(w, h) { return { s: Math.min(w, h) }; },
    base(ctx, w, h) {
      ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#120024'], [1, '#05000c']]);
      ctx.fillRect(0, 0, w, h);
    },
    frame(ctx, w, h, t, f, o, { s }) {
      const pal = ['#ff2a6a', '#2affd4', '#ffe21a', '#7a2aff', '#2a8aff', '#ff8a1a'];
      // dance floor: the colours step round one full cycle per loop
      const step = Math.floor(t * pal.length);
      const rows = 4, cols = 12, top = h * 0.72, rowH = (h - top) / rows;
      for (let r = 0; r < rows; r++) {
        const spread = 1 + r * 0.25, tw = (w / cols) * spread;
        for (let i = -2; i < cols + 2; i++) {
          const x = w / 2 + (i - cols / 2) * tw;
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = pal[(i + r * 2 + step + 60) % pal.length];
          ctx.fillRect(Math.round(x + 1), Math.round(top + r * rowH + 1), Math.round(tw - 2), Math.round(rowH - 2));
        }
      }
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const ox = w * (0.1 + i * 0.2), oy = -h * 0.05;
        const ang = Math.PI / 2 + 0.55 * Math.sin(TAU * t + i * 1.4), len = h * 1.4, sp = 0.12;
        const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, len);
        g.addColorStop(0, pal[i] + '88');
        g.addColorStop(1, pal[i] + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(ang - sp) * len, oy + Math.sin(ang - sp) * len);
        ctx.lineTo(ox + Math.cos(ang + sp) * len, oy + Math.sin(ang + sp) * len);
        ctx.fill();
      }
      ctx.restore();
      // the mirror ball
      const bx = w / 2, by = h * 0.09, br = s * 0.07;
      ctx.fillStyle = '#9a9aa8';
      circle(ctx, bx, by, br);
      const rand = mulberry32(Math.floor(t * 12) + 1);
      for (let k = 0; k < 14; k++) {
        const a = rand() * TAU, d = rand() * br * 0.85;
        ctx.fillStyle = rand() < 0.3 ? '#ffffff' : '#c8c8d4';
        ctx.fillRect(Math.round(bx + Math.cos(a) * d - 1), Math.round(by + Math.sin(a) * d - 1), 3, 3);
      }
    },
  },

  spiral: {
    label: 'Hypno spiral',
    base(ctx, w, h, o) { ctx.fillStyle = o.color; ctx.fillRect(0, 0, w, h); },
    // 12 arms in two colours repeat every 60 degrees; turning 120 degrees a
    // loop brings it back exactly where it started
    frame(ctx, w, h, t, f, o) {
      const arms = 12, R = Math.hypot(w, h) * 0.55, rot = (TAU * t) / 3, steps = 40;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(o.color.substr(i, 2), 16));
      ctx.fillStyle = r * 0.3 + g * 0.59 + b * 0.11 > 140 ? '#000000' : '#ffffff';
      for (let a = 0; a < arms; a += 2) {
        const t0 = (a * TAU) / arms + rot, t1 = t0 + TAU / arms;
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2);
        for (let j = 1; j <= steps; j++) {
          const rr = (R * j) / steps, tw = (rr / R) * TAU * 1.25;
          ctx.lineTo(w / 2 + Math.cos(t0 + tw) * rr, h / 2 + Math.sin(t0 + tw) * rr);
        }
        for (let j = steps; j >= 1; j--) {
          const rr = (R * j) / steps, tw = (rr / R) * TAU * 1.25;
          ctx.lineTo(w / 2 + Math.cos(t1 + tw) * rr, h / 2 + Math.sin(t1 + tw) * rr);
        }
        ctx.fill();
      }
    },
  },

  tvstatic: {
    label: 'TV static',
    prepare(w, h) {
      const lw = Math.max(8, Math.round(w / 3)), lh = Math.max(8, Math.round(h / 3));
      const small = canvas(lw, lh);
      return { small, img: small.getContext('2d').createImageData(lw, lh) };
    },
    base(ctx, w, h) { ctx.fillStyle = '#777'; ctx.fillRect(0, 0, w, h); },
    // fresh noise every frame, and a brighter band rolling down twice a loop
    frame(ctx, w, h, t, f, o, { small, img }) {
      const { width: lw, height: lh, data } = img;
      const rand = mulberry32(f * 7919 + 3);
      const band = ((t * 2) % 1) * lh;
      for (let y = 0; y < lh; y++) {
        const lift = Math.abs(y - band) < lh * 0.08 ? 45 : 0;
        for (let x = 0; x < lw; x++) {
          const v = Math.min(255, rand() * 230 + lift);
          const at = (y * lw + x) * 4;
          data[at] = data[at + 1] = data[at + 2] = v; data[at + 3] = 255;
        }
      }
      small.getContext('2d').putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, w, h);
      ctx.imageSmoothingEnabled = true;
    },
  },

  stars: {
    label: 'Starfield',
    base(ctx, w, h) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      stars(ctx, mulberry32(1234), w, h, (w * h) / 450);
    },
  },

  geocities: {
    label: 'GeoCities stars',
    base(ctx, w, h) {
      const tile = canvas(48, 48);
      const t = tile.getContext('2d');
      t.fillStyle = '#000046'; t.fillRect(0, 0, 48, 48);
      const star = (x, y, col, r) => {
        t.fillStyle = col;
        t.fillRect(x - r, y, r * 2 + 1, 1);
        t.fillRect(x, y - r, 1, r * 2 + 1);
      };
      star(10, 12, '#ffff66', 3); star(34, 30, '#ffffff', 2); star(22, 42, '#66ffff', 1); star(42, 6, '#ffffff', 1);
      ctx.fillStyle = ctx.createPattern(tile, 'repeat');
      ctx.fillRect(0, 0, w, h);
    },
  },

  clouds: {
    label: 'Clouds',
    base(ctx, w, h) {
      ctx.fillStyle = ctx.createPattern(cloudTile(99), 'repeat');
      ctx.fillRect(0, 0, w, h);
    },
  },

  sunset: {
    label: 'Vaporwave sun',
    base(ctx, w, h) {
      ctx.fillStyle = vgrad(ctx, 0, h, [[0, '#1b0a3c'], [0.55, '#c2268a'], [1, '#ff9a3c']]);
      ctx.fillRect(0, 0, w, h);
      const r = Math.min(w, h) * 0.32;
      ctx.save();
      ctx.beginPath(); ctx.arc(w / 2, h * 0.78, r, 0, TAU); ctx.clip();
      ctx.fillStyle = vgrad(ctx, h * 0.78 - r, h * 0.78 + r, [[0, '#ffe76a'], [1, '#ff4f6a']]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c2268a';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, h * 0.78 + i * r * 0.16, w, 2 + i * 1.5);
      ctx.restore();
    },
  },

  checker: {
    label: 'Checkerboard',
    base(ctx, w, h) {
      const s = Math.max(8, Math.round(w / 16));
      for (let y = 0; y < h; y += s) {
        for (let x = 0; x < w; x += s) {
          ctx.fillStyle = ((x + y) / s) % 2 ? '#000' : '#fff';
          ctx.fillRect(x, y, s, s);
        }
      }
    },
  },

  picture: {
    label: 'Your picture',
    base(ctx, w, h, o) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (!o.img) return;
      const s = Math.max(w / o.img.width, h / o.img.height);
      ctx.drawImage(o.img, (w - o.img.width * s) / 2, (h - o.img.height * s) / 2, o.img.width * s, o.img.height * s);
    },
  },
};

/* null for see-through; otherwise { base, frame } where frame(ctx, t, f)
   draws the moving part (or is null for a still backdrop). */
export function makeBackground(kind, w, h, o) {
  const B = BACKGROUNDS[kind];
  if (!B || !B.base && !B.frame) return null;
  const st = B.prepare ? B.prepare(w, h, o) : {};
  const base = canvas(w, h);
  if (B.base) B.base(base.getContext('2d'), w, h, o, st);
  return {
    base,
    frame: B.frame ? (ctx, t, f) => B.frame(ctx, w, h, t, f, o, st) : null,
  };
}

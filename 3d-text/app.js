// 3D text GIFs: real extruded letters in three.js, lit with old-fashioned
// Phong shading and loud coloured lights, the way Xara 3D did it, then
// encoded to GIF by gifski in a worker.
import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ====================== menus ====================== */

const FONTS = {
  times: 'Times-ish serif',
  'times-bold': 'Times-ish serif, bold',
  'archivo-black': 'Arial Black-ish (Archivo Black)',
  anton: 'Impact-ish (Anton)',
  'comic-neue': 'Comic (Comic Neue)',
  'luckiest-guy': 'Cartoon (Luckiest Guy)',
  pacifico: 'Script (Pacifico)',
  gothic: 'Gothic (Grenze Gotisch)',
};

// mapping: "stretch" spans each line once, "tile" repeats `per` times an em.
// scroll: the texture slides one full repeat per loop when "Animate the
// finish" is ticked. uses: which colour pickers matter.
const FINISHES = {
  plastic: { label: 'Shiny plastic', uses: 1 },
  chrome: { label: 'Chrome', env: 'chrome', mapping: 'stretch', uses: 0 },
  gold: { label: 'Gold', env: 'gold', mapping: 'stretch', uses: 0 },
  rainbow: { label: 'Rainbow', mapping: 'stretch', scroll: 'v', uses: 0, make: () => TX.rainbow() },
  gradient: { label: 'Two-colour fade', mapping: 'stretch', uses: 2, make: (s) => TX.gradient(s.color1, s.color2) },
  glitter: { label: 'Glitter', mapping: 'tile', per: 2.5, uses: 1, glitter: true },
  flames: { label: 'Flames', mapping: 'stretch', uses: 0, flames: true },
  marble: { label: 'Marble', mapping: 'tile', scroll: 'u', uses: 2, make: (s) => TX.marble(s.color1, s.color2, 5) },
  leopard: { label: 'Leopard', mapping: 'tile', per: 1.6, scroll: 'u', uses: 0, make: () => TX.leopard(3) },
  wood: { label: 'Wood', mapping: 'tile', scroll: 'u', uses: 0, make: () => TX.wood(8) },
  clouds: { label: 'Clouds', mapping: 'tile', scroll: 'u', uses: 0, make: () => TX.clouds(4) },
  camo: { label: 'Camo', mapping: 'tile', per: 1.3, scroll: 'u', uses: 0, make: () => TX.camo(6) },
  checker: { label: 'Checkerboard', mapping: 'tile', scroll: 'u', uses: 2, make: (s) => TX.checker(s.color1, s.color2) },
  picture: { label: 'Your picture', mapping: 'stretch', uses: 0, make: () => TX.picture(picture) },
};

// Directional lights as [colour, intensity, direction]. orbit: the lights
// circle round the text once per loop. EXPOSURE scales every rig: three's
// Phong divides by pi, and above about 1 in total the colours clip to pale.
const EXPOSURE = 0.78;
const LIGHTS = {
  studio: { label: 'Studio (white)', ambient: ['#ffffff', 0.55], lights: [['#ffffff', 3.4, [-1, 1.2, 2]], ['#ffffff', 1.3, [1.6, -0.2, 1]], ['#9fb4ff', 1.2, [0, -1, -1]]] },
  disco: { label: 'Disco (red, blue, green)', ambient: ['#ffffff', 0.3], lights: [['#ff1a2a', 4, [-1.6, 0.5, 1.2]], ['#2050ff', 4, [1.6, 0.4, 1.2]], ['#30ff50', 2.6, [0, 1.8, 0.5]]] },
  sunset: { label: 'Sunset (orange, pink)', ambient: ['#7a3aa0', 0.7], lights: [['#ffa030', 4, [-1.2, 1, 1.5]], ['#ff3fa0', 3, [1.5, -0.4, 1]]] },
  toxic: { label: 'Toxic (green, purple)', ambient: ['#203020', 0.6], lights: [['#8aff00', 4, [-1.4, 0.8, 1.3]], ['#b030ff', 3.4, [1.4, -0.3, 1.2]]] },
  ice: { label: 'Ice (cyan, white)', ambient: ['#a0d8ff', 0.6], lights: [['#ffffff', 3.4, [-1, 1.3, 1.6]], ['#30d0ff', 3, [1.5, -0.5, 1]]] },
  party: { label: 'Party (lights go round)', orbit: true, ambient: ['#ffffff', 0.3], lights: [['#ff2a9a', 4, [-1.5, 0, 1.2]], ['#20d0ff', 4, [1.5, 0, 1.2]], ['#ffe020', 3, [0, 1.6, 0.8]]] },
};

const ANIMS = {
  spin: 'Spin',
  'spin-stop': 'Spin, then stop',
  swing: 'Swing',
  rock: 'Rock (see-saw)',
  tumble: 'Tumble (head over heels)',
  wobble: 'Wobble',
  pulse: 'Pulse',
  'letters-spin': 'Letters spin',
  'letters-flip': 'Letters flip one by one',
  wave: 'Wave',
  bounce: 'Bounce',
  jelly: 'Jelly',
  'lines-opposite': 'Lines spin opposite ways',
  shake: 'Angry shake',
  none: 'None (still)',
};

const BEVELS = {
  none: { label: 'None' },
  round: { label: 'Rounded', size: 0.02, segments: 3 },
  chamfer: { label: 'Chiselled', size: 0.03, segments: 1 },
  fat: { label: 'Fat and round', size: 0.045, segments: 4 },
};

const BACKGROUNDS = {
  transparent: 'See-through',
  color: 'Solid colour',
  stars: 'Starfield',
  geocities: 'GeoCities stars',
  clouds: 'Clouds',
  sunset: 'Sunset',
  checker: 'Checkerboard',
  picture: 'Your picture',
};

const LOOKS = {
  chrome: { label: 'Spinning chrome', font: 'times', finish: 'chrome', sidesMatch: true, depth: 0.22, bevel: 'round', lights: 'studio', anim: 'spin', bg: 'transparent' },
  trophy: { label: 'Gold trophy', font: 'times-bold', finish: 'gold', sidesMatch: true, depth: 0.3, bevel: 'chamfer', lights: 'studio', anim: 'swing', bg: 'color', bgColor: '#000000' },
  fire: { label: 'Hot fire', font: 'anton', finish: 'flames', sidesMatch: false, sideColor: '#7a0c00', depth: 0.3, bevel: 'round', lights: 'studio', anim: 'letters-flip', bg: 'color', bgColor: '#000000' },
  glitter: { label: 'Glitter bomb', font: 'pacifico', finish: 'glitter', color1: '#ff3fb4', sidesMatch: false, sideColor: '#8a1060', depth: 0.18, bevel: 'round', lights: 'studio', anim: 'pulse', bg: 'transparent' },
  screensaver: { label: '1998 screensaver', font: 'archivo-black', finish: 'plastic', color1: '#2f6bff', sidesMatch: false, sideColor: '#10308a', depth: 0.35, bevel: 'chamfer', lights: 'studio', anim: 'wobble', bg: 'color', bgColor: '#000000' },
  wordart: { label: 'WordArt rainbow', font: 'archivo-black', finish: 'rainbow', sidesMatch: false, sideColor: '#555555', depth: 0.25, bevel: 'none', lights: 'studio', anim: 'wave', bg: 'color', bgColor: '#ffffff' },
  comic: { label: 'Comic relief', font: 'comic-neue', finish: 'plastic', color1: '#ffd400', sidesMatch: false, sideColor: '#e01010', depth: 0.3, bevel: 'round', lights: 'studio', anim: 'bounce', bg: 'transparent' },
  cartoon: { label: 'Saturday morning', font: 'luckiest-guy', finish: 'plastic', color1: '#ff8a00', sidesMatch: false, sideColor: '#6a1aa8', depth: 0.32, bevel: 'fat', lights: 'studio', anim: 'jelly', bg: 'clouds' },
  metal: { label: 'Heavy metal', font: 'gothic', finish: 'chrome', sidesMatch: true, depth: 0.2, bevel: 'chamfer', lights: 'sunset', anim: 'rock', bg: 'stars' },
  leopard: { label: 'Leopard lounge', font: 'anton', finish: 'leopard', sidesMatch: false, sideColor: '#2a1608', depth: 0.25, bevel: 'round', lights: 'studio', anim: 'letters-spin', bg: 'transparent' },
  angry: { label: 'Very angry', font: 'anton', finish: 'plastic', color1: '#ff1010', sidesMatch: false, sideColor: '#600000', depth: 0.3, bevel: 'chamfer', lights: 'studio', anim: 'shake', bg: 'color', bgColor: '#000000' },
  disco: { label: 'Disco', font: 'luckiest-guy', finish: 'plastic', color1: '#ffffff', sidesMatch: false, sideColor: '#bbbbbb', depth: 0.3, bevel: 'round', lights: 'party', anim: 'spin', bg: 'color', bgColor: '#000000' },
  geocities: { label: 'Welcome to my homepage', font: 'times-bold', finish: 'rainbow', sidesMatch: false, sideColor: '#202060', depth: 0.25, bevel: 'round', lights: 'studio', anim: 'spin-stop', bg: 'geocities' },
  marble: { label: 'Marble bust', font: 'times-bold', finish: 'marble', color1: '#f2efe8', color2: '#5a5a66', sidesMatch: true, depth: 0.3, bevel: 'chamfer', lights: 'studio', anim: 'tumble', bg: 'color', bgColor: '#1a1a1a' },
};

const LOOK_DEFAULTS = { color1: '#ff3fb4', color2: '#3f7bff', sideColor: '#333333', bgColor: '#000000', spacing: 0.02, chunky: false, jaggies: false, animTexture: true };

const PHRASES = [
  'lol nothing matters', 'sorry i was asleep', 'ok', 'no thoughts\nhead empty',
  'this could have\nbeen an email', 'big if true', 'who did this', 'happy birthday\nyou legend',
  'see you never', 'hell yeah', 'wow', 'cool cool cool', 'on my way\n(lying)',
  'legally i can\'t say', 'thank u', 'oops', 'per my last email', 'i\'m baby',
  'bon appétit', 'who is she', 'not now', 'yes chef', 'good morning\nto everyone\nexcept you',
];

/* ====================== state ====================== */

let S = null;            // current settings, read from the form
let picture = null;      // uploaded Image, used by the picture finish/background
let block = null;        // laid-out text: sizes plus the letter and line objects
let bgCanvas = null;     // background drawn at the output size, or null
let size = { w: 480, h: 240 };
let busy = false;        // an export is running
let dirty = true;
let buildToken = 0;
let buildPending = true; // settings changed and the text hasn't been rebuilt yet
let lastGif = null;      // { blob, url, name }

const display = $('screen');
const displayCtx = display.getContext('2d');

/* ====================== three.js scene ====================== */

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 2, 0.05, 200);
const root = new THREE.Group();
scene.add(root);
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const dirLights = [0, 1, 2].map(() => {
  const l = new THREE.DirectionalLight(0xffffff, 0);
  scene.add(l);
  return l;
});

let renderer = null;
function makeRenderer(antialias) {
  if (renderer) renderer.dispose();
  renderer = new THREE.WebGLRenderer({ antialias, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(size.w, size.h, false);
}

const faceMat = new THREE.MeshPhongMaterial();
const capMat = new THREE.MeshPhongMaterial();   // chrome/gold fronts only
const sideMat = new THREE.MeshPhongMaterial();
const faceMaterials = [faceMat, faceMat, sideMat];  // caps, bevel, sides
let faceTex = null;       // current map texture (owned, disposed on change)
let builtFinish = 'plastic';  // the finish the materials were last built for
let glitterTex = [];      // three alternating glitter maps
let flameCanvas = null;
const envMaps = {};

function envMap(kind) {
  if (!envMaps[kind]) {
    const t = new THREE.CanvasTexture(TX.envMap(kind));
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    envMaps[kind] = t;
  }
  return envMaps[kind];
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/* ====================== fonts and letter geometry ====================== */

const fontCache = new Map();
function loadFont(key) {
  if (!fontCache.has(key)) {
    fontCache.set(key, fetch(`fonts/${key}.json`)
      .then((r) => { if (!r.ok) throw new Error(`font ${key}: ${r.status}`); return r.json(); })
      .then((d) => new Font(d)));
  }
  return fontCache.get(key);
}

/* Extrude one glyph (1 unit = 1 em), then sort its triangles into three
   material groups the way Xara coloured them: 0 = front and back faces,
   1 = bevel, 2 = the straight sides. The bevel and sides get smoothed
   normals (creased at sharp corners); the faces keep flat ones so the
   lighting doesn't streak across them. Centred on its own middle so a
   letter can spin in place. */
const geoCache = new Map();
function glyphGeometry(font, ch) {
  const key = [S.font, ch, S.depth, S.bevel, S.chunky].join('|');
  if (geoCache.has(key)) return geoCache.get(key);
  if (geoCache.size > 800) {
    for (const g of geoCache.values()) if (g) g.geo.dispose();
    geoCache.clear();
  }
  const shapes = font.generateShapes(ch, 1);
  let out = null;
  if (shapes.length) {
    const bv = BEVELS[S.bevel];
    const src = new THREE.ExtrudeGeometry(shapes, {
      depth: S.depth,
      curveSegments: S.chunky ? 2 : 8,
      bevelEnabled: !!bv.size,
      bevelThickness: bv.size || 0,
      bevelSize: bv.size || 0,
      bevelOffset: bv.size ? -bv.size * 0.6 : 0,
      bevelSegments: bv.segments || 1,
    });
    out = sortAndSmooth(src);
    src.dispose();
  }
  geoCache.set(key, out);
  return out;
}

function sortAndSmooth(src) {
  const pos = src.attributes.position.array;
  const nor = src.attributes.normal.array;
  const eps = 1e-5, depth = S.depth;
  const caps = [], bevel = [], sides = [];
  for (const g of src.groups) {
    for (let v = g.start; v < g.start + g.count; v += 3) {
      if (g.materialIndex === 0) { caps.push(v); continue; }
      let wall = true;
      for (let k = 0; k < 3; k++) {
        const z = pos[(v + k) * 3 + 2];
        if (z < -eps || z > depth + eps) wall = false;
      }
      (wall ? sides : bevel).push(v);
    }
  }
  const copy = (list, from, to, at) => {
    for (const v of list) { to.set(from.subarray(v * 3, v * 3 + 9), at); at += 9; }
    return at;
  };
  const n = caps.length + bevel.length + sides.length;
  const P = new Float32Array(n * 9), N = new Float32Array(n * 9);
  copy(sides, pos, P, copy(bevel, pos, P, copy(caps, pos, P, 0)));
  copy(sides, nor, N, copy(bevel, nor, N, copy(caps, nor, N, 0)));

  if (!S.chunky && bevel.length + sides.length) {
    const capLen = caps.length * 9;
    const rim = new THREE.BufferGeometry();
    rim.setAttribute('position', new THREE.BufferAttribute(P.slice(capLen), 3));
    toCreasedNormals(rim, THREE.MathUtils.degToRad(38));
    N.set(rim.attributes.normal.array, capLen);
    rim.dispose();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const box = { minX: min.x, maxX: max.x, minY: min.y, maxY: max.y };
  const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2;
  const half = [(max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2];
  geo.translate(-cx, -cy, -cz);
  geo.computeBoundingSphere();
  geo.addGroup(0, caps.length * 3, 0);
  geo.addGroup(caps.length * 3, bevel.length * 3, 1);
  geo.addGroup((caps.length + bevel.length) * 3, sides.length * 3, 2);
  return { geo, cx, cy, half, ...box };
}

/* Each placed letter shares its glyph's positions and normals but gets its
   own UVs: planar on x/y, measured across the whole line (stretch) or in
   em units (tile), so textures run on from one letter to the next. */
function placedGeometry(glyph, ox, oy, map) {
  const p = glyph.geo.attributes.position.array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    uv[j] = (p[i] + glyph.cx + ox - map.x0) / map.sx;
    uv[j + 1] = (p[i + 1] + glyph.cy + oy - map.y0) / map.sy;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', glyph.geo.attributes.position);
  g.setAttribute('normal', glyph.geo.attributes.normal);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  for (const gr of glyph.geo.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingSphere = glyph.geo.boundingSphere;
  return g;
}

function textLines() {
  const lines = S.text.replace(/\r/g, '').split('\n').slice(0, 5);
  while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();
  return lines;
}

async function rebuild() {
  const token = ++buildToken;
  let font;
  try {
    font = await loadFont(S.font);
  } catch (err) {
    status(`Couldn't load the font (${err.message}).`);
    if (token === buildToken) buildPending = false;
    return;
  }
  if (token !== buildToken) return;

  if (block) for (const L of block.letters) L.mesh.geometry.dispose();
  root.clear();

  const data = font.data;
  const sc = 1 / data.resolution;
  const lineStep = (data.ascender - data.descender) * sc * 0.92;
  const F = FINISHES[S.finish];

  // lay out every line at its own baseline, measuring the ink as we go
  const lines = textLines().map((text, li) => {
    const chars = Array.from(text);
    const baseline = -li * lineStep;
    const items = [];
    let pen = 0;
    const ink = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    chars.forEach((ch, ci) => {
      if (ci) pen += (data.kern?.[chars[ci - 1] + ch] || 0) * sc;
      const g = data.glyphs[ch] || data.glyphs['?'];
      const glyph = /\s/.test(ch) ? null : glyphGeometry(font, ch);
      if (glyph) {
        items.push({ glyph, x: pen });
        ink.x0 = Math.min(ink.x0, pen + glyph.minX);
        ink.x1 = Math.max(ink.x1, pen + glyph.maxX);
        ink.y0 = Math.min(ink.y0, baseline + glyph.minY);
        ink.y1 = Math.max(ink.y1, baseline + glyph.maxY);
      }
      pen += (g ? g.ha : 0) * sc + S.spacing;
    });
    if (!items.length) {
      ink.x0 = ink.x1 = 0;
      ink.y0 = baseline + data.descender * sc;
      ink.y1 = baseline + data.ascender * sc;
    }
    return { items, baseline, ink };
  });

  const Y0 = Math.min(...lines.map((l) => l.ink.y0));
  const Y1 = Math.max(...lines.map((l) => l.ink.y1));
  const midY = (Y0 + Y1) / 2;

  const letters = [], lineObjs = [];
  let maxLineW = 0;
  for (const line of lines) {
    const { ink } = line;
    const lcx = (ink.x0 + ink.x1) / 2, lcy = (ink.y0 + ink.y1) / 2;
    const group = new THREE.Group();
    group.position.set(0, lcy - midY, 0);
    root.add(group);
    lineObjs.push({ group });
    maxLineW = Math.max(maxLineW, ink.x1 - ink.x0);
    const map = F.mapping === 'stretch'
      ? { x0: ink.x0, y0: ink.y0, sx: Math.max(1e-3, ink.x1 - ink.x0), sy: Math.max(1e-3, ink.y1 - ink.y0) }
      : { x0: 0, y0: line.baseline, sx: 1 / (F.per || 1), sy: 1 / (F.per || 1) };
    for (const { glyph, x } of line.items) {
      const pivot = new THREE.Group();
      pivot.position.set(x + glyph.cx - lcx, line.baseline + glyph.cy - lcy, 0);
      const mesh = new THREE.Mesh(placedGeometry(glyph, x, line.baseline, map), faceMaterials);
      mesh.frustumCulled = false;
      pivot.add(mesh);
      group.add(pivot);
      letters.push({ pivot, mesh, half: glyph.half, home: pivot.position.clone(), i: letters.length });
    }
  }

  block = { letters, lines: lineObjs, w: Math.max(0.3, maxLineW), h: Math.max(0.3, Y1 - Y0) };
  updateMaterials();
  updateLights(0);
  resize();
  dirty = true;
  buildPending = false;
}

/* ====================== looks ====================== */

function updateMaterials() {
  builtFinish = S.finish;
  const F = FINISHES[S.finish];
  if (faceTex) { faceTex.dispose(); faceTex = null; }
  for (const t of glitterTex) t.dispose();
  glitterTex = [];

  faceMat.map = null;
  faceMat.envMap = null;
  faceMat.combine = THREE.MultiplyOperation;
  faceMat.reflectivity = 1;
  faceMat.color.set('#ffffff');
  faceMat.specular.set('#ffffff');
  faceMat.shininess = 70;

  if (F.env) {
    // bevel and sides reflect the sky; the fronts get the painted horizon
    // plus a little of the reflection so they still flash as they turn
    faceMat.envMap = envMap(F.env);
    faceMat.combine = THREE.AddOperation;
    faceMat.reflectivity = 0.95;
    faceMat.color.set(F.env === 'gold' ? '#2a1a00' : '#141414');
    faceMat.specular.set(F.env === 'gold' ? '#fff0b0' : '#ffffff');
    faceMat.shininess = 110;
    faceTex = canvasTexture(TX.metalFace(F.env));
    capMat.map = faceTex;
    capMat.emissiveMap = faceTex;
    capMat.emissive.set('#a4a4a4');
    capMat.envMap = envMap(F.env);
    capMat.combine = THREE.AddOperation;
    capMat.reflectivity = 0.12;
    capMat.color.set('#444444');
    capMat.specular.set('#ffffff');
    capMat.shininess = 90;
    capMat.needsUpdate = true;
  } else if (F.glitter) {
    glitterTex = [11, 12, 13].map((seed) => {
      const t = canvasTexture(TX.glitter(S.color1, seed));
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      return t;
    });
    faceMat.map = glitterTex[0];
    faceMat.specular.set('#666666');
    faceMat.shininess = 60;
  } else if (F.flames) {
    flameCanvas = flameCanvas || TX.flameCanvas();
    TX.flames(flameCanvas, 0);
    faceTex = canvasTexture(flameCanvas);
    faceMat.map = faceTex;
    faceMat.specular.set('#ffd080');
    faceMat.shininess = 40;
  } else if (F.make) {
    faceTex = canvasTexture(F.make(S));
    faceMat.map = faceTex;
    faceMat.specular.set('#777777');
    faceMat.shininess = 50;
  } else {
    faceMat.color.set(S.color1);
  }
  faceMat.needsUpdate = true;

  sideMat.color.set(S.sideColor);
  sideMat.specular.set('#555555');
  sideMat.shininess = 30;
  sideMat.needsUpdate = true;
  const side = S.sidesMatch ? faceMat : sideMat;
  faceMaterials[0] = F.env ? capMat : faceMat;
  faceMaterials[1] = faceMat;
  faceMaterials[2] = side;
}

function updateLights(t) {
  const rig = LIGHTS[S.lights];
  ambient.color.set(rig.ambient[0]);
  ambient.intensity = rig.ambient[1] * EXPOSURE;
  const turn = rig.orbit ? TAU * t : 0;
  dirLights.forEach((l, i) => {
    const def = rig.lights[i];
    if (!def) { l.intensity = 0; return; }
    const [col, intensity, [x, y, z]] = def;
    l.color.set(col);
    l.intensity = intensity * EXPOSURE;
    // orbiting lights go round the z axis (in the plane of the screen)
    const c = Math.cos(turn), s = Math.sin(turn);
    l.position.set(x * c - y * s, x * s + y * c, z);
  });
}

function animatesFinish() {
  const F = FINISHES[S.finish];
  return S.animTexture && !!(F.scroll || F.glitter || F.flames);
}

function isStill() {
  return S.anim === 'none' && !animatesFinish() && !LIGHTS[S.lights].orbit;
}

function frameCount() {
  return isStill() ? 1 : Math.max(2, Math.round(S.fps * S.seconds));
}

/* Pose everything for loop position t (0..1). Every motion is periodic in
   t, so frame N would equal frame 0 and the GIF loops without a jump. */
function pose(t, frame, shapeOnly = false) {
  const B = block;
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  for (const L of B.lines) L.group.rotation.set(0, 0, 0);
  for (const L of B.letters) {
    L.pivot.position.copy(L.home);
    L.pivot.rotation.set(0, 0, 0);
    L.pivot.scale.setScalar(1);
  }
  const s = Math.sin(TAU * t);
  const n = Math.max(1, B.letters.length - 1);
  switch (S.anim) {
    case 'spin': root.rotation.y = TAU * t; break;
    case 'spin-stop': root.rotation.y = TAU * easeInOut(Math.min(1, t / 0.62)); break;
    case 'swing': root.rotation.y = 0.75 * s; break;
    case 'rock': root.rotation.z = 0.17 * s; break;
    case 'tumble': root.rotation.x = TAU * t; break;
    case 'wobble':
      root.rotation.x = 0.35 * Math.sin(TAU * t);
      root.rotation.y = 0.55 * Math.cos(TAU * t);
      break;
    case 'pulse': root.scale.setScalar(1 + 0.14 * s); break;
    case 'letters-spin': for (const L of B.letters) L.pivot.rotation.y = TAU * t; break;
    case 'letters-flip':
      for (const L of B.letters) {
        const start = (L.i / n) * 0.55;
        L.pivot.rotation.y = TAU * easeInOut(clamp((t - start) / 0.4, 0, 1));
      }
      break;
    case 'wave':
      for (const L of B.letters) L.pivot.position.y += 0.12 * Math.sin(TAU * t - L.i * 0.55);
      break;
    case 'bounce':
      for (const L of B.letters) L.pivot.position.y += 0.4 * Math.abs(Math.sin(Math.PI * 2 * t - L.i * 0.45)) - 0.2;
      break;
    case 'jelly':
      for (const L of B.letters) {
        const k = Math.sin(TAU * 2 * t - L.i * 0.6);
        L.pivot.scale.set(1 - 0.12 * k, 1 + 0.18 * k, 1);
      }
      break;
    case 'lines-opposite':
      B.lines.forEach((L, li) => { L.group.rotation.y = TAU * t * (li % 2 ? -1 : 1); });
      break;
    case 'shake': {
      const r = TX.mulberry32(frame * 9973 + 17);
      root.position.set((r() - 0.5) * 0.12, (r() - 0.5) * 0.1, 0);
      root.rotation.z = (r() - 0.5) * 0.12;
      root.scale.setScalar(1 + r() * 0.06);
      break;
    }
  }

  if (shapeOnly) return;
  updateLights(t);
  if (!S.animTexture) return;
  // the form can be a frame ahead of the materials, so go by what was built
  const F = FINISHES[builtFinish];
  if (F.glitter && glitterTex.length) {
    faceMat.map = glitterTex[Math.floor(frame / 2) % glitterTex.length];
  } else if (F.flames && faceTex) {
    TX.flames(flameCanvas, t);
    faceTex.needsUpdate = true;
  } else if (F.scroll && faceTex) {
    faceTex.offset.set(F.scroll === 'u' ? t : 0, F.scroll === 'v' ? t : 0);
  }
}

/* ====================== framing and drawing ====================== */

function outputSize() {
  const w = S.width;
  let aspect;
  switch (S.shape) {
    case 'square': aspect = 1; break;
    case '4:3': aspect = 4 / 3; break;
    case '16:9': aspect = 16 / 9; break;
    case '4:5': aspect = 0.8; break;
    default: aspect = clamp((block.w * 1.1) / (block.h * 1.35 + 0.3), 1, 2.6);
  }
  return { w, h: Math.max(2, Math.round(w / aspect / 2) * 2) };
}

/* Frame the camera on the whole loop, not just the first frame: pose the
   text at up to 48 points in the loop, take every letter's box corners,
   and back off until the worst of them fits with a margin. For a point at
   (x, y, z) and the camera at distance d on the z axis it fits when
   |x| <= (d - z) tan(fov/2) aspect, so d has a closed-form minimum. */
function fitCamera() {
  const aspect = size.w / size.h;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const m = 1.08;
  const n = frameCount();
  const samples = Math.min(n, 48);
  const v = new THREE.Vector3();
  let d = 1;
  for (let k = 0; k < samples; k++) {
    const f = Math.floor((k * n) / samples);
    pose(f / n, f, true);
    root.updateMatrixWorld(true);
    for (const L of block.letters) {
      const [hx, hy, hz] = L.half;
      for (let c = 0; c < 8; c++) {
        v.set(c & 1 ? hx : -hx, c & 2 ? hy : -hy, c & 4 ? hz : -hz).applyMatrix4(L.mesh.matrixWorld);
        d = Math.max(d, v.z + Math.max((Math.abs(v.x) * m) / (tanV * aspect), (Math.abs(v.y) * m) / tanV));
      }
    }
  }
  camera.aspect = aspect;
  camera.position.set(0, 0, d);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function resize() {
  size = outputSize();
  display.width = size.w;
  display.height = size.h;
  renderer.setSize(size.w, size.h, false);
  bgCanvas = TX.background(S.bg, size.w, size.h, S.bgColor, picture);
  display.classList.toggle('see-through', !bgCanvas);
  fitCamera();
  $('sizeNote').textContent = `${size.w} × ${size.h}, ${frameCount()} frame${frameCount() === 1 ? '' : 's'}`;
}

function drawFrame(ctx, t, frame, fill) {
  pose(t, frame);
  renderer.render(scene, camera);
  ctx.clearRect(0, 0, size.w, size.h);
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);
  else if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, size.w, size.h); }
  ctx.drawImage(renderer.domElement, 0, 0);
}

let lastFrame = -1;
function loop(now) {
  requestAnimationFrame(loop);
  if (!block || busy) return;
  const n = frameCount();
  const f = Math.floor((now / 1000) * S.fps) % n;
  if (f === lastFrame && !dirty) return;
  lastFrame = f;
  dirty = false;
  drawFrame(displayCtx, f / n, f);
}

/* ====================== export ====================== */

const nextPaint = () => new Promise((r) => requestAnimationFrame(() => r()));

function status(msg) { $('status').textContent = msg; }

function slug() {
  return S.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || '3d-text';
}

/* GIF pixels are either fully see-through or fully solid. Soft edges get
   blended onto the matte colour (wherever the GIF will be posted) and
   anything mostly clear is dropped, so there's no grey halo. */
function applyMatte(d, rgb) {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 110) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    } else if (a < 255) {
      const k = a / 255;
      d[i] = d[i] * k + rgb[0] * (1 - k);
      d[i + 1] = d[i + 1] * k + rgb[1] * (1 - k);
      d[i + 2] = d[i + 2] * k + rgb[2] * (1 - k);
      d[i + 3] = 255;
    }
  }
}

function encodeGif(frames, width, height, fps, quality) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./gif-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      if (e.data.ok) resolve(e.data.gif);
      else reject(new Error(e.data.error));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'the encoder stopped'));
    };
    worker.postMessage({ frames, width, height, fps, quality }, frames.map((f) => f.buffer));
  });
}

function setBusy(on) {
  busy = on;
  for (const id of ['makeGif', 'makeVideo', 'savePng']) $(id).disabled = on;
  if (!on) {
    dirty = true;
    if (buildPending) changed();  // pick up changes made while exporting
  }
}

// An export must never see the scene change size under it, so it waits
// for any rebuild in progress, and changes made meanwhile wait for it.
async function startExport() {
  while (buildPending) await nextPaint();
  if (busy || !block) return false;
  setBusy(true);
  return true;
}

async function makeGif() {
  if (busy || !(await startExport())) return;
  const started = performance.now();
  const { w, h } = size;
  try {
    const still = isStill();
    const n = still ? 2 : frameCount();
    const fps = still ? 1 : S.fps;
    const work = document.createElement('canvas');
    work.width = w;
    work.height = h;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    const matte = TX.hexToRgb(S.matte);
    const frames = [];
    for (let f = 0; f < n; f++) {
      drawFrame(wctx, still ? 0 : f / n, f);
      const img = wctx.getImageData(0, 0, w, h);
      if (!bgCanvas) applyMatte(img.data, matte);
      frames.push(new Uint8Array(img.data.buffer));
      if (f % 4 === 0) { status(`Drawing frame ${f + 1} of ${n}…`); await nextPaint(); }
    }
    status(`Encoding ${n} frames with gifski…`);
    await nextPaint();
    const gif = await encodeGif(frames, w, h, fps, S.quality);
    const blob = new Blob([gif], { type: 'image/gif' });
    showGif(blob, `${slug()}.gif`, `${w} × ${h}, ${n} frames`, (performance.now() - started) / 1000);
    status('');
  } catch (err) {
    status(`The GIF didn't work: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

function showGif(blob, name, what, secs) {
  if (lastGif) URL.revokeObjectURL(lastGif.url);
  lastGif = { blob, name, url: URL.createObjectURL(blob) };
  $('resultImg').src = lastGif.url;
  $('resultSave').href = lastGif.url;
  $('resultSave').download = name;
  const kb = blob.size / 1024;
  $('resultInfo').textContent = `${name}: ${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB'}, ` +
    `${what}, made in ${secs.toFixed(1)} s`;
  const file = new File([blob], name, { type: 'image/gif' });
  $('share').hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  $('result').hidden = false;
}

async function share() {
  if (!lastGif) return;
  const file = new File([lastGif.blob], lastGif.name, { type: 'image/gif' });
  try { await navigator.share({ files: [file] }); } catch { /* cancelled */ }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function savePng() {
  if (!block || busy || buildPending) return;
  drawFrame(displayCtx, 0, 0);
  display.toBlob((b) => b && download(b, `${slug()}.png`), 'image/png');
}

/* Video plays the loop in real time into a MediaRecorder for about six
   seconds. MP4 where the browser can make one (Chrome, Safari), WebM
   otherwise. Video has no see-through, so the matte colour fills in. */
async function makeVideo() {
  if (busy || !block) return;
  const types = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mime = window.MediaRecorder && types.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) { status("This browser can't record video."); return; }
  if (!(await startExport())) return;
  try {
    const vc = document.createElement('canvas');
    vc.width = size.w;
    vc.height = size.h;
    const vctx = vc.getContext('2d');
    drawFrame(vctx, 0, 0, S.matte);
    const rec = new MediaRecorder(vc.captureStream(S.fps), { mimeType: mime, videoBitsPerSecond: 5e6 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    const n = frameCount();
    const total = n * Math.max(1, Math.ceil((6 * S.fps) / n));
    const wait = (at) => new Promise((r) => setTimeout(r, Math.max(0, at - performance.now())));
    rec.start();
    const start = performance.now();
    for (let f = 0; f < total; f++) {
      await wait(start + (f * 1000) / S.fps);
      drawFrame(vctx, (f % n) / n, f % n, S.matte);
      if (f % S.fps === 0) status(`Recording video… ${Math.round((f / total) * 100)}%`);
    }
    await wait(start + (total * 1000) / S.fps);
    rec.stop();
    await stopped;
    const type = mime.split(';')[0];
    download(new Blob(chunks, { type }), `${slug()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`);
    status('');
  } catch (err) {
    status(`The video didn't work: ${err.message}`);
  } finally {
    setBusy(false);
  }
}

/* ====================== form ====================== */

function fillSelect(id, entries) {
  $(id).innerHTML = Object.entries(entries)
    .map(([k, v]) => `<option value="${k}">${typeof v === 'string' ? v : v.label}</option>`)
    .join('');
}

function readSettings() {
  return {
    text: $('text').value,
    font: $('font').value,
    finish: $('finish').value,
    color1: $('color1').value,
    color2: $('color2').value,
    sidesMatch: $('sidesMatch').checked,
    sideColor: $('sideColor').value,
    depth: +$('depth').value,
    bevel: $('bevel').value,
    spacing: +$('spacing').value,
    chunky: $('chunky').checked,
    jaggies: $('jaggies').checked,
    lights: $('lights').value,
    anim: $('anim').value,
    seconds: +$('seconds').value,
    fps: +$('fps').value,
    animTexture: $('animTexture').checked,
    bg: $('bg').value,
    bgColor: $('bgColor').value,
    width: +$('width').value,
    shape: $('shape').value,
    matte: $('matte').value,
    quality: +$('quality').value,
  };
}

function showRelevant() {
  const F = FINISHES[S.finish];
  $('color1Wrap').hidden = F.uses < 1;
  $('color2Wrap').hidden = F.uses < 2;
  $('sideColorWrap').hidden = S.sidesMatch;
  $('bgColorWrap').hidden = S.bg !== 'color';
  $('matteWrap').hidden = S.bg !== 'transparent';
  $('pictureWrap').hidden = S.finish !== 'picture' && S.bg !== 'picture';
}

let pending = 0;
function scheduleBuild() {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => rebuild());
}

function changed() {
  buildPending = true;
  if (busy) return;  // setBusy(false) picks it up
  const before = S;
  S = readSettings();
  showRelevant();
  if (before && before.jaggies !== S.jaggies) makeRenderer(!S.jaggies);
  scheduleBuild();
}

function applyLook(key) {
  const L = { ...LOOK_DEFAULTS, ...LOOKS[key] };
  for (const [k, v] of Object.entries(L)) {
    const el = $(k);
    if (!el || k === 'label') continue;
    if (el.type === 'checkbox') el.checked = v;
    else el.value = v;
  }
  changed();
}

function randomLook() {
  const pick = (o, skip = []) => {
    const keys = Object.keys(o).filter((k) => !skip.includes(k));
    return keys[Math.floor(Math.random() * keys.length)];
  };
  const bright = () => {
    const c = new THREE.Color().setHSL(Math.random(), 0.85 + Math.random() * 0.15, 0.45 + Math.random() * 0.15);
    return `#${c.getHexString(THREE.LinearSRGBColorSpace)}`;
  };
  const noPic = picture ? [] : ['picture'];
  $('font').value = pick(FONTS);
  $('finish').value = pick(FINISHES, noPic);
  $('color1').value = bright();
  $('color2').value = bright();
  $('sidesMatch').checked = Math.random() < 0.35;
  $('sideColor').value = bright();
  $('depth').value = (0.12 + Math.random() * 0.35).toFixed(2);
  $('bevel').value = pick(BEVELS);
  $('lights').value = pick(LIGHTS);
  $('anim').value = pick(ANIMS, ['none']);
  $('bg').value = pick(BACKGROUNDS, noPic);
  $('bgColor').value = bright();
  $('look').value = '';
  changed();
}

function anotherPhrase() {
  const cur = $('text').value;
  let p = cur;
  while (p === cur) p = PHRASES[Math.floor(Math.random() * PHRASES.length)];
  $('text').value = p;
  changed();
}

function loadPicture(file) {
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    picture = img;
    if (S.finish !== 'picture' && S.bg !== 'picture') $('finish').value = 'picture';
    changed();
  };
  img.src = URL.createObjectURL(file);
}

function init() {
  fillSelect('font', FONTS);
  fillSelect('finish', FINISHES);
  fillSelect('lights', LIGHTS);
  fillSelect('anim', ANIMS);
  fillSelect('bevel', BEVELS);
  fillSelect('bg', BACKGROUNDS);
  $('look').innerHTML = '<option value="">(your own)</option>' +
    Object.entries(LOOKS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

  try {
    makeRenderer(true);
  } catch (err) {
    status("This browser couldn't start WebGL, which the 3D letters need.");
    return;
  }

  document.querySelectorAll('.controls input, .controls select, .controls textarea').forEach((el) => {
    if (el.id === 'look' || el.id === 'picture') return;
    el.addEventListener('input', () => { if (el.id !== 'text') $('look').value = ''; changed(); });
  });
  $('look').addEventListener('change', () => { if ($('look').value) applyLook($('look').value); });
  $('picture').addEventListener('change', (e) => loadPicture(e.target.files[0]));
  $('randomLook').addEventListener('click', randomLook);
  $('phrase').addEventListener('click', anotherPhrase);
  $('makeGif').addEventListener('click', makeGif);
  $('makeVideo').addEventListener('click', makeVideo);
  $('savePng').addEventListener('click', savePng);
  $('share').addEventListener('click', share);

  $('text').value = PHRASES[0];
  $('look').value = 'chrome';
  applyLook('chrome');
  requestAnimationFrame(loop);
}

init();

// hooks for driving the page from headless Chrome (screenshots, test GIFs)
window.__3dtext = {
  makeGif,
  makeVideo,
  frameAt(t) { drawFrame(displayCtx, t, Math.round(t * frameCount())); return display.toDataURL('image/png'); },
  get ready() { return !!block && !busy && !buildPending; },
};

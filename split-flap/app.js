'use strict';

/* ============================== constants ============================== */

const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:./-+'&";

const FIELDS = [
  { label: 'TIME',        width: 5  },
  { label: 'FLIGHT',      width: 7  },
  { label: 'DESTINATION', width: 13 },
  { label: 'GATE',        width: 4  },
  { label: 'REMARK',      width: 10 },
];

const STD = { w: 30, h: 44, gap: 2, font: 28 };  // flight-row cells
const BIG = { w: 40, h: 56, gap: 3, font: 37 };  // title + clock cells

const PAD = 28;          // board padding
const FIELD_GAP = 18;    // gap between column groups
const ROW_GAP = 10;      // vertical gap between flight rows
const MIN_ROWS = 6;
const MAX_ROWS = 14;
const CLOCK_LEN = 5;     // "18:42"
const FLIPS_PER_SEC = 16;

const SCHEMES = {
  black: {
    board: '#141518',
    // flap face gradient: [top of top half, bottom of top half, top of bottom half, bottom]
    flap: ['#31343a', '#26292d', '#1e2125', '#16181b'],
    seam: 'rgba(0,0,0,0.8)',
    topEdge: 'rgba(255,255,255,0.09)',
    label: '#8f959c',
    text: { main: '#edeee9', yellow: '#f3c623', green: '#3fc46d', red: '#e6493a' },
  },
  ivory: {
    board: '#2d2a23',
    flap: ['#f3edda', '#e9e2cd', '#ded6bf', '#cdc4aa'],
    seam: 'rgba(72,60,40,0.55)',
    topEdge: 'rgba(255,255,255,0.55)',
    label: '#b5ac97',
    text: { main: '#1a1812', yellow: '#8a6400', green: '#1e6f42', red: '#b3261e' },
  },
};

const GLYPH_FONT = '"Liberation Sans Narrow", "Arial Narrow", "Helvetica Neue", Arial, sans-serif';

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================== state ============================== */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const ui = {
  title: document.getElementById('title'),
  clock: document.getElementById('clock'),
  letterColor: document.getElementById('letterColor'),
  scheme: document.getElementById('scheme'),
  autoRemark: document.getElementById('autoRemark'),
  sound: document.getElementById('sound'),
  rows: document.getElementById('rows'),
  shuffle: document.getElementById('shuffle'),
  reflip: document.getElementById('reflip'),
  download: document.getElementById('download'),
};

// each cell: {x, y, w, h, font, cur, target, p, delay, speed, active, colorKey}
let cells = [];
let titleCells = [], clockCells = [], rowCells = []; // rowCells[r][f] = [cell,...]
let fieldXs = [];
let labelsY = 0;
let boardW = 0, boardH = 0;
let curNumRows = 0, curTitleLen = 0;

let rafId = null;
let lastTs = null;

/* ============================== helpers ============================== */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function sanitize(str) {
  return str
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split('')
    .map(ch => (CHARSET.includes(ch) ? ch : ' '))
    .join('');
}

function nextChar(ch) {
  return CHARSET[(CHARSET.indexOf(ch) + 1) % CHARSET.length];
}

function pad(str, len) {
  return str.slice(0, len).padEnd(len, ' ');
}

function scheme() {
  return SCHEMES[ui.scheme.value] || SCHEMES.black;
}

function remarkColorKey(remark) {
  if (!ui.autoRemark.checked) return 'main';
  const r = remark.trim();
  if (/CANCEL|DELAY/.test(r)) return 'red';
  if (/BOARD|LAST CALL|FINAL|GO TO/.test(r)) return 'yellow';
  if (/ON TIME|DEPART/.test(r)) return 'green';
  return 'main';
}

function clockString() {
  const m = ui.clock.value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m) return pad(`${m[1].padStart(2, '0')}:${m[2]}`, CLOCK_LEN);
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/* ============================== layout ============================== */

function makeCell(x, y, size, colorKey) {
  return {
    x, y, w: size.w, h: size.h, font: size.font,
    cur: ' ', target: ' ', p: 0, delay: 0, speed: FLIPS_PER_SEC,
    active: false, colorKey,
  };
}

function buildLayout(numRows, titleLen) {
  cells = []; titleCells = []; clockCells = []; rowCells = []; fieldXs = [];

  const stdRowW =
    FIELDS.reduce((acc, f) => acc + f.width * (STD.w + STD.gap) - STD.gap, 0) +
    FIELD_GAP * (FIELDS.length - 1);
  boardW = PAD * 2 + stdRowW;

  // title row: title flaps on the left, clock flaps on the right
  const clockW = CLOCK_LEN * (BIG.w + BIG.gap) - BIG.gap;
  const clockX = boardW - PAD - clockW;
  const maxTitle = Math.floor((clockX - PAD - FIELD_GAP + BIG.gap) / (BIG.w + BIG.gap));
  const titleCount = clamp(titleLen, 8, maxTitle);

  const titleY = PAD;
  for (let i = 0; i < titleCount; i++) {
    const c = makeCell(PAD + i * (BIG.w + BIG.gap), titleY, BIG, 'yellow');
    titleCells.push(c); cells.push(c);
  }
  for (let i = 0; i < CLOCK_LEN; i++) {
    const c = makeCell(clockX + i * (BIG.w + BIG.gap), titleY, BIG, 'main');
    clockCells.push(c); cells.push(c);
  }

  labelsY = titleY + BIG.h + 26;
  const rowsY = labelsY + 14;

  let x = PAD;
  for (const f of FIELDS) { fieldXs.push(x); x += f.width * (STD.w + STD.gap) - STD.gap + FIELD_GAP; }

  for (let r = 0; r < numRows; r++) {
    const y = rowsY + r * (STD.h + ROW_GAP);
    const row = [];
    FIELDS.forEach((f, fi) => {
      const group = [];
      for (let i = 0; i < f.width; i++) {
        const c = makeCell(fieldXs[fi] + i * (STD.w + STD.gap), y, STD, 'main');
        group.push(c); cells.push(c);
      }
      row.push(group);
    });
    rowCells.push(row);
  }

  boardH = rowsY + numRows * (STD.h + ROW_GAP) - ROW_GAP + PAD;
  curNumRows = numRows;
  curTitleLen = titleLen;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(boardW * dpr);
  canvas.height = Math.round(boardH * dpr);
  canvas.style.width = boardW + 'px';
  canvas.dataset.dpr = dpr;
}

/* ============================== targets & animation ============================== */

function parseRows() {
  return ui.rows.value
    .split('\n')
    .map(line => line.split('|').map(part => sanitize(part.trim())))
    .filter((parts, i, arr) => parts.some(p => p !== '') || i < arr.length - 1 || arr.length === 1);
}

function setCellTargets(cellGroup, text, colorKey) {
  const padded = pad(text, cellGroup.length);
  cellGroup.forEach((cell, i) => {
    cell.target = padded[i];
    if (colorKey) cell.colorKey = colorKey;
  });
}

function applyState() {
  const rows = parseRows();
  const numRows = clamp(rows.length, MIN_ROWS, MAX_ROWS);
  const title = sanitize(ui.title.value.trim() || ' ');
  const titleLen = Math.max(title.trimEnd().length, 8);

  if (!cells.length || numRows !== curNumRows || titleLen !== curTitleLen) {
    buildLayout(numRows, titleLen);
  }

  setCellTargets(titleCells, title);
  setCellTargets(clockCells, clockString());

  for (let r = 0; r < curNumRows; r++) {
    const parts = rows[r] || [];
    rowCells[r].forEach((group, fi) => {
      const text = parts[fi] || '';
      const colorKey = fi === FIELDS.length - 1 ? remarkColorKey(text) : 'main';
      setCellTargets(group, text, colorKey);
    });
  }

  kickoff();
}

function kickoff(fromBlank = false) {
  for (const cell of cells) {
    if (fromBlank && cell.target !== ' ') cell.cur = ' ';
    if (cell.cur === cell.target) { cell.active = false; continue; }
    if (REDUCED_MOTION) { cell.cur = cell.target; cell.active = false; continue; }
    cell.active = true;
    cell.p = 0;
    cell.delay = Math.random() * 250;
    cell.speed = FLIPS_PER_SEC * (0.85 + Math.random() * 0.3);
  }
  ensureAnim();
}

function ensureAnim() {
  draw();
  if (rafId === null && cells.some(c => c.active)) {
    lastTs = null;
    rafId = requestAnimationFrame(tick);
  }
}

function tick(ts) {
  const dt = lastTs === null ? 16 : Math.min(ts - lastTs, 100);
  lastTs = ts;

  let steps = 0;
  let anyActive = false;
  for (const cell of cells) {
    if (!cell.active) continue;
    if (cell.delay > 0) { cell.delay -= dt; anyActive = true; continue; }
    cell.p += (dt / 1000) * cell.speed;
    while (cell.p >= 1) {
      cell.p -= 1;
      cell.cur = nextChar(cell.cur);
      steps++;
      if (cell.cur === cell.target) { cell.active = false; cell.p = 0; break; }
    }
    if (cell.active) anyActive = true;
  }

  if (steps > 0) clack(steps);
  draw();

  rafId = anyActive ? requestAnimationFrame(tick) : null;
}

/* ============================== drawing ============================== */

function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawGlyph(c, ch, cell, color, half) {
  if (ch === ' ') return;
  c.save();
  if (half === 'top') {
    c.beginPath(); c.rect(cell.x, cell.y, cell.w, cell.h / 2); c.clip();
  } else if (half === 'bottom') {
    c.beginPath(); c.rect(cell.x, cell.y + cell.h / 2, cell.w, cell.h / 2); c.clip();
  }
  c.fillStyle = color;
  c.font = `700 ${cell.font}px ${GLYPH_FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.translate(cell.x + cell.w / 2, cell.y + cell.h / 2 + 1);
  c.scale(0.88, 1);
  c.fillText(ch, 0, 0);
  c.restore();
}

function drawFlapFace(c, cell, S, half) {
  // half: 'top' | 'bottom' | 'full' — the flap background surface
  const { x, y, w, h } = cell;
  const r = Math.min(4, w * 0.13);
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, S.flap[0]);
  g.addColorStop(0.499, S.flap[1]);
  g.addColorStop(0.501, S.flap[2]);
  g.addColorStop(1, S.flap[3]);
  c.save();
  roundRectPath(c, x, y, w, h, r);
  c.clip();
  if (half === 'top') { c.beginPath(); c.rect(x, y, w, h / 2); c.clip(); }
  if (half === 'bottom') { c.beginPath(); c.rect(x, y + h / 2, w, h / 2); c.clip(); }
  c.fillStyle = g;
  c.fillRect(x, y, w, h);
  if (half !== 'bottom') {
    c.fillStyle = S.topEdge;
    c.fillRect(x, y, w, 1.5);
  }
  c.restore();
}

function drawCell(c, cell, S, mainKey, settled) {
  const { x, y, w, h } = cell;
  const cy = y + h / 2;
  const key = cell.colorKey === 'main' ? mainKey : cell.colorKey;
  const color = S.text[key] || S.text.main;

  drawFlapFace(c, cell, S, 'full');

  const flipping = !settled && cell.active && cell.delay <= 0 && cell.cur !== cell.target;
  const ch = settled ? cell.target : cell.cur;

  if (!flipping) {
    drawGlyph(c, ch, cell, color, 'full');
  } else {
    const next = nextChar(cell.cur);
    const p = cell.p;
    // top half already shows the incoming character
    drawGlyph(c, next, cell, color, 'top');

    if (p < 0.5) {
      // upper flap folding down: squash the current char's top half toward the seam
      drawGlyph(c, cell.cur, cell, color, 'bottom');
      const s = Math.cos(p * Math.PI); // 1 -> 0
      // shadow cast on the lower half as the flap comes down
      c.fillStyle = `rgba(0,0,0,${0.30 * (1 - s)})`;
      c.fillRect(x + 1, cy, w - 2, h * 0.22);
      c.save();
      c.translate(0, cy); c.scale(1, Math.max(s, 0.02)); c.translate(0, -cy);
      drawFlapFace(c, cell, S, 'top');
      drawGlyph(c, cell.cur, cell, color, 'top');
      c.fillStyle = `rgba(0,0,0,${0.45 * (1 - s)})`;
      c.fillRect(x, y, w, h / 2);
      c.restore();
    } else {
      // lower flap unfolding: the incoming char's bottom half grows from the seam
      drawGlyph(c, cell.cur, cell, color, 'bottom');
      const s = -Math.cos(p * Math.PI); // 0 -> 1
      c.save();
      c.translate(0, cy); c.scale(1, Math.max(s, 0.02)); c.translate(0, -cy);
      drawFlapFace(c, cell, S, 'bottom');
      drawGlyph(c, next, cell, color, 'bottom');
      c.fillStyle = `rgba(0,0,0,${0.35 * (1 - s)})`;
      c.fillRect(x, cy, w, h / 2);
      c.restore();
    }
  }

  // seam and axle notches go over everything
  c.fillStyle = S.seam;
  c.fillRect(x + 1, cy - 1, w - 2, 2);
  c.fillStyle = S.board;
  c.fillRect(x - 0.5, cy - 6, 3, 12);
  c.fillRect(x + w - 2.5, cy - 6, 3, 12);
}

function drawSpaced(c, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    c.fillText(ch, cx, y);
    cx += c.measureText(ch).width + spacing;
  }
}

function drawBoard(c, settled) {
  const S = scheme();
  const mainKey = ui.letterColor.value === 'yellow' ? 'yellow' : 'main';

  roundRectPath(c, 0, 0, boardW, boardH, 12);
  c.fillStyle = S.board;
  c.fill();

  c.font = '600 12px system-ui, sans-serif';
  c.fillStyle = S.label;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  FIELDS.forEach((f, i) => drawSpaced(c, f.label, fieldXs[i] + 2, labelsY, 2.5));

  for (const cell of cells) drawCell(c, cell, S, mainKey, settled);
}

function draw() {
  const dpr = Number(canvas.dataset.dpr) || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, boardW, boardH);
  drawBoard(ctx, false);
}

/* ============================== sound ============================== */

let audioCtx = null;
let noiseBuf = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const len = Math.floor(audioCtx.sampleRate * 0.03);
  noiseBuf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  }
}

function clack(intensity) {
  if (!ui.sound.checked || !audioCtx || audioCtx.state !== 'running') return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400 + Math.random() * 2600;
  bp.Q.value = 0.9;
  const g = audioCtx.createGain();
  g.gain.value = Math.min(0.02 + 0.004 * intensity, 0.06);
  src.connect(bp); bp.connect(g); g.connect(audioCtx.destination);
  src.start();
}

/* ============================== randomizer ============================== */

const AIRLINES = ['BA', 'LH', 'AF', 'KL', 'IB', 'AZ', 'SK', 'LX', 'OS', 'EI',
  'TP', 'FR', 'U2', 'DL', 'AA', 'UA', 'EK', 'QF', 'JL', 'NH', 'SQ', 'AY',
  'LO', 'TK', 'QR', 'AC', 'VS', 'SN'];

const DESTINATIONS = ['LONDON LHR', 'PARIS CDG', 'NEW YORK JFK', 'AMSTERDAM',
  'FRANKFURT', 'ZURICH', 'MADRID', 'ROME FCO', 'VIENNA', 'OSLO', 'HELSINKI',
  'LISBON', 'DUBLIN', 'PRAGUE', 'ATHENS', 'ISTANBUL', 'DUBAI', 'SINGAPORE',
  'TOKYO NARITA', 'HONG KONG', 'REYKJAVIK', 'COPENHAGEN', 'STOCKHOLM',
  'BARCELONA', 'MILAN MXP', 'BRUSSELS', 'GENEVA', 'BUDAPEST', 'WARSAW',
  'EDINBURGH', 'MONTREAL', 'TORONTO', 'CHICAGO ORD', 'BOSTON', 'SEATTLE',
  'CAIRO', 'DOHA', 'MUMBAI', 'SEOUL ICN', 'BANGKOK', 'SAN FRANCISCO',
  'LOS ANGELES', 'MUNICH', 'NICE', 'MALAGA', 'PORTO', 'KRAKOW', 'RIGA'];

const REMARKS = [ // [text, weight]
  ['ON TIME', 45], ['BOARDING', 16], ['DELAYED', 10], ['GO TO GATE', 8],
  ['LAST CALL', 6], ['CANCELLED', 4], ['DEPARTED', 4], ['', 7],
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function pickWeighted(pairs) {
  const total = pairs.reduce((a, p) => a + p[1], 0);
  let roll = Math.random() * total;
  for (const [value, weight] of pairs) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pairs[0][0];
}

function randomFlights(count) {
  let minutes = (5 + Math.floor(Math.random() * 15)) * 60 + Math.floor(Math.random() * 60);
  const usedDest = new Set();
  const lines = [];
  for (let i = 0; i < count; i++) {
    const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    minutes += 5 + Math.floor(Math.random() * 20);

    let dest = pick(DESTINATIONS);
    while (usedDest.has(dest)) dest = pick(DESTINATIONS);
    usedDest.add(dest);

    const flight = `${pick(AIRLINES)} ${100 + Math.floor(Math.random() * 9000)}`;
    const gate = `${pick(['A', 'B', 'C', 'D', 'E'])}${1 + Math.floor(Math.random() * 38)}`;
    lines.push(`${hh}:${mm}|${flight}|${dest}|${gate}|${pickWeighted(REMARKS)}`);
  }
  return lines.join('\n');
}

/* ============================== wiring ============================== */

const DEFAULT_ROWS = [
  '18:05|BA 117|LONDON LHR|B12|BOARDING',
  '18:20|KL 604|AMSTERDAM|C03|ON TIME',
  '18:25|LH 233|MUNICH|A07|DELAYED',
  '18:40|AF1181|PARIS CDG|B02|ON TIME',
  '18:55|SK 918|COPENHAGEN|C11|GO TO GATE',
  '19:10|IB3149|MADRID|A19|ON TIME',
  '19:15|LX 725|ZURICH|B08|CANCELLED',
  '19:30|EK 786|DUBAI|C01|ON TIME',
].join('\n');

let debounceId = null;
function applySoon() {
  clearTimeout(debounceId);
  debounceId = setTimeout(applyState, 350);
}

ui.rows.addEventListener('input', applySoon);
ui.title.addEventListener('input', applySoon);
ui.clock.addEventListener('input', applySoon);
ui.letterColor.addEventListener('change', () => draw());
ui.scheme.addEventListener('change', () => { applyState(); draw(); });
ui.autoRemark.addEventListener('change', applyState);

ui.sound.addEventListener('change', () => {
  if (ui.sound.checked) { initAudio(); audioCtx.resume(); }
});

ui.shuffle.addEventListener('click', () => {
  const count = clamp(ui.rows.value.split('\n').filter(l => l.trim()).length || 8, MIN_ROWS, MAX_ROWS);
  ui.rows.value = randomFlights(count);
  applyState();
});

ui.reflip.addEventListener('click', () => kickoff(true));
canvas.addEventListener('click', () => kickoff(true));

ui.download.addEventListener('click', () => {
  const scale = 2;
  const out = document.createElement('canvas');
  out.width = boardW * scale;
  out.height = boardH * scale;
  const octx = out.getContext('2d');
  octx.scale(scale, scale);
  drawBoard(octx, true);
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'split-flap-board.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
});

// live clock: when the clock field is on auto, flip to the new time each minute
setInterval(() => {
  if (ui.clock.value.trim() !== '') return;
  const target = clockString();
  if (clockCells.length && clockCells.map(c => c.target).join('') !== target) {
    setCellTargets(clockCells, target);
    kickoff();
  }
}, 1000);

/* ============================== boot ============================== */

ui.rows.value = DEFAULT_ROWS;
applyState();

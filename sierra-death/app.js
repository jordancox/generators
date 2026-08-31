'use strict';

/* ====================== bitmap font engine ======================
   8x8 monochrome font, ASCII 32-126, 8 bytes per glyph, bit 7 = leftmost
   pixel. Data is font8x8 by Daniel Hepper (public domain, IBM lineage):
   https://github.com/dhepper/font8x8 — converted to MSB-left hex.
   This module (GLYPHS/textW/drawText/wrap) is the reusable engine for
   every bitmap-font generator in this repo. */

const FONT_HEX =
  '0000000000000000183c3c18180018006c6c0000000000006c6cfe6cfe6c6c00307cc0780cf830' +
  '0000c6cc183066c600386c3876dccc76006060c000000000001830606060301800603018181830' +
  '600000663cff3c660000003030fc303000000000000000303060000000fc000000000000000000' +
  '303000060c183060c080007cc6cedef6e67c00307030303030fc0078cc0c3860ccfc0078cc0c38' +
  '0ccc78001c3c6cccfe0c1e00fcc0f80c0ccc78003860c0f8cccc7800fccc0c183030300078cccc' +
  '78cccc780078cccc7c0c18700000303000003030000030300000303060183060c0603018000000' +
  'fc0000fc00006030180c1830600078cc0c18300030007cc6dededec078003078ccccfccccc00fc' +
  '66667c6666fc003c66c0c0c0663c00f86c6666666cf800fe6268786862fe00fe6268786860f000' +
  '3c66c0c0ce663e00ccccccfccccccc0078303030303078001e0c0c0ccccc7800e6666c786c66e6' +
  '00f06060606266fe00c6eefefed6c6c600c6e6f6decec6c600386cc6c6c66c3800fc66667c6060' +
  'f00078ccccccdc781c00fc66667c6c66e60078cce0701ccc7800fcb4303030307800cccccccccc' +
  'ccfc00cccccccccc783000c6c6c6d6feeec600c6c66c38386cc600cccccc7830307800fec68c18' +
  '3266fe007860606060607800c06030180c060200781818181818780010386cc60000000000000000' +
  '000000ff30301800000000000000780c7ccc7600e060607c6666dc00000078ccc0cc78001c0c0c' +
  '7ccccc7600000078ccfcc07800386c60f06060f000000076cccc7c0cf8e0606c766666e6003000' +
  '7030303078000c000c0c0ccccc78e060666c786ce60070303030303078000000ccfefed6c60000' +
  '00f8cccccccc00000078cccccc78000000dc66667c60f0000076cccc7c0c1e0000dc766660f000' +
  '00007cc0780cf80010307c30303418000000cccccccc76000000cccccc7830000000c6d6fefe6c' +
  '000000c66c386cc6000000cccccc7c0cf80000fc983064fc001c3030e030301c00181818001818' +
  '1800e030301c3030e00076dc000000000000';

const GLYPHS = (() => {
  const g = new Uint8Array(95 * 8);
  for (let i = 0; i < g.length; i++) g[i] = parseInt(FONT_HEX.substr(i * 2, 2), 16);
  return g;
})();

const textW = str => str.length * 8;

function drawText(c, str, x, y, color) {
  c.fillStyle = color;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 32 || code > 126) continue;
    const o = (code - 32) * 8;
    const gx = x + i * 8;
    for (let r = 0; r < 8; r++) {
      const bits = GLYPHS[o + r];
      if (!bits) continue;
      for (let col = 0; col < 8; col++) {
        if (bits & (128 >> col)) c.fillRect(gx + col, y + r, 1, 1);
      }
    }
  }
}

function sanitize(str) {
  return str
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\n\x20-\x7e]/g, '');
}

function wrap(text, maxChars) {
  const lines = [];
  for (const para of text.split('\n')) {
    if (para.trim() === '') { lines.push(''); continue; }
    let line = '';
    for (let word of para.trim().split(/\s+/)) {
      while (word.length > maxChars) {
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, maxChars));
        word = word.slice(maxChars);
      }
      if (!word) continue;
      if (!line) line = word;
      else if (line.length + 1 + word.length <= maxChars) line += ' ' + word;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  while (lines.length && lines[0] === '') lines.shift();
  return lines;
}

/* ====================== EGA palette & screen ====================== */

const EGA = {
  black: '#000000', blue: '#0000aa', green: '#00aa00', cyan: '#00aaaa',
  red: '#aa0000', magenta: '#aa00aa', brown: '#aa5500', lightgray: '#aaaaaa',
  darkgray: '#555555', lightblue: '#5555ff', lightgreen: '#55ff55',
  lightcyan: '#55ffff', lightred: '#ff5555', lightmagenta: '#ff55ff',
  yellow: '#ffff55', white: '#ffffff',
};

const W = 320, H = 200;
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

// AGI graphics use double-wide pixels: one "fat" pixel is 2x1 screen pixels
const fat = (c, gx, gy, color) => { c.fillStyle = color; c.fillRect(gx * 2, gy, 2, 1); };

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ====================== backgrounds ====================== */

function bgSolid(c, color) {
  c.fillStyle = color;
  c.fillRect(0, 0, W, H);
}

function bgDesert(c) {
  const R = mulberry32(0xC0FFEE);
  bgSolid(c, EGA.lightblue);
  // sun
  for (let gy = 8; gy <= 42; gy++) {
    for (let gx = 105; gx <= 140; gx++) {
      const dx = gx * 2 + 1 - 244, dy = gy - 25;
      if (dx * dx + dy * dy <= 225 && Math.abs(dx) <= 14) fat(c, gx, gy, EGA.yellow);
    }
  }
  // mountain ridges
  const horizon = 110;
  for (let gx = 0; gx < 160; gx++) {
    const h1 = 38 - Math.abs(gx - 42) * 0.85;
    const h2 = 26 - Math.abs(gx - 112) * 0.6;
    const mh = Math.floor(Math.max(h1, h2, 0));
    for (let gy = horizon - mh; gy < horizon; gy++) {
      fat(c, gx, gy, gy === horizon - mh ? EGA.red : EGA.brown);
    }
  }
  // ground
  for (let gy = horizon; gy < H; gy++) {
    for (let gx = 0; gx < 160; gx++) {
      const r = R();
      fat(c, gx, gy, r < 0.055 ? EGA.brown : r < 0.075 ? EGA.red : EGA.lightred);
    }
  }
  // rocks
  for (let i = 0; i < 7; i++) {
    const rx = 4 + Math.floor(R() * 150), ry = horizon + 8 + Math.floor(R() * 78);
    const rw = 2 + Math.floor(R() * 3);
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < rw - gy; gx++) fat(c, rx + gx, ry - gy, EGA.darkgray);
    }
  }
}

function bgNight(c) {
  const R = mulberry32(0x51E77A);
  bgSolid(c, EGA.black);
  for (let i = 0; i < 70; i++) {
    fat(c, Math.floor(R() * 160), Math.floor(R() * 112), i % 5 ? EGA.white : EGA.lightcyan);
  }
  // moon
  for (let gy = 14; gy <= 44; gy++) {
    for (let gx = 108; gx <= 138; gx++) {
      const dx = gx * 2 + 1 - 246, dy = gy - 29;
      if (dx * dx + dy * dy <= 169 && Math.abs(dx) <= 12) fat(c, gx, gy, EGA.lightgray);
    }
  }
  fat(c, 119, 25, EGA.darkgray); fat(c, 126, 32, EGA.darkgray);
  fat(c, 121, 34, EGA.darkgray); fat(c, 125, 24, EGA.darkgray);
  // ground
  for (let gy = 120; gy < H; gy++) {
    for (let gx = 0; gx < 160; gx++) {
      const r = R();
      fat(c, gx, gy, r < 0.06 ? EGA.black : r < 0.08 ? EGA.lightgray : EGA.darkgray);
    }
  }
}

const BACKGROUNDS = {
  desert: bgDesert,
  night: bgNight,
  black: c => bgSolid(c, EGA.black),
  blue: c => bgSolid(c, EGA.blue),
};

/* ====================== dialog renderers ====================== */

function drawStatusBar(c, barH, left, right) {
  c.fillStyle = EGA.white;
  c.fillRect(0, 0, W, barH);
  const ty = barH === 8 ? 0 : 1;
  drawText(c, left, 8, ty, EGA.black);
  drawText(c, right, W - textW(right) - 8, ty, EGA.black);
}

// AGI message box: white panel, thin red frame (2px vertical bars — the
// double-wide pixel — 1px horizontal), black left-aligned text.
function renderAGI(c, s) {
  const lines = wrap(s.message, s.boxWidth);
  if (s.pressEnter) {
    if (lines.length) lines.push('');
    lines.push('Press ENTER to continue.');
  }
  const textCols = Math.max(...lines.map(l => l.length), 1);
  const boxW = textCols * 8 + 20;
  const boxH = Math.max(lines.length, 1) * 8 + 15;

  const top = s.statusBar ? 8 : 0;
  const x = Math.floor((W - boxW) / 4) * 2;   // align to fat-pixel grid
  const y = Math.max(top + 4, top + Math.floor((168 - top - boxH) / 2));

  c.fillStyle = EGA.white;
  c.fillRect(x, y, boxW, boxH);
  c.fillStyle = EGA.red;
  c.fillRect(x + 2, y + 2, boxW - 4, 1);           // top
  c.fillRect(x + 2, y + boxH - 3, boxW - 4, 1);    // bottom
  c.fillRect(x + 2, y + 2, 2, boxH - 4);           // left
  c.fillRect(x + boxW - 4, y + 2, 2, boxH - 4);    // right

  lines.forEach((line, i) => drawText(c, line, x + 10, y + 8 + i * 8, EGA.black));
}

// SCI0 window: white panel, 1px black border, hard drop shadow, centered
// text, a row of cut-corner buttons, optional black title bar.
function drawSciButton(c, label, x, y, highlighted) {
  const w = textW(label) + 10, h = 13;
  c.fillStyle = EGA.white;
  c.fillRect(x, y, w, h);
  c.fillStyle = EGA.black;
  c.fillRect(x + 1, y, w - 2, 1);
  c.fillRect(x + 1, y + h - 1, w - 2, 1);
  c.fillRect(x, y + 1, 1, h - 2);
  c.fillRect(x + w - 1, y + 1, 1, h - 2);
  if (highlighted) {
    c.fillRect(x + 2, y + 1, w - 4, 1);
    c.fillRect(x + 2, y + h - 2, w - 4, 1);
    c.fillRect(x + 1, y + 2, 1, h - 4);
    c.fillRect(x + w - 2, y + 2, 1, h - 4);
  }
  drawText(c, label, x + 5, y + 3, EGA.black);
  return w;
}

function renderSCI(c, s) {
  const lines = wrap(s.message, s.boxWidth);
  const buttons = s.buttons.map(b => sanitize(b).trim()).filter(Boolean);
  const pad = 6;

  const textCols = Math.max(...lines.map(l => l.length), 0);
  const btnW = buttons.map(b => textW(b) + 10);
  const btnRowW = btnW.length ? btnW.reduce((a, w) => a + w, 0) + 8 * (btnW.length - 1) : 0;
  const title = s.title.trim();

  const innerW = Math.max(textCols * 8, btnRowW, title ? textW(title) + 4 : 0, 32);
  const boxW = innerW + pad * 2 + 2;
  const titleH = title ? 10 : 0;
  const textH = lines.length * 8;
  const boxH = 2 + titleH + pad + textH +
    (buttons.length ? (textH ? 8 : 0) + 13 : 0) + pad;

  const top = s.statusBar ? 10 : 0;
  const x = Math.floor((W - boxW) / 2);
  const y = Math.max(top + 4, top + Math.floor((H - top - boxH) / 2) - 6);

  c.fillStyle = EGA.black;
  c.fillRect(x + 2, y + 2, boxW, boxH);          // shadow
  c.fillRect(x, y, boxW, boxH);                  // border
  c.fillStyle = EGA.white;
  c.fillRect(x + 1, y + 1, boxW - 2, boxH - 2);

  if (title) {
    c.fillStyle = EGA.black;
    c.fillRect(x + 1, y + 1, boxW - 2, titleH);
    drawText(c, title, x + Math.floor((boxW - textW(title)) / 2), y + 2, EGA.white);
  }

  const textY = y + 1 + titleH + pad;
  lines.forEach((line, i) =>
    drawText(c, line, x + Math.floor((boxW - textW(line)) / 2), textY + i * 8, EGA.black));

  if (buttons.length) {
    let bx = x + Math.floor((boxW - btnRowW) / 2);
    const by = textY + textH + (textH ? 8 : 0);
    buttons.forEach((label, i) => {
      bx += drawSciButton(c, label, bx, by, s.hlFirst && i === 0) + 8;
    });
  }
}

/* ====================== state & wiring ====================== */

const ui = {};
for (const id of ['style', 'bg', 'boxWidth', 'boxWidthVal', 'title', 'buttons',
  'hlFirst', 'pressEnter', 'statusBar', 'statusLeft', 'statusRight',
  'message', 'shuffle', 'scale', 'download']) {
  ui[id] = document.getElementById(id);
}

const DEATHS = [
  'You have died.\n\nAs your vision fades, you reflect that licking the reactor core was, in retrospect, a mistake.',
  'You step boldly into the darkness. The darkness, unfortunately, steps back.\n\nYou have died.',
  'You have drowned. Next time try holding your breath, or better yet, staying out of the lake.',
  'The rope bridge was older than it looked. It is now slightly younger than you.',
  'Congratulations! You have discovered the fatal properties of the glowing crystal. Science thanks you for your sacrifice.',
  "Eating the colorful mushroom seemed like a good idea at the time. It wasn't.\n\nYou have died.",
  'The guard dog was not, as you assumed, friendly.\n\nRemember: save early, save often.',
  'You have fallen off the cliff. On the bright side, the view on the way down was spectacular.',
];
let deathIdx = 0;

function readState() {
  return {
    style: ui.style.value,
    bg: ui.bg.value,
    boxWidth: Number(ui.boxWidth.value),
    title: sanitize(ui.title.value),
    buttons: ui.buttons.value.split(','),
    hlFirst: ui.hlFirst.checked,
    pressEnter: ui.pressEnter.checked,
    statusBar: ui.statusBar.checked,
    statusLeft: sanitize(ui.statusLeft.value),
    statusRight: sanitize(ui.statusRight.value),
    message: sanitize(ui.message.value),
  };
}

function render() {
  const s = readState();
  (BACKGROUNDS[s.bg] || bgDesert)(ctx);
  if (s.statusBar) {
    drawStatusBar(ctx, s.style === 'agi' ? 8 : 10, s.statusLeft, s.statusRight);
  }
  if (s.style === 'agi') renderAGI(ctx, s);
  else renderSCI(ctx, s);
}

function syncStyleUI() {
  const agi = ui.style.value === 'agi';
  document.querySelectorAll('.agi-only').forEach(el => el.classList.toggle('hidden', !agi));
  document.querySelectorAll('.sci-only').forEach(el => el.classList.toggle('hidden', agi));
}

let debounceId = null;
function renderSoon() {
  clearTimeout(debounceId);
  debounceId = setTimeout(render, 150);
}

for (const el of [ui.title, ui.buttons, ui.statusLeft, ui.statusRight, ui.message]) {
  el.addEventListener('input', renderSoon);
}
for (const el of [ui.bg, ui.hlFirst, ui.pressEnter, ui.statusBar]) {
  el.addEventListener('change', render);
}
ui.style.addEventListener('change', () => { syncStyleUI(); render(); });
ui.boxWidth.addEventListener('input', () => {
  ui.boxWidthVal.textContent = ui.boxWidth.value;
  renderSoon();
});

function shuffleDeath() {
  deathIdx = (deathIdx + 1 + Math.floor(Math.random() * (DEATHS.length - 1))) % DEATHS.length;
  ui.message.value = DEATHS[deathIdx];
  render();
}
ui.shuffle.addEventListener('click', shuffleDeath);
canvas.addEventListener('click', shuffleDeath);

ui.download.addEventListener('click', () => {
  const scale = Number(ui.scale.value) || 3;
  const out = document.createElement('canvas');
  out.width = W * scale;
  out.height = H * scale;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(canvas, 0, 0, out.width, out.height);
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sierra-death.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
});

/* ====================== boot ====================== */

ui.message.value = DEATHS[0];
syncStyleUI();
render();

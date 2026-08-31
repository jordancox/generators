'use strict';

/* ====================== bitmap font engine ======================
   8x8 monochrome font, ASCII 32-126, 8 bytes per glyph, bit 7 = leftmost
   pixel. Data is font8x8 by Daniel Hepper (public domain, IBM lineage):
   https://github.com/dhepper/font8x8 — converted to MSB-left hex.
   Copied from sierra-death/app.js, the repo's shared engine; here each
   font pixel becomes a 2x3 screen pixel so the cells come out teletext-
   shaped (16x24), with a hand-made pound sign on top. */

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

const POUND = [0x1c, 0x36, 0x30, 0x7c, 0x30, 0x30, 0x7e, 0x00];

function glyphRow(ch, row) {
  if (ch === '£') return POUND[row];
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) return 0;
  return GLYPHS[(code - 32) * 8 + row];
}

function sanitize(str) {
  return str
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\n\x20-\x7e£]/g, '');
}

/* ====================== rng ====================== */

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const newSeed = () => (Math.random() * 4294967296) >>> 0;

/* ====================== the grid ====================== */

const COLS = 40, ROWS = 25, CW = 16, CHT = 24;
const W = COLS * CW, H = ROWS * CHT;

const PAL = {
  r: '#ff0000', g: '#00ff00', y: '#ffff00', b: '#0000ff',
  m: '#ff00ff', c: '#00ffff', w: '#ffffff', k: '#000000',
};

/* spacing attributes: colours are set-after, backgrounds set-at,
   exactly one cell each */
const TOKENS = {
  r: { fg: PAL.r }, g: { fg: PAL.g }, y: { fg: PAL.y }, b: { fg: PAL.b },
  m: { fg: PAL.m }, c: { fg: PAL.c }, w: { fg: PAL.w },
  gr: { fg: PAL.r, gfx: true }, gg: { fg: PAL.g, gfx: true },
  gy: { fg: PAL.y, gfx: true }, gb: { fg: PAL.b, gfx: true },
  gm: { fg: PAL.m, gfx: true }, gc: { fg: PAL.c, gfx: true },
  gw: { fg: PAL.w, gfx: true },
  dh: { dh: true }, nb: { nb: true }, bb: { bb: true },
  fl: { fl: true }, st: { st: true },
};

/* sixel shorthand: bits are tl,tr,ml,mr,bl,br */
const SIXELS = { '#': 0b111111, "'": 0b000011, ',': 0b110000, '-': 0b001100 };

function parseLine(text) {
  const cells = [];
  let fg = PAL.w, bg = PAL.k, gfx = false, fl = false, dh = false;
  let i = 0;
  while (i < text.length && cells.length < COLS) {
    const ch = text[i];
    if (ch === '{') {
      const end = text.indexOf('}', i);
      const tok = end > i ? TOKENS[text.slice(i + 1, end)] : undefined;
      if (tok) {
        if (tok.nb) bg = fg;            // set-at
        if (tok.bb) bg = PAL.k;
        cells.push({ ch: ' ', fg, bg, gfx: false, fl: false });
        if (tok.fg) { fg = tok.fg; gfx = !!tok.gfx; }  // set-after
        if (tok.fl) fl = true;
        if (tok.st) fl = false;
        if (tok.dh) dh = true;
        i = end + 1;
        continue;
      }
    }
    cells.push({ ch, fg, bg, gfx, fl });
    i++;
  }
  while (cells.length < COLS) cells.push({ ch: ' ', fg, bg, gfx: false, fl: false });
  return { cells, dh };
}

/* rows built directly (header, fastext) don't pay for tokens */
function rowFromSpans(spans, bg = PAL.k) {
  const cells = [];
  for (const [text, fg] of spans) {
    for (const ch of text) {
      if (cells.length >= COLS) break;
      cells.push({ ch, fg, bg, gfx: false, fl: false });
    }
  }
  while (cells.length < COLS) cells.push({ ch: ' ', fg: PAL.w, bg, gfx: false, fl: false });
  return { cells, dh: false };
}

const $ = id => document.getElementById(id);
const canvas = $('screen');
const ctx = canvas.getContext('2d');

function autoClock() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = n => String(n).padStart(2, '0');
  return `${days[d.getDay()]} ${p(d.getDate())} ${mons[d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}/${p(d.getSeconds())}`;
}

function headerRow() {
  const num = (sanitize($('page').value).replace(/\D/g, '') || '100').padStart(3, '0').slice(-3);
  const service = sanitize($('service').value).trim() || 'CEEFAX';
  const clock = sanitize($('clock').value).trim() || autoClock();
  const left = `P${num} `;
  const mid = `${service} ${num}`;
  const gap = Math.max(COLS - left.length - mid.length - clock.length - 1, 1);
  return rowFromSpans([[left, PAL.w], [mid, PAL.w], [' '.repeat(gap), PAL.w], [clock, PAL.y]]);
}

function fastextRow() {
  const labels = sanitize($('fastext').value).split('|').slice(0, 4);
  const colors = [PAL.r, PAL.g, PAL.y, PAL.c];
  const spans = [];
  labels.forEach((l, i) => {
    spans.push([' ', PAL.w]);
    spans.push([l.trim().slice(0, 9).padEnd(9), colors[i]]);
  });
  return rowFromSpans(spans);
}

function buildScreen() {
  const rows = [headerRow()];
  const wantFastext = $('showFastext').checked;
  const limit = wantFastext ? ROWS - 1 : ROWS;
  let vr = 1;
  for (const line of sanitize($('body').value).split('\n')) {
    if (vr >= limit) break;
    const row = parseLine(line);
    if (row.dh && vr + 2 > limit) row.dh = false;
    rows.push(row);
    vr += row.dh ? 2 : 1;
  }
  while (vr < limit) { rows.push(parseLine('')); vr++; }
  if (wantFastext) rows.push(fastextRow());
  return rows;
}

/* ====================== drawing ====================== */

function drawCell(c, cell, x, y, dh, phase) {
  const ph = dh ? CHT * 2 : CHT;
  c.fillStyle = cell.bg;
  c.fillRect(x, y, CW, ph);
  if (cell.ch === ' ' || (cell.fl && !phase)) return;
  c.fillStyle = cell.fg;

  /* blast-through: capitals and @ still print as text in graphics mode */
  if (cell.gfx && !/[A-Z@]/.test(cell.ch)) {
    const bits = SIXELS[cell.ch];
    if (!bits) return;
    const bh = ph / 3;
    for (let s = 0; s < 6; s++) {
      if (bits & (1 << s)) c.fillRect(x + (s % 2) * 8, y + Math.floor(s / 2) * bh, 8, bh);
    }
    return;
  }

  const px = 2, py = dh ? 6 : 3;
  for (let row = 0; row < 8; row++) {
    const bits = glyphRow(cell.ch, row);
    if (!bits) continue;
    for (let col = 0; col < 8; col++) {
      if (bits & (128 >> col)) c.fillRect(x + col * px, y + row * py, px, py);
    }
  }
}

function applyCRT(c, w, h, scale) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.45;
  c.filter = `blur(${2.5 * scale}px)`;
  c.drawImage(c.canvas, 0, 0);
  c.restore();
  c.fillStyle = 'rgba(0,0,0,0.24)';
  const period = 4 * scale;
  for (let y = 2 * scale; y < h; y += period) c.fillRect(0, y, w, Math.max(scale, 1));
}

function render(c, scale, phase) {
  const rows = buildScreen();
  c.save();
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.fillStyle = PAL.k;
  c.fillRect(0, 0, W, H);
  let y = 0;
  for (const row of rows) {
    row.cells.forEach((cell, i) => drawCell(c, cell, i * CW, y, row.dh, phase));
    y += row.dh ? CHT * 2 : CHT;
  }
  c.restore();
  if ($('crt').checked) applyCRT(c, W * scale, H * scale, scale);
}

/* ====================== flash timer ====================== */

let phase = true, timer = null;

function paint() {
  render(ctx, 1, phase);
  const needsTimer = /\{fl\}/.test($('body').value);
  if (needsTimer && !timer) timer = setInterval(() => { phase = !phase; render(ctx, 1, phase); }, 700);
  if (!needsTimer && timer) { clearInterval(timer); timer = null; phase = true; }
}

/* ====================== preset pages ====================== */

function pad(s, n) { return String(s).padEnd(n).slice(0, n); }

const PRESETS = [
  {
    page: '104', fastext: 'News Idx|Sport|Weather|Main Menu',
    body: rand => [
      '{dh}{y}BISCUIT TALKS RESUME',
      '',
      'Negotiators returned to the table',
      'today after a fortnight of silence',
      'over tea break allocations.',
      '',
      '{c}Union sources described the mood as',
      '{c}"quietly hopeful, but dunking',
      '{c}remains a red line".',
      '',
      'Management said a statement would',
      'follow "before the kettle boils".',
      '',
      `{g}Talks continue at ${7 + Math.floor(rand() * 4)}am tomorrow.`,
      '',
      '{fl}{r}NEWSFLASH{st} {w}page 150',
    ],
  },
  {
    page: '302', fastext: 'Results|Tables|Racing|Main Menu',
    body: rand => {
      const teams = ['ARSENAL', 'COVENTRY', 'LEEDS UTD', 'NORWICH', 'SPURS', 'EVERTON',
        'VILLA', 'WIMBLEDON', 'LIVERPOOL', 'DERBY', 'FOREST', 'QPR',
        'OLDHAM', 'CHELSEA', 'SHEFF WED', 'SOTON'];
      const lines = ['{dh}{g}FOOTBALL  DIVISION ONE', ''];
      for (let i = 0; i < 8; i++) {
        const a = teams[i * 2], b = teams[i * 2 + 1];
        lines.push(`${pad(a, 14)}${Math.floor(rand() * 4)}  ${pad(b, 14)}${Math.floor(rand() * 3)}`);
      }
      lines.push('', '{y}Classified results      page 324',
        '{y}League tables           page 308');
      return lines;
    },
  },
  {
    page: '401', fastext: 'Maps|5 Day|Shipping|Main Menu',
    body: rand => {
      const t = () => `${String(6 + Math.floor(rand() * 11)).padStart(2)}C`;
      const pair = (a, b) => `{y}${pad(a, 12)}{w}${t()}   {y}${pad(b, 12)}{w}${t()}`;
      return [
        '{dh}{c}WEATHER FOR TONIGHT',
        '',
        'A band of rain clears eastwards',
        'with scattered showers behind.',
        'Winds light. Fog patches later.',
        '',
        pair('LONDON', 'GLASGOW'),
        pair('CARDIFF', 'BELFAST'),
        pair('NORWICH', 'PLYMOUTH'),
        pair('YORK', 'ABERDEEN'),
        '',
        '{b}{nb}{y}OUTLOOK: mainly dry on Monday',
      ];
    },
  },
  {
    page: '600', fastext: 'BBC1|BBC2|ITV|Main Menu',
    body: () => [
      '{dh}{m}TONIGHT ON BBC1',
      '',
      '{c}6.00  {w}Regional News Hour',
      "{c}6.30  {w}Tomorrow's World",
      '{c}7.00  {w}The Antiques Gauntlet',
      '{c}7.45  {w}Only Fools and Lawnmowers',
      '{c}8.30  {w}Casualty {c}(repeat)',
      "{c}9.00  {w}Nine O'Clock News",
      '{c}9.30  {w}Film: Escape From Page 888',
      '{c}11.15 {w}Weatherview',
      '{c}11.20 {w}Closedown',
      '',
      "{y}Full week's listings     page 606",
    ],
  },
  {
    page: '100', fastext: 'News|Sport|Weather|TV',
    body: () => [
      '{gy}' + '#'.repeat(39),
      '{dh}{y}CEEFAX INDEX',
      '{gy}' + '#'.repeat(39),
      '',
      '{y}101 {w}Headlines      {y}300 {w}Sport',
      '{y}104 {w}News in full   {y}401 {w}Weather',
      '{y}200 {w}Money          {y}500 {w}Motoring',
      '{y}220 {w}Shares         {y}600 {w}TV Guide',
      '{y}241 {w}Lottery        {y}888 {w}Subtitles',
      '',
      '{c}Use the coloured buttons below for',
      '{c}fast access to popular sections',
    ],
  },
  {
    page: '220', fastext: 'Shares|FTSE|Currency|Main Menu',
    body: rand => {
      const quote = (name, base) => {
        const up = rand() < 0.5;
        const delta = Math.max(base * (0.001 + rand() * 0.009), 0.1).toFixed(1);
        const val = (base + (up ? 1 : -1) * parseFloat(delta)).toFixed(1);
        return `${pad(name, 13)}${val.padStart(7)}  ${up ? '{g}+' : '{r}-'}${delta.padStart(5)}`;
      };
      return [
        '{dh}{w}MARKETS AT THE CLOSE',
        '',
        quote('FTSE 100', 2412), quote('DOW JONES', 3271), quote('NIKKEI', 17384),
        quote('GOLD $/OZ', 344), quote('BRENT CRUDE', 19), quote('HANG SENG', 5834),
        '',
        '{c}Prices at close of business.',
        '',
        '{y}Your shares are up £3. Do not',
        '{y}spend it all at once.',
      ];
    },
  },
];

function shuffle() {
  const rand = mulberry32(newSeed());
  applyPreset(PRESETS[Math.floor(rand() * PRESETS.length)], rand);
}

function applyPreset(preset, rand) {
  $('page').value = preset.page;
  $('fastext').value = preset.fastext;
  $('body').value = preset.body(rand).join('\n');
  paint();
}

/* ====================== wiring ====================== */

function download() {
  const scale = parseInt($('scale').value, 10);
  const out = document.createElement('canvas');
  out.width = W * scale;
  out.height = H * scale;
  const c = out.getContext('2d');
  c.imageSmoothingEnabled = false;
  render(c, scale, true);
  const a = document.createElement('a');
  const num = (sanitize($('page').value).replace(/\D/g, '') || '100').padStart(3, '0').slice(-3);
  a.download = `teletext-p${num}.png`;
  a.href = out.toDataURL('image/png');
  a.click();
}

for (const id of ['page', 'service', 'clock', 'crt', 'showFastext', 'fastext', 'body']) {
  $(id).addEventListener('input', paint);
}
canvas.addEventListener('click', shuffle);
$('shuffle').addEventListener('click', shuffle);
$('download').addEventListener('click', download);

/* keep the auto clock ticking on whole minutes */
setInterval(() => { if (!$('clock').value.trim()) paint(); }, 30000);

applyPreset(PRESETS[0], mulberry32(20260831));

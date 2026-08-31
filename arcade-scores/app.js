'use strict';

/* ====================== bitmap font engine ======================
   8x8 monochrome font, ASCII 32-126, 8 bytes per glyph, bit 7 = leftmost
   pixel. Data is font8x8 by Daniel Hepper (public domain, IBM lineage):
   https://github.com/dhepper/font8x8 — converted to MSB-left hex.
   Copied from sierra-death/app.js, the repo's shared engine; drawn here
   at a native 224x288 (28x36 cells) and scaled up with hard pixels,
   plus a hand-made copyright sign. */

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

const COPYRIGHT = [0x3c, 0x42, 0x99, 0xa1, 0xa1, 0x99, 0x42, 0x3c];

function glyphRow(ch, row) {
  if (ch === '©') return COPYRIGHT[row];
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 126) return 0;
  return GLYPHS[(code - 32) * 8 + row];
}

function sanitize(str) {
  return str
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\n\x20-\x7e©]/g, '');
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const newSeed = () => (Math.random() * 4294967296) >>> 0;

/* ====================== screen ====================== */

const COLS = 28, ROWS = 36, NW = COLS * 8, NH = ROWS * 8, SCALE = 3;

const PAL = {
  red: '#ff2020', orange: '#ffa000', yellow: '#ffe000', green: '#20ff40',
  cyan: '#00ffff', blue: '#4060ff', magenta: '#ff40ff', white: '#ffffff',
  pink: '#ffb8de',
};
const RAINBOW = [PAL.red, PAL.orange, PAL.yellow, PAL.green, PAL.cyan, PAL.magenta];
const RANK_COLORS = [PAL.red, PAL.orange, PAL.yellow, PAL.green, PAL.cyan, PAL.magenta, PAL.white];
const RANKS = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH'];

const $ = id => document.getElementById(id);
const canvas = $('screen');
const ctx = canvas.getContext('2d');
const native = document.createElement('canvas');
native.width = NW;
native.height = NH;
const nctx = native.getContext('2d');

function drawText(c, str, col, row, color, size = 1) {
  for (let i = 0; i < str.length; i++) {
    c.fillStyle = Array.isArray(color) ? color[i % color.length] : color;
    const gx = col * 8 + i * 8 * size;
    for (let r = 0; r < 8; r++) {
      const bits = glyphRow(str[i], r);
      if (!bits) continue;
      for (let cl = 0; cl < 8; cl++) {
        if (bits & (128 >> cl)) c.fillRect(gx + cl * size, row * 8 + r * size, size, size);
      }
    }
  }
}

const center = (len, size = 1) => Math.floor((COLS - len * size) / 2);

function parseEntries() {
  const out = [];
  for (const raw of sanitize($('entries').value).split('\n')) {
    if (!raw.trim()) continue;
    const bar = raw.lastIndexOf('|');
    const name = (bar >= 0 ? raw.slice(0, bar) : raw).trim().toUpperCase().slice(0, 3) || 'AAA';
    const score = (bar >= 0 ? raw.slice(bar + 1) : '').replace(/\D/g, '').slice(0, 6) || '0';
    out.push([name, score]);
    if (out.length === 7) break;
  }
  return out;
}

function renderNative(coinOn) {
  nctx.fillStyle = '#000';
  nctx.fillRect(0, 0, NW, NH);

  const entries = parseEntries();
  const high = entries.length ? entries[0][1] : '0';
  const oneup = ($('oneup').value.replace(/\D/g, '') || '0').slice(0, 6);

  drawText(nctx, '1UP', 2, 0, PAL.red);
  drawText(nctx, 'HIGH SCORE', center(10), 0, PAL.red);
  drawText(nctx, oneup.padStart(6), 1, 1, PAL.white);
  drawText(nctx, high.padStart(6), center(10) + 2, 1, PAL.white);

  const title = sanitize($('title').value).trim().toUpperCase() || 'STAR VULTURE';
  const style = $('titleStyle').value;
  const color = style === 'rainbow' ? RAINBOW : PAL[style] || PAL.white;
  const size = title.length <= 13 ? 2 : 1;
  drawText(nctx, title, center(title.length, size), 5, color, size);

  if (entries.length) {
    drawText(nctx, `- BEST ${entries.length} -`, center(8 + String(entries.length).length), 9, PAL.yellow);
    drawText(nctx, 'SCORE  NAME', 11, 11, PAL.white);
    entries.forEach(([name, score], i) => {
      drawText(nctx, `${RANKS[i]}  ${score.padStart(6)}  ${name}`, 4, 13 + i * 2, RANK_COLORS[i]);
    });
  }

  drawText(nctx, 'PUSH START BUTTON', center(17), 27, PAL.cyan);
  if (coinOn) drawText(nctx, 'INSERT COIN', center(11), 29, PAL.white);

  const maker = sanitize($('copyright').value).trim().toUpperCase();
  if (maker) drawText(nctx, `© ${maker}`, center(maker.length + 2), 31, PAL.pink);

  const credits = Math.max(parseInt($('credits').value, 10) || 0, 0);
  drawText(nctx, `CREDIT ${credits}`, 2, 34, PAL.white);
}

function applyCRT(c, w, h, px) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.4;
  c.filter = `blur(${px}px)`;
  c.drawImage(c.canvas, 0, 0);
  c.restore();
  c.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = px - 1; y < h; y += px) c.fillRect(0, y, w, Math.max(px / 3, 1));
  const v = c.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, h * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.42)');
  c.fillStyle = v;
  c.fillRect(0, 0, w, h);
}

function render(c, scale, coinOn) {
  renderNative(coinOn);
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, NW * SCALE * scale, NH * SCALE * scale);
  c.drawImage(native, 0, 0, NW * SCALE * scale, NH * SCALE * scale);
  if ($('crt').checked) applyCRT(c, NW * SCALE * scale, NH * SCALE * scale, SCALE * scale);
}

/* ====================== flash timer ====================== */

let phase = true, timer = null;

function paint() {
  const flashing = $('coin').checked;
  render(ctx, 1, flashing ? phase : true);
  if (flashing && !timer) timer = setInterval(() => { phase = !phase; render(ctx, 1, phase); }, 600);
  if (!flashing && timer) { clearInterval(timer); timer = null; phase = true; }
}

/* ====================== fake games ====================== */

const GAMES = [
  { title: 'STAR VULTURE', maker: '1982 SHINKAI CORP', style: 'rainbow' },
  { title: 'CRYPT MUNCHER', maker: '1981 OMEGATRON', style: 'yellow' },
  { title: 'TURBO OSTRICH', maker: '1983 PIXKO LTD', style: 'cyan' },
  { title: 'VECTOR PANIC', maker: '1980 TAKO-TRONIC', style: 'white' },
  { title: 'SQUID PATROL', maker: '1984 SHINKAI CORP', style: 'rainbow' },
  { title: 'NEON HARVEST', maker: '1983 GOLDPIN GAMES', style: 'red' },
];

const INITIALS = ['ACE', 'REX', 'ZAP', 'MAX', 'JET', 'SKY', 'VIC', 'KAT',
  'LEE', 'TAZ', 'MOE', 'GUS', 'PIP', 'DOT', 'BUZ', 'RAT'];

function shuffle() {
  const rand = mulberry32(newSeed());
  const game = GAMES[Math.floor(rand() * GAMES.length)];
  $('title').value = game.title;
  $('titleStyle').value = game.style;
  $('copyright').value = game.maker;
  $('credits').value = Math.floor(rand() * 4);
  $('oneup').value = String(Math.floor(rand() * 800) * 10);

  const pool = INITIALS.slice();
  let score = (2 + Math.floor(rand() * 8)) * 10000;
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const name = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    rows.push(`${name} | ${score}`);
    score = Math.max(Math.round(score * (0.6 + rand() * 0.3) / 500) * 500, 1000 - i * 100);
  }
  $('entries').value = rows.join('\n');
  paint();
}

/* ====================== wiring ====================== */

function download() {
  const scale = parseInt($('scale').value, 10);
  const out = document.createElement('canvas');
  out.width = NW * SCALE * scale;
  out.height = NH * SCALE * scale;
  render(out.getContext('2d'), scale, true);
  const a = document.createElement('a');
  const slug = ($('title').value.trim() || 'arcade').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.download = `${slug || 'arcade'}-scores.png`;
  a.href = out.toDataURL('image/png');
  a.click();
}

for (const id of ['title', 'titleStyle', 'oneup', 'credits', 'copyright', 'coin', 'crt', 'entries']) {
  $(id).addEventListener('input', paint);
}
canvas.addEventListener('click', () => {
  $('credits').value = Math.min((parseInt($('credits').value, 10) || 0) + 1, 99);
  paint();
});
$('shuffle').addEventListener('click', shuffle);
$('download').addEventListener('click', download);

/* curated first screen; the button randomizes */
const first = GAMES[0];
$('title').value = first.title;
$('titleStyle').value = first.style;
$('copyright').value = first.maker;
$('oneup').value = '3210';
$('entries').value = ['ACE | 30000', 'REX | 25000', 'ZAP | 20000', 'MAX | 15000', 'JET | 10000'].join('\n');
paint();

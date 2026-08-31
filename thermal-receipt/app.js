'use strict';

/* ====================== bitmap font engine ======================
   8x8 monochrome font, ASCII 32-126, 8 bytes per glyph, bit 7 = leftmost
   pixel. Data is font8x8 by Daniel Hepper (public domain, IBM lineage):
   https://github.com/dhepper/font8x8 — converted to MSB-left hex.
   Copied from sierra-death/app.js, the repo's shared engine; here each
   glyph pixel is printed as a thermal dot instead of a fillRect. */

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

function sanitize(str) {
  return str
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\n\x20-\x7e]/g, '');
}

/* ====================== seeded rng ====================== */

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const newSeed = () => (Math.random() * 4294967296) >>> 0;

/* ====================== fake stores ====================== */

const STORES = [
  {
    name: 'VALU-MART', addr: '2200 FRONTAGE RD, MERIDIAN', phone: '(555) 019-3382',
    url: 'WWW.TELLVALUMART.COM', footer: 'THANK YOU COME AGAIN',
    items: [
      ['MILK 2% GALLON', 2.99, 4.59], ['WONDER BREAD', 1.99, 2.79],
      ['EGGS LARGE DOZ', 2.49, 5.99], ['BANANAS 2.14 LB', 0.89, 1.69],
      ['ROTISSERIE CHICKEN', 4.99, 6.99], ['PAPER TOWELS 6PK', 6.99, 9.99],
      ['CAT FOOD SALMON 12CT', 9.99, 13.49], ['FROZEN PIZZA PEPPERONI', 3.99, 5.49],
      ['ICE CREAM VANILLA', 3.49, 6.29], ['LAUNDRY PODS 42CT', 11.99, 15.99],
      ['STORE BRAND COLA 2L', 0.99, 1.49], ['SHREDDED CHEESE LB', 3.29, 4.99],
    ],
  },
  {
    name: "GAS N' GO #442", addr: 'EXIT 19, I-80 WESTBOUND', phone: '(555) 774-2001',
    url: 'WWW.GASNGOLISTENS.COM', footer: 'PLEASE COME AGAIN',
    items: [
      ['UNLEADED 9.41 GAL', 26.51, 38.99], ['HOT DOG ROLLER', 1.99, 2.99],
      ['ENERGY DRINK XL', 2.99, 4.29], ['SCRATCHER LUCKY 7S', 5.00, 5.00],
      ['BEEF JERKY BIG BAG', 8.99, 12.99], ['WASHER FLUID GAL', 3.49, 4.99],
      ['COFFEE 20 OZ', 1.89, 2.59], ['SUNGLASSES DISPLAY', 9.99, 14.99],
      ['AIR FRESHENER PINE', 1.99, 3.49], ['PHONE CHARGER UNIV', 12.99, 19.99],
    ],
  },
  {
    name: 'RITE PRICE PHARMACY', addr: '48 COMMERCE WAY, SUITE B', phone: '(555) 331-0090',
    url: 'WWW.RITEPRICECARES.COM', footer: 'BE WELL',
    items: [
      ['VITAMIN GUMMIES 90CT', 8.99, 13.99], ['READING GLASSES 2.5X', 11.99, 16.99],
      ['GREETING CARD SORRY', 3.99, 6.99], ['ANTACID EXTRA STR', 6.49, 9.99],
      ['HEATING PAD KING SZ', 19.99, 27.99], ['COUGH DROPS HONEY', 2.29, 3.79],
      ['BANDAGES ASST 60CT', 4.49, 6.49], ['EPSOM SALT 4LB', 5.99, 8.99],
      ['TISSUES 3PK', 4.99, 6.99], ['NASAL SPRAY', 7.99, 11.49],
    ],
  },
  {
    name: 'SNACK SHACK', addr: 'FOOD COURT UNIT 7, EASTGATE MALL', phone: '(555) 208-6644',
    url: 'WWW.SNACKSHACKSURVEY.COM', footer: 'NO REFUNDS ON SLUSH',
    items: [
      ['NACHOS GRANDE', 6.99, 8.99], ['BLUE SLUSH XL', 3.99, 5.49],
      ['PRETZEL W/ CHEESE', 4.99, 6.49], ['CHURRO 2CT', 3.49, 4.99],
      ['CORN DOG', 3.99, 5.49], ['LEMONADE FRESH SQZD', 4.49, 6.99],
      ['PIZZA SLICE PEPP', 4.29, 5.99], ['FUNNEL CAKE FRIES', 5.99, 7.99],
    ],
  },
  {
    name: 'PAPER PLANET', addr: '900 INDUSTRIAL PKWY', phone: '(555) 462-7788',
    url: 'WWW.PAPERPLANETPOLL.COM', footer: 'SAVE YOUR RECEIPT',
    items: [
      ['TONER CART BLACK', 74.99, 92.99], ['STICKY NOTES 12PK', 8.99, 12.99],
      ['BINDER CLIPS JUMBO', 3.99, 5.99], ['COPY PAPER CASE', 32.99, 44.99],
      ['DRY ERASE MARKERS', 6.99, 10.99], ['DESK CALENDAR 2026', 9.99, 14.99],
      ['LEGAL PADS 6PK', 11.99, 15.99], ['STAPLER STANDARD', 12.99, 18.99],
      ['ENVELOPES #10 500CT', 13.99, 17.99],
    ],
  },
  {
    name: 'HOBBY HUTCH', addr: '17 OLD MILL LANE', phone: '(555) 590-2113',
    url: 'WWW.HOBBYHUTCHCHAT.COM', footer: 'HAVE A CRAFTY DAY',
    items: [
      ['YARN ACRYLIC TEAL', 3.49, 5.99], ['GLUE GUN MINI', 7.99, 11.99],
      ['GOOGLY EYES 500CT', 4.99, 7.99], ['FELT SHEETS ASST', 5.99, 8.99],
      ['MODEL PAINT OLIVE', 3.79, 5.49], ['PIPE CLEANERS 100PK', 2.99, 4.49],
      ['BALSA WOOD BUNDLE', 8.99, 13.99], ['GLITTER SHAKER GOLD', 3.99, 6.49],
      ['CANVAS PANEL 8X10', 2.49, 4.29],
    ],
  },
];

const DEFAULT_ITEMS = [
  'MILK 2% GALLON | 3.49', 'WONDER BREAD | 2.29', 'EGGS LARGE DOZ | 4.19',
  'BANANAS 2.14 LB | 1.26', 'ROTISSERIE CHICKEN | 5.99', 'PAPER TOWELS 6PK | 8.49',
  'CAT FOOD SALMON 12CT | 11.89', 'FROZEN PIZZA PEPPERONI | 4.79',
].join('\n');

/* ====================== dom + state ====================== */

const $ = id => document.getElementById(id);
const canvas = $('receipt');
const ctx = canvas.getContext('2d');

/* per-receipt numbers that aren't worth a knob; re-rolled by shuffle */
const sess = {
  reg: 2, cshr: 7, trn: 4821, last4: '4407',
  member: '4415 0092 118', balance: 1147, surveyCode: '7734 0518 22',
  printSeed: 12345,
};

function rollSession(rand) {
  sess.reg = 1 + Math.floor(rand() * 9);
  sess.cshr = 1 + Math.floor(rand() * 20);
  sess.trn = 1000 + Math.floor(rand() * 9000);
  sess.last4 = String(1000 + Math.floor(rand() * 9000));
  sess.member = [4000 + Math.floor(rand() * 6000), 100 + Math.floor(rand() * 9900), 100 + Math.floor(rand() * 900)]
    .map(String).join(' ');
  sess.balance = Math.floor(rand() * 4000);
  sess.surveyCode = [1000 + Math.floor(rand() * 9000), 1000 + Math.floor(rand() * 9000), 10 + Math.floor(rand() * 90)]
    .map(String).join(' ');
  sess.printSeed = newSeed();
}

/* ====================== layout ====================== */

const COLS = 42;          // characters per line at size 1
const DOT = 2;            // px per font pixel
const CH = 8 * DOT;       // char cell width
const PAD_X = 26, PAD_TOP = 30, PAD_BOT = 34, TEAR = 14;
const PAPER_W = COLS * CH + PAD_X * 2;
const LH1 = 21, LH2 = 40, GAP = 12, BAR_H = 50;

const money = n => n.toFixed(2);

function LR(left, right, cols = COLS) {
  const room = cols - right.length - 1;
  left = left.slice(0, Math.max(room, 0));
  return left + ' '.repeat(Math.max(cols - left.length - right.length, 1)) + right;
}

function CTR(t, cols = COLS) {
  t = t.slice(0, cols);
  return ' '.repeat(Math.max(Math.floor((cols - t.length) / 2), 0)) + t;
}

function autoDate() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${String(d.getFullYear()).slice(2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function parseItems() {
  const out = [];
  for (const raw of $('items').value.split('\n')) {
    if (!raw.trim()) continue;
    const bar = raw.lastIndexOf('|');
    const name = sanitize(bar >= 0 ? raw.slice(0, bar) : raw).trim().toUpperCase();
    const price = bar >= 0 ? parseFloat(raw.slice(bar + 1)) : NaN;
    if (name) out.push([name, isNaN(price) ? 0 : price]);
  }
  return out;
}

function buildLines() {
  const L = [];
  const put = (t, s = 1) => L.push({ t, s });
  const gap = () => L.push({ gap: GAP });
  const sep = ch => put(ch.repeat(COLS));

  const store = sanitize($('store').value).trim().toUpperCase() || 'STORE';
  const items = parseItems();
  const taxRate = Math.max(parseFloat($('tax').value) || 0, 0);
  const sub = items.reduce((a, [, p]) => a + p, 0);
  const tax = sub * taxRate / 100;
  const total = sub + tax;
  const dateStr = sanitize($('date').value).trim() || autoDate();

  put(CTR(store, Math.floor(COLS / 2)), 2);
  const addr = sanitize($('addr').value).trim().toUpperCase();
  const phone = sanitize($('phone').value).trim();
  if (addr) put(CTR(addr));
  if (phone) put(CTR(phone));
  gap();
  put(LR(dateStr, `REG ${String(sess.reg).padStart(2, '0')}`));
  put(LR(`CASHIER ${String(sess.cshr).padStart(2, '0')}`, `TRN ${sess.trn}`));
  sep('=');

  for (const [name, price] of items) put(LR(name, money(price)));
  if (!items.length) put(CTR('* NO SALE *'));
  sep('-');

  put(LR('SUBTOTAL', money(sub)));
  put(LR(`TAX ${taxRate.toFixed(2)}%`, money(tax)));
  put(LR('TOTAL', money(total), Math.floor(COLS / 2)), 2);
  gap();
  if ($('payment').value === 'cash') {
    const tender = Math.max(Math.ceil(total / 5) * 5, Math.ceil(total));
    put(LR('CASH', money(tender)));
    put(LR('CHANGE', money(tender - total)));
  } else {
    put(LR('CARD ****' + sess.last4, money(total)));
    put(LR('AUTH ' + String(sess.trn * 37 % 1000000).padStart(6, '0'), 'APPROVED'));
  }
  put(LR('ITEMS', String(items.length)));

  if ($('loyalty').checked) {
    sep('-');
    put('MEMBER ' + sess.member);
    put(LR('POINTS EARNED', String(Math.floor(total))));
    put(LR('POINTS BALANCE', String(sess.balance + Math.floor(total))));
    const saved = Math.floor(total * 6) / 100;
    if (saved >= 0.01) put(CTR(`YOU SAVED $${money(saved)} TODAY`));
  }

  if ($('survey').checked) {
    sep('-');
    put(CTR('TELL US HOW WE DID'));
    put(CTR('WIN A $500 GIFT CARD'));
    const st = STORES.find(s => s.name.toUpperCase() === store);
    put(CTR(st ? st.url : 'WWW.' + store.replace(/[^A-Z0-9]/g, '') + 'LISTENS.COM'));
    put(CTR('SURVEY CODE ' + sess.surveyCode));
  }

  if ($('barcode').checked) {
    gap();
    L.push({ bar: true });
    put(CTR(`0 ${sess.trn} 00${String(sess.trn * 7 % 1000).padStart(3, '0')} 8`));
  }

  const footer = sanitize($('footer').value).trim();
  if (footer) { gap(); put(CTR(footer.toUpperCase())); }

  return L;
}

const lineH = l => l.gap ? l.gap : l.bar ? BAR_H : l.s === 2 ? LH2 : LH1;
const measure = lines => TEAR + PAD_TOP + lines.reduce((a, l) => a + lineH(l), 0) + PAD_BOT + TEAR;

/* ====================== rendering ====================== */

function tearPath(rand, W, yBase, dir) {
  // one jagged edge: teeth 8-18px wide, up to TEAR-2 deep, drawn left to right
  const pts = [];
  let x = 0;
  while (x < W) {
    pts.push([x, yBase + dir * rand() * (TEAR - 2)]);
    x += 8 + rand() * 10;
  }
  pts.push([W, yBase + dir * rand() * (TEAR - 2)]);
  return pts;
}

function drawPaper(c, rand, W, H) {
  const top = tearPath(rand, W, TEAR, 1);
  const bot = tearPath(rand, W, H - TEAR, -1);

  c.beginPath();
  top.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  for (let i = bot.length - 1; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]);
  c.closePath();

  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, '#efece1');
  g.addColorStop(0.12, '#f8f6ef');
  g.addColorStop(0.85, '#f5f3ea');
  g.addColorStop(1, '#ebe8dc');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(60,50,30,0.18)';
  c.lineWidth = 1;
  c.stroke();

  c.save();
  c.clip();
  // paper speckle
  c.fillStyle = 'rgba(90,80,55,1)';
  const n = Math.floor(W * H / 700);
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.02 + rand() * 0.04;
    c.fillRect(rand() * W, rand() * H, 1 + rand(), 1);
  }
  // faint roller bands
  for (let i = 0; i < 4; i++) {
    c.globalAlpha = 0.03 + rand() * 0.04;
    c.fillStyle = rand() < 0.5 ? '#fff' : '#d8d2bf';
    c.fillRect(0, rand() * H, W, 2 + rand() * 3);
  }
  c.restore();
  c.globalAlpha = 1;
}

/* ink coverage at (x,y): 1 = solid print, 0 = didn't take */
function makeInkFn(rand, fade) {
  const p1 = rand() * 7, p2 = rand() * 7, p3 = rand() * 7;
  const streaks = [];
  const nStreaks = fade > 0.25 ? 1 + Math.floor(rand() * 3) : 0;
  for (let i = 0; i < nStreaks; i++) {
    streaks.push({ cx: PAD_X + rand() * COLS * CH, w: 3 + rand() * 9, d: 0.35 + rand() * 0.65 });
  }
  return (x, y) => {
    let ink = 1 - fade * 0.55;
    const patch = (Math.sin(x * 0.011 + p1) + Math.sin(y * 0.007 + p2) + Math.sin((x + y) * 0.005 + p3)) / 3;
    ink -= Math.max(patch, 0) * fade * 0.9;
    for (const s of streaks) {
      const d = (x - s.cx) / s.w;
      ink -= s.d * fade * 1.4 * Math.exp(-d * d);
    }
    return ink;
  };
}

function drawDotText(c, str, xLeft, yTop, size, inkAt, rand) {
  const cell = DOT * size, r = 0.62 * cell;
  c.fillStyle = '#232126';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code <= 32 || code > 126) continue;
    const o = (code - 32) * 8;
    const gx = xLeft + i * 8 * cell;
    for (let row = 0; row < 8; row++) {
      const bits = GLYPHS[o + row];
      if (!bits) continue;
      for (let col = 0; col < 8; col++) {
        if (!(bits & (128 >> col))) continue;
        const dx = gx + col * cell + cell / 2, dy = yTop + row * cell + cell / 2;
        const a = inkAt(dx, dy) * (0.68 + rand() * 0.32);
        if (a < 0.1) continue;
        c.globalAlpha = Math.min(a, 1);
        c.beginPath();
        c.arc(dx + (rand() - 0.5) * 0.6, dy + (rand() - 0.5) * 0.6, r, 0, 7);
        c.fill();
      }
    }
  }
  c.globalAlpha = 1;
}

function drawBarcode(c, y, inkAt, rand) {
  const bars = mulberry32(sess.trn); // stable per receipt, independent of reprint noise
  const width = Math.floor(COLS * CH * 0.72);
  let x = PAD_X + Math.floor((COLS * CH - width) / 2);
  const xEnd = x + width;
  c.fillStyle = '#232126';
  while (x < xEnd) {
    const w = (1 + Math.floor(bars() * 3)) * 2;
    for (let px = x; px < Math.min(x + w, xEnd); px += 2) {
      const a = inkAt(px, y) * (0.75 + rand() * 0.25);
      if (a >= 0.1) {
        c.globalAlpha = Math.min(a, 1);
        c.fillRect(px, y, 2, BAR_H - 8);
      }
    }
    x += w + 2 + Math.floor(bars() * 2) * 2;
  }
  c.globalAlpha = 1;
}

function render(c, lines, H) {
  const rand = mulberry32(sess.printSeed);
  const fade = (parseFloat($('fade').value) || 0) / 100;
  drawPaper(c, rand, PAPER_W, H);
  const inkAt = makeInkFn(rand, fade);

  let y = TEAR + PAD_TOP;
  for (const l of lines) {
    if (l.bar) drawBarcode(c, y, inkAt, rand);
    else if (l.t !== undefined) {
      const h = lineH(l);
      drawDotText(c, l.t, PAD_X, y + Math.floor((h - 8 * DOT * l.s) / 2), l.s, inkAt, rand);
    }
    y += lineH(l);
  }
}

function redraw() {
  const lines = buildLines();
  const H = measure(lines);
  canvas.width = PAPER_W;
  canvas.height = H;
  render(ctx, lines, H);
}

/* ====================== shuffle + wiring ====================== */

function shuffle() {
  const rand = mulberry32(newSeed());
  const store = STORES[Math.floor(rand() * STORES.length)];
  rollSession(rand);
  $('store').value = store.name;
  $('addr').value = store.addr;
  $('phone').value = store.phone;
  $('footer').value = store.footer;
  $('payment').value = rand() < 0.5 ? 'cash' : 'card';
  const pool = store.items.slice();
  const n = 4 + Math.floor(rand() * 6);
  const picked = [];
  while (picked.length < n && pool.length) {
    const [name, lo, hi] = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    picked.push(`${name} | ${money(lo + rand() * (hi - lo))}`);
  }
  $('items').value = picked.join('\n');
  redraw();
}

function download() {
  const scale = parseInt($('scale').value, 10);
  const lines = buildLines();
  const H = measure(lines);
  const out = document.createElement('canvas');
  out.width = PAPER_W * scale;
  out.height = H * scale;
  const c = out.getContext('2d');
  c.scale(scale, scale);
  render(c, lines, H);
  const a = document.createElement('a');
  const slug = ($('store').value.trim() || 'receipt').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  a.download = `receipt-${slug || 'receipt'}.png`;
  a.href = out.toDataURL('image/png');
  a.click();
}

for (const id of ['store', 'addr', 'phone', 'date', 'tax', 'payment', 'loyalty', 'survey', 'barcode', 'footer', 'items']) {
  $(id).addEventListener('input', redraw);
}
$('fade').addEventListener('input', () => { $('fadeVal').textContent = $('fade').value; redraw(); });
canvas.addEventListener('click', () => { sess.printSeed = newSeed(); redraw(); });
$('shuffle').addEventListener('click', shuffle);
$('download').addEventListener('click', download);

/* curated first receipt; the button randomizes */
rollSession(mulberry32(20260831));
const first = STORES[0];
$('store').value = first.name;
$('addr').value = first.addr;
$('phone').value = first.phone;
$('footer').value = first.footer;
$('items').value = DEFAULT_ITEMS;
redraw();

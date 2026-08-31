# generators

Small web-based text/image generators in the spirit of [deathgenerator.com](https://deathgenerator.com)
and [PhotoFunia's retro-wave effect](https://photofunia.com/categories/all_effects/retro-wave):
type some text, tweak settings, get a rendered image. Fully digital/procedural —
no heavy photo processing of real photos.

The root `index.html` is a gallery page linking to every generator — open it
locally or serve the repo with GitHub Pages and it becomes the site's front
door (thumbnails live in `assets/`). Built so far (each folder is
self-contained; its `index.html` also opens directly):

- **`split-flap/`** — airport split-flap departures board. Knobs: board title,
  clock (auto or fixed), flight list, white/yellow letters, black airport vs
  ivory railway flaps, color-coded remarks, flip sound, PNG export at 2x.
- **`sierra-death/`** — Sierra death dialog, 320x200 EGA. Knobs: AGI style
  (white box, red border, "Press ENTER") vs SCI0 style (drop shadow, title
  bar, Restore/Restart/Quit buttons), box width, status line, procedural
  backgrounds (desert, night, solids), PNG export 1-4x. Contains the reusable
  bitmap-font engine (public-domain font8x8 data + drawText/wrap).
- **`thermal-receipt/`** — fake till receipt. Knobs: store/address/phone,
  date, item list, tax rate, cash vs card, loyalty points, survey invite,
  barcode, print fade, footer line, PNG export 1-3x. Reuses the font8x8
  glyph data but prints each pixel as a thermal dot; paper, torn edges,
  fade streaks and barcode are procedural.
- **`teletext/`** — Ceefax-style page, 40x25 cells, seven colours. Inline
  tokens ({r}, {gy}, {dh}, {nb}, {fl}...) map to spacing attributes and
  cost one cell each like real teletext; mosaic blocks, double height,
  flash (animated on screen, steady in export), auto header clock, fastext
  row, CRT scanline/glow toggle, six preset pages, PNG export 1-3x.

The rest of this README is the planning notes.

## How these work behind the scenes

**Game screens (deathgenerator style).** Background screenshot + the game's font
ripped as a glyph spritesheet. Draw the background to a canvas, blit text
character-by-character with `drawImage`. Word wrap, tinting, box resizing are
arithmetic on top. Runs entirely client-side. Per-generator cost is asset prep
(clean background, ripped font), not code — the engine is reusable.

**Styled typography (retro-wave style).** Layer compositing: fixed background,
then text layers each with their own treatment. The chrome effect is a vertical
gradient clipped to the text shape, plus outline and an RGB-offset glitch copy.
All doable in canvas (`fillText`, gradient fills, `shadowBlur`, compositing
modes) or SVG. No server needed.

**Text on physical surfaces (hard tier).** Render text flat, warp with a
perspective transform or displacement map, composite with a pre-baked
lighting/shadow layer (multiply/overlay) so it picks up the surface's
highlights. Flat planes are fine in CSS 3D or a small WebGL quad; curved or
textured surfaces need hand-made displacement maps per template.

## Complexity tiers

1. **Procedural documents** — pure HTML/CSS or canvas, no source artwork,
   infinite knobs. (The fake cargo manifest from an earlier session is this tier.)
2. **Bitmap font on fixed background** — deathgenerator territory. Easy code,
   moderate asset prep per template, pixel-perfect results.
3. **Styled vector typography with effects** — retro-wave posters, neon signs,
   title cards. Web fonts + canvas/SVG effects; the skill is matching the look.
4. **CRT/screen simulation** — tier 2/3 plus a WebGL shader pass (scanlines,
   phosphor glow, barrel distortion). One-time shader cost, reusable forever,
   and the shader parameters make great user-facing knobs.
5. **Flat-perspective composites** — text warped onto a photographed sign,
   ticket, label. One perspective transform + lighting overlay.
6. **Curved/textured surface composites** — engraving, embossing, fabric.
   Hand-made displacement maps per template. Avoid unless an idea demands it.

## Idea backlog

- ~~**Sierra AGI/SCI death dialog**~~ — **built**, see `sierra-death/`. The
  bitmap-font engine (glyph data + drawText + word wrap) lives at the top of
  its `app.js`, ready to lift into later game-screen generators.
- ~~**Airport split-flap departures board**~~ — **built**, see `split-flap/`.
  Fully procedural; each flap is a rendered character cell with a seam and
  shading, and the flip is animated. Not done from the original idea: LED era
  variant.
- ~~**Thermal receipt**~~ — **built**, see `thermal-receipt/`. Fake store,
  fake items, loyalty nonsense, dot-matrix font, paper grain, torn edge.
- ~~**Teletext/Ceefax page**~~ — **built**, see `teletext/`. Strict 40x25
  grid, mosaic graphics, seven colors.
- **Arcade high-score / attract screen** — "INSERT COIN", rank table, initials,
  with the CRT shader. Tier 4 but the shader is reusable.
- **Cassette J-card / VHS rental label** — tracklist, store stamp,
  "BE KIND REWIND". Tier 1-3.
- **LucasArts SCUMM dialog/verb bar** — floating dialog lines or the verb grid.
  Fonts documented by the ScummVM community. Tier 2.
- **Sierra title screen generator (Police Quest II case study)** — see below.
  Tier ~2.5.

## Notes: Sierra title screens (PQ2 case study)

Title logos aren't fonts — they're hand-drawn lettering containing only the
letters the title uses. The alphabet gap is the real problem, not the rendering.

For PQ2 specifically, the
[PC-98 sprite rip](https://www.spriters-resource.com/nec_pc_9801/policequestii/asset/154702/)
closes most of the gap:

- The title gives P O L I C E Q U S T, at multiple sizes (zoom-in animation
  frames — exportable as a GIF feature).
- The credits screen uses the same chrome lettering for PROGRAMMING,
  ART-ANIMATION, MUSIC BY, SYSTEM DEVELOPMENT, PROJECT COORDINATOR, EXECUTIVE
  PRODUCER, PC-9801 CONVERSION, DIALOG TRANSLATOR, SPECIAL THANKS TO — adding
  A B D G H J K M N R V Y and digits 0 1 8 9.
- Missing: roughly F W X Z and some digits. The style is systematic (blocky
  letterforms, vertical chrome gradient in horizontal bands, black outline,
  drop shadow), so drawing the gaps to match is about an hour of pixel art.

Two approaches:

1. **Authentic rip + patch** — slice glyphs from the sheet (scripted bounding-box
   extraction), hand-draw missing letters, spritesheet + metrics JSON. Pixel-
   perfect PQ2 only.
2. **Procedural chrome** — the chrome is just a per-scanline palette ramp
   applied to a blocky letterform, plus outline and shadow. Apply it in code to
   any pixel font. Less PQ2-faithful, but any text, any size, and the palette
   ramp becomes a knob (one ramp per Sierra game's look).

Preferred: hybrid. Real glyphs where they exist, procedural recolorer for
palette swaps, procedural background (the black field with horizontal blue
lines is a few lines of code, and spacing/colors are free knobs).

Caveat: the rip is the PC-98 version (640x400, dithered); the iconic title is
the DOS version (320x200 EGA, cleaner). Pick one — probably DOS.

## Candidate first builds

Split-flap departures board (most original, nobody has done it with real knobs)
or the Sierra death dialog (cheapest path to the reusable bitmap-font engine).

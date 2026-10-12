#!/usr/bin/env python3
"""Convert a TTF/OTF into the typeface JSON that three.js's Font class reads.

    python3 tools/ttf2typeface.py Some-Font.ttf fonts/somefont.json [--name NAME] [--wght 700]

--name renames the converted font. Use it for any font whose licence has a
Reserved Font Name (Liberation, for one): a converted, cut-down copy counts
as a modified version, which mustn't go by the reserved name. --wght picks
a weight from a variable font.

Outline commands follow three's FontLoader: "m x y", "l x y",
"q x y cpx cpy" (end point first), "b x y c1x c1y c2x c2y", "z".
Adds a "kern" map ("AV": -80, font units) built from the GPOS pair
lookups (or the old kern table), for printable ASCII pairs only.
Needs fontTools, which is already installed on the VM.
"""
import argparse
import json

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

CHARS = [chr(c) for c in range(32, 127)] + [chr(c) for c in range(161, 256)] + list("‘’“”–—…•™€")
KERN_CHARS = [chr(c) for c in range(33, 127)]


def n(v):
    v = round(v, 1)
    return str(int(v)) if v == int(v) else str(v)


class TypefacePen(BasePen):
    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.cmds = []

    def _moveTo(self, p):
        self.cmds += ["m", n(p[0]), n(p[1])]

    def _lineTo(self, p):
        self.cmds += ["l", n(p[0]), n(p[1])]

    def _qCurveToOne(self, c, p):
        self.cmds += ["q", n(p[0]), n(p[1]), n(c[0]), n(c[1])]

    def _curveToOne(self, c1, c2, p):
        self.cmds += ["b", n(p[0]), n(p[1]), n(c1[0]), n(c1[1]), n(c2[0]), n(c2[1])]

    def _closePath(self):
        self.cmds.append("z")


def pair_value(rec):
    v = getattr(rec, "Value1", None)
    return getattr(v, "XAdvance", 0) or 0 if v is not None else 0


def gpos_kerning(font, wanted):
    """{(leftGlyph, rightGlyph): xAdvance} for glyph names in `wanted`."""
    pairs = {}
    if "GPOS" not in font:
        return pairs
    gpos = font["GPOS"].table
    if not gpos.LookupList:
        return pairs
    kern_lookups = set()
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag == "kern":
            kern_lookups.update(fr.Feature.LookupListIndex)
    for li in sorted(kern_lookups):
        lookup = gpos.LookupList.Lookup[li]
        if lookup.LookupType not in (2, 9):
            continue
        for st in lookup.SubTable:
            if lookup.LookupType == 9:
                if st.ExtensionLookupType != 2:
                    continue
                st = st.ExtSubTable
            cov = st.Coverage.glyphs
            if st.Format == 1:
                for i, left in enumerate(cov):
                    if left not in wanted:
                        continue
                    for pvr in st.PairSet[i].PairValueRecord:
                        if pvr.SecondGlyph in wanted:
                            pairs.setdefault((left, pvr.SecondGlyph), pair_value(pvr))
            elif st.Format == 2:
                cd1 = st.ClassDef1.classDefs
                cd2 = st.ClassDef2.classDefs
                rights = [g for g in wanted]
                for left in cov:
                    if left not in wanted:
                        continue
                    row = st.Class1Record[cd1.get(left, 0)]
                    for right in rights:
                        v = pair_value(row.Class2Record[cd2.get(right, 0)])
                        if v:
                            pairs.setdefault((left, right), v)
    return pairs


def old_kerning(font, wanted):
    pairs = {}
    if "kern" not in font:
        return pairs
    for t in font["kern"].kernTables:
        for (l, r), v in getattr(t, "kernTable", {}).items():
            if l in wanted and r in wanted:
                pairs.setdefault((l, r), v)
    return pairs


def main(src, dst, name=None, wght=None):
    font = TTFont(src)
    cmap = font.getBestCmap()
    gs = font.getGlyphSet(location={"wght": wght} if wght else None)
    upem = font["head"].unitsPerEm
    glyphs = {}
    for ch in CHARS:
        gname = cmap.get(ord(ch))
        if not gname:
            continue
        pen = TypefacePen(gs)
        gs[gname].draw(pen)
        xs = [float(pen.cmds[i + 1]) for i, c in enumerate(pen.cmds) if c in ("m", "l", "q", "b")]
        glyphs[ch] = {
            "ha": round(gs[gname].width),
            "x_min": round(min(xs)) if xs else 0,
            "x_max": round(max(xs)) if xs else 0,
            "o": " ".join(pen.cmds),
        }

    name_to_char = {cmap[ord(c)]: c for c in KERN_CHARS if ord(c) in cmap}
    raw = gpos_kerning(font, name_to_char) or old_kerning(font, name_to_char)
    kern = {name_to_char[l] + name_to_char[r]: v for (l, r), v in raw.items() if v}

    head, hhea, post = font["head"], font["hhea"], font["post"]
    names = font["name"]
    data = {
        "glyphs": glyphs,
        "familyName": name or names.getDebugName(1),
        "ascender": hhea.ascent,
        "descender": hhea.descent,
        "underlinePosition": post.underlinePosition,
        "underlineThickness": post.underlineThickness,
        "boundingBox": {"xMin": head.xMin, "yMin": head.yMin, "xMax": head.xMax, "yMax": head.yMax},
        "resolution": upem,
        "kern": kern,
        "original_font_information": {
            "copyright": names.getDebugName(0),
            "license": names.getDebugName(13),
            "license_url": names.getDebugName(14),
        },
    }
    with open(dst, "w") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
    print(f"{dst}: {len(glyphs)} glyphs, {len(kern)} kern pairs")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--name")
    ap.add_argument("--wght", type=float)
    a = ap.parse_args()
    main(a.src, a.dst, a.name, a.wght)

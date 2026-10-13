#!/usr/bin/env python3
"""Build the texture files of Apsis.

Run this script from any directory:

    python3 -I tools/textures/build_textures.py [--only ID [ID ...]] [--manifest-only]
                                                [--fetch-missing] [--docs-only]

Input:
    data-src/textures/sources.json      the list of sources (written by hand)
    data-src/textures/original/         the original files, exactly as downloaded

Output:
    public/textures/<id>.jpg            2048 x 1024 JPEG, quality 85, sRGB
    public/textures/sm/<id>.jpg         1024 x 512 JPEG
    public/textures/manifest.json       source and licence of each file
    docs/ASSETS.md                      a table made from the manifest

The star map is larger (4096 x 2048 and 2048 x 1024). The ring strip stays a PNG file.

The script uses only the Python standard library and the macOS tool `sips`.
The original files are untrusted data. The script reads them only as images.
It never executes anything from them.

Options:
    --only ID ...      build the images of these ids only (the manifest still lists all ids)
    --manifest-only    build no image; write the manifest and docs/ASSETS.md again
    --fetch-missing    download an original file again when it is absent (checks the sha256)
    --docs-only        write docs/ASSETS.md from the manifest that is on disk, and stop

The manifest has these fields beyond the basic list: `conventions` (top level), and per
texture `licenceStatement` (the words of the source about the licence) and `note`.

Fields of one entry of sources.json:
    id, body, role, original, sha256, title, downloadUrl, centerLongitudeDeg, longitudeNote,
    coverage                 required
    author, licence, licenceUrl, sourceUrl, licenceStatement
                             required, in the entry or in its group (`group` names the group);
                             the licence statement of the entry goes before that of the group
    projection               default "equirectangular"
    coordinates              for the star map
    width, height, smallWidth, smallHeight
                             output size, default 2048 x 1024 and 1024 x 512
    prepare                  name of a special preparation step (see PREPARE)
    extraChanges             one more sentence for `changes`, without its subject
                             (for example "removes scan marks at the right edge.")
    note                     free text for the manifest
"""
import hashlib
import json
import re
import shutil
import struct
import subprocess
import sys
import urllib.request
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "data-src" / "textures" / "sources.json"
ORIGINAL = ROOT / "data-src" / "textures" / "original"
PUBLIC = ROOT / "public"
OUT = PUBLIC / "textures"
OUT_SM = OUT / "sm"
MANIFEST = OUT / "manifest.json"
ASSETS_MD = ROOT / "docs" / "ASSETS.md"
CACHE = ROOT / ".cache" / "textures"
SRGB_ICC = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"
JPEG_QUALITY = "85"

FORMAT_NAMES = {".jpg": "JPEG", ".jpeg": "JPEG", ".tif": "TIFF", ".tiff": "TIFF", ".png": "PNG", ".exr": "OpenEXR"}

SPACECRAFT_HEADING = "## Spacecraft models"
SPACECRAFT_DEFAULT = SPACECRAFT_HEADING + "\n\nSee the section that the spacecraft model work adds.\n"


def fail(msg):
    sys.stderr.write("ERROR: " + msg + "\n")
    raise SystemExit(1)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def sips(args):
    """Run sips and return its standard output. Stop on any failure."""
    r = subprocess.run(["sips"] + [str(a) for a in args], capture_output=True, text=True)
    if r.returncode != 0:
        fail("sips failed: %s\n%s\n%s" % (" ".join(str(a) for a in args), r.stdout, r.stderr))
    return r.stdout


def image_props(path):
    """Return width, height, colour space, profile name and alpha flag of an image file."""
    out = sips(["-g", "pixelWidth", "-g", "pixelHeight", "-g", "space", "-g", "profile", "-g", "hasAlpha", path])
    props = {}
    for line in out.splitlines():
        m = re.match(r"^\s+(\w+): (.*)$", line)
        if m:
            props[m.group(1)] = m.group(2).strip()
    if "pixelWidth" not in props:
        fail("sips cannot read %s" % path)
    return {
        "width": int(props["pixelWidth"]),
        "height": int(props["pixelHeight"]),
        "space": props.get("space", ""),
        "profile": props.get("profile", ""),
        "alpha": props.get("hasAlpha", "no") == "yes",
    }


def make_jpeg(src, dst, width, height):
    """Resize to width x height, convert to sRGB, write a JPEG file."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    sips(["-m", SRGB_ICC, "-s", "format", "jpeg", "-s", "formatOptions", JPEG_QUALITY,
          "-z", height, width, src, "--out", dst])
    p = image_props(dst)
    if (p["width"], p["height"]) != (width, height):
        fail("%s has size %sx%s, expected %sx%s" % (dst, p["width"], p["height"], width, height))
    if p["space"] != "RGB" or "Linear" in p["profile"]:
        fail("%s is not an sRGB file (space %s, profile %s)" % (dst, p["space"], p["profile"]))


# ---------------------------------------------------------------------------
# Special preparation steps
# ---------------------------------------------------------------------------

def read_plain_rgb_tiff(path):
    """Read an uncompressed 8-bit RGB TIFF with one strip. Return (width, height, pixel bytes)."""
    b = path.read_bytes()
    if b[:2] == b"II":
        bo = "<"
    elif b[:2] == b"MM":
        bo = ">"
    else:
        fail("%s is not a TIFF file" % path)
    if struct.unpack(bo + "H", b[2:4])[0] != 42:
        fail("%s is not a classic TIFF file" % path)
    off = struct.unpack(bo + "I", b[4:8])[0]
    n = struct.unpack(bo + "H", b[off:off + 2])[0]
    tags = {}
    for i in range(n):
        e = b[off + 2 + 12 * i: off + 14 + 12 * i]
        tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
        if typ == 3 and cnt == 1:
            tags[tag] = struct.unpack(bo + "H", e[8:10])[0]
        elif typ == 4 and cnt == 1:
            tags[tag] = struct.unpack(bo + "I", e[8:12])[0]
        else:
            tags[tag] = None
    w, h = tags.get(256), tags.get(257)
    if tags.get(259) != 1 or tags.get(277) != 3 or tags.get(284, 1) != 1 or tags.get(262) != 2:
        fail("%s: unexpected TIFF layout" % path)
    start, count = tags.get(273), tags.get(279)
    if not w or not h or start is None or count != w * h * 3:
        fail("%s: unexpected TIFF strips" % path)
    return w, h, bytearray(b[start:start + count])


def write_png_rgb(path, w, h, rgb):
    """Write 8-bit RGB pixels as a PNG file."""
    stride = w * 3
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += rgb[y * stride:(y + 1) * stride]

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
           + chunk(b"IEND", b""))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


def prepare_deimos_scan_marks(src, dst):
    """Remove the scan marks of the Deimos map.

    The original file is a scan of a printed map. It has these marks:
    a black wedge at the top right corner, a short dark line at the right edge near row 159,
    a fragment of the label "180" and a tick mark at the right edge near the equator,
    a dark line along the last column, and a dark line along the last row.
    The repair replaces each mark by a linear blend between the pixel to the left of the mark
    and the first pixel of the same row (the map wraps around at 180 degrees).
    """
    w, h, px = read_plain_rgb_tiff(src)
    if (w, h) != (1440, 720):
        fail("%s: unexpected size %sx%s" % (src, w, h))

    def blend_to_wrap(y0, y1, x0):
        span = w - x0 + 1
        for y in range(y0, y1):
            row = y * w * 3
            for c in range(3):
                a = px[row + (x0 - 1) * 3 + c]
                z = px[row + c]
                for x in range(x0, w):
                    t = (x - x0 + 1) / span
                    px[row + x * 3 + c] = int(round(a + (z - a) * t))

    blend_to_wrap(0, 34, 1404)      # black wedge at the top right corner
    blend_to_wrap(157, 162, 1424)   # short dark line at the right edge
    blend_to_wrap(341, 364, 1428)   # label fragment and tick mark at the right edge
    blend_to_wrap(0, h, 1439)       # dark last column
    last = (h - 1) * w * 3
    px[last:last + w * 3] = px[last - w * 3:last]  # dark last row: copy the row above
    write_png_rgb(dst, w, h, px)


PREPARE = {"deimos_scan_marks": prepare_deimos_scan_marks}


# ---------------------------------------------------------------------------
# Sources
# ---------------------------------------------------------------------------

def load_sources():
    data = json.loads(SOURCES.read_text(encoding="utf-8"))
    groups = data.get("groups", {})
    entries = []
    seen = set()
    for t in data["textures"]:
        group = groups.get(t.get("group", ""), {})
        e = dict(group)
        e.update(t)
        # the licence statement of the entry comes first, then the statement of its group
        e["licenceStatement"] = " ".join(s for s in (t.get("licenceStatement"), group.get("licenceStatement")) if s)
        for key in ("id", "body", "role", "original", "sha256", "title", "author", "licence", "licenceUrl",
                    "licenceStatement", "sourceUrl", "downloadUrl", "longitudeNote", "coverage"):
            if not e.get(key):
                fail("sources.json: entry %s has no %s" % (t.get("id"), key))
        if "centerLongitudeDeg" not in e:
            fail("sources.json: entry %s has no centerLongitudeDeg" % e["id"])
        if e["id"] in seen:
            fail("sources.json: duplicate id %s" % e["id"])
        seen.add(e["id"])
        entries.append(e)
    return data, entries


def fetch_original(e, path):
    """Download one original file again and check its sha256."""
    ua = "ApsisAssetFetch/1.0 (local build script)"
    part = path.with_name(path.name + ".part")
    req = urllib.request.Request(e["downloadUrl"], headers={"User-Agent": ua})
    print("  download %s" % e["downloadUrl"])
    with urllib.request.urlopen(req, timeout=600) as r, open(part, "wb") as f:
        shutil.copyfileobj(r, f, 1 << 20)
    got = sha256_of(part)
    if got != e["sha256"]:
        fail("%s: the downloaded file has sha256 %s, expected %s (the file stays at %s)" % (e["id"], got, e["sha256"], part))
    part.rename(path)


def changes_text(e, orig, out_w, out_h, is_ring):
    """Describe the changes in simple sentences (active voice, present tense)."""
    ext = Path(e["original"]).suffix.lower()
    fmt = FORMAT_NAMES.get(ext, ext.lstrip(".").upper())
    if is_ring:
        return "The build copies the original PNG file without change. The small version has half the size."
    parts = []
    ow, oh = orig["width"], orig["height"]
    if (ow, oh) != (out_w, out_h):
        verb = "enlarges" if ow < out_w else "resizes"
        parts.append("%s the image from %d x %d to %d x %d pixels." % (verb, ow, oh, out_w, out_h))
    if fmt == "JPEG":
        parts.append("encodes the image again as JPEG (quality %s)." % JPEG_QUALITY)
    else:
        parts.append("converts the image from %s to JPEG (quality %s)." % (fmt, JPEG_QUALITY))
    if orig["space"] == "Gray":
        parts.append("converts the image from greyscale to sRGB colour.")
    elif "Linear" in orig["profile"]:
        parts.append("converts the image from linear light to the sRGB colour profile.")
    elif orig["profile"] in ("", "<nil>"):
        parts.append("tags the image with the sRGB colour profile.")
    if e.get("extraChanges"):
        parts.append(e["extraChanges"])
    return " ".join(("The build " if i == 0 else "It ") + p for i, p in enumerate(parts))


def build(only, fetch_missing):
    data, entries = load_sources()
    OUT_SM.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest = {"retrieved": data["retrieved"], "conventions": data.get("conventions", ""), "textures": [], "missing": data.get("missing", [])}
    for e in entries:
        tid = e["id"]
        src = ORIGINAL / e["original"]
        if not src.exists():
            if fetch_missing:
                fetch_original(e, src)
            else:
                fail("%s: the original file %s is absent (use --fetch-missing)" % (tid, src))
        digest = sha256_of(src)
        if digest != e["sha256"]:
            fail("%s: sha256 of %s is %s, expected %s" % (tid, src.name, digest, e["sha256"]))
        orig = image_props(src)
        is_ring = e["role"] == "ring"
        if is_ring:
            width, height = orig["width"], orig["height"]
            sm_w, sm_h = width // 2, (height + 1) // 2
            name = tid + ".png"
        else:
            width, height = e.get("width", 2048), e.get("height", 1024)
            sm_w, sm_h = e.get("smallWidth", 1024), e.get("smallHeight", 512)
            name = tid + ".jpg"
        dst, dst_sm = OUT / name, OUT_SM / name
        do_build = only is None or tid in only
        if do_build:
            print("build %-15s from %s (%dx%d, %s, %s)" % (tid, src.name, orig["width"], orig["height"], orig["space"], orig["profile"]))
            work = src
            if e.get("prepare"):
                work = CACHE / (tid + "_prepared.png")
                PREPARE[e["prepare"]](src, work)
            if is_ring:
                if not orig["alpha"]:
                    fail("%s: the ring file has no transparency" % tid)
                shutil.copyfile(src, dst)
                sips(["-z", sm_h, sm_w, src, "--out", dst_sm])
            else:
                make_jpeg(work, dst, width, height)
                make_jpeg(work, dst_sm, sm_w, sm_h)
        for p, (w, h) in ((dst, (width, height)), (dst_sm, (sm_w, sm_h))):
            if not p.exists():
                fail("%s: the output file %s is absent" % (tid, p))
            got = image_props(p)
            if (got["width"], got["height"]) != (w, h):
                fail("%s: %s has size %dx%d, expected %dx%d" % (tid, p, got["width"], got["height"], w, h))
            if is_ring and not got["alpha"]:
                fail("%s: %s has no transparency" % (tid, p))
        m = {
            "id": tid,
            "body": e["body"],
            "role": e["role"],
            "file": "textures/" + name,
            "small": "textures/sm/" + name,
            "width": width,
            "height": height,
            "projection": e.get("projection", "equirectangular"),
            "centerLongitudeDeg": e["centerLongitudeDeg"],
            "longitudeNote": e["longitudeNote"],
        }
        if e["role"] == "stars":
            m["coordinates"] = e.get("coordinates", "unknown")
        m.update({
            "coverage": e["coverage"],
            "title": e["title"],
            "author": e["author"],
            "licence": e["licence"],
            "licenceUrl": e["licenceUrl"],
            "sourceUrl": e["sourceUrl"],
            "downloadUrl": e["downloadUrl"],
            "originalFile": "data-src/textures/original/" + e["original"],
            "sha256": digest,
            "changes": changes_text(e, orig, width, height, is_ring),
        })
        m["licenceStatement"] = e["licenceStatement"]
        if e.get("note"):
            m["note"] = e["note"]
        manifest["textures"].append(m)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote %s (%d textures, %d missing)" % (MANIFEST.relative_to(ROOT), len(manifest["textures"]), len(manifest["missing"])))


# ---------------------------------------------------------------------------
# docs/ASSETS.md
# ---------------------------------------------------------------------------

def cell(text):
    return " ".join(str(text).split()).replace("|", "\\|")


def write_assets_md():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    lines = []
    lines.append("# Assets")
    lines.append("")
    lines.append("This page lists the assets of Apsis that come from other sources.")
    lines.append("A script writes the two texture sections of this page.")
    lines.append("The script is `tools/textures/build_textures.py`.")
    lines.append("It reads `public/textures/manifest.json`.")
    lines.append("Do not edit the two texture sections by hand.")
    lines.append("")
    lines.append("## Textures")
    lines.append("")
    lines.append("The table shows each published texture file.")
    lines.append("The file paths are relative to `public/`.")
    lines.append("Each file also has a small version in `public/textures/sm/`.")
    lines.append("The original files are in `data-src/textures/original/`.")
    lines.append("The licence evidence for each file is in `data-src/textures/evidence/`.")
    lines.append("The retrieval date of all files is %s." % manifest["retrieved"])
    lines.append("")
    lines.append("A file with the licence CC BY 4.0 needs a credit.")
    lines.append("It also needs a note about each change.")
    lines.append("This table gives both.")
    lines.append("NASA and the USGS ask for a credit for their public domain files.")
    lines.append("This table gives that credit too.")
    lines.append("The manifest field `licenceStatement` quotes the licence words of each source.")
    lines.append("")
    lines.append("| File | Body | Title | Author or credit | Licence | Source | Changes |")
    lines.append("|---|---|---|---|---|---|---|")
    for t in manifest["textures"]:
        lines.append("| `%s` | %s | %s | %s | %s | <%s> | %s |" % (
            cell(t["file"]), cell(t["body"]), cell(t["title"]), cell(t["author"]),
            "[%s](%s)" % (cell(t["licence"]), t["licenceUrl"]), t["sourceUrl"], cell(t["changes"])))
    lines.append("")
    lines.append("## Bodies with no texture")
    lines.append("")
    if manifest["missing"]:
        lines.append("The list shows each body that lacks a texture.")
        lines.append("")
        for m in manifest["missing"]:
            label = m["body"] + (" (%s map)" % m["role"] if m.get("role") else "")
            lines.append("- %s: %s" % (label, " ".join(m["reason"].split())))
    else:
        lines.append("Each body of the list has a texture.")
    lines.append("")
    text = "\n".join(lines) + "\n"
    tail = SPACECRAFT_DEFAULT
    if ASSETS_MD.exists():
        old = ASSETS_MD.read_text(encoding="utf-8")
        m = re.search(r"^" + re.escape(SPACECRAFT_HEADING) + r"[ \t]*$", old, flags=re.M)
        if m:
            tail = old[m.start():]
            if not tail.endswith("\n"):
                tail += "\n"
    ASSETS_MD.parent.mkdir(parents=True, exist_ok=True)
    ASSETS_MD.write_text(text + tail, encoding="utf-8")
    print("wrote %s" % ASSETS_MD.relative_to(ROOT))


def main():
    args = sys.argv[1:]
    only = None
    fetch_missing = False
    docs_only = False
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--only":
            only = set()
            i += 1
            while i < len(args) and not args[i].startswith("--"):
                only.add(args[i])
                i += 1
            if not only:
                fail("--only needs one id or more")
            continue
        if a == "--manifest-only":
            only = set()
        elif a == "--fetch-missing":
            fetch_missing = True
        elif a == "--docs-only":
            docs_only = True
        else:
            fail("unknown option %s" % a)
        i += 1
    if not docs_only:
        build(only, fetch_missing)
    write_assets_md()


if __name__ == "__main__":
    main()

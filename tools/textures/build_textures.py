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
    public/textures/lg/<id>.jpg         4096 x 2048 JPEG, quality 80, only for a map with a large original
                                        (see "Large files" below)
    public/textures/saturn_ring.png     2048 x 16 PNG with transparency (radial strip)
    public/textures/sm/saturn_ring.png  1024 x 8 PNG with transparency
    public/textures/manifest.json       source and license of each file
    docs/ASSETS.md                      a table made from the manifest

The star map is larger (4096 x 2048 and 2048 x 1024).

Large files:
    A map gets a third file in public/textures/lg/ if its original is at least 4000 pixels wide.
    The file is 4096 pixels wide, or as wide as the original if the original is narrower.
    Its height is half of its width. The script makes it from the same prepared image as the
    two other sizes, so the three sizes show the same repair, the same fill and the same colors.
    The ring strip has no large file. A map has none if its usual file is already that wide
    (the star map). The manifest gives the large file in the fields `large`, `largeWidth` and
    `largeHeight`.
    The top-level field `largeMaps` of sources.json can change the three numbers:
        minOriginalWidth    default 4000
        width               default 4096
        jpegQuality         default 80
    One entry can have its own size: see `largeWidth` below.
    The script does not delete a file. If a change of these numbers takes the large file of a
    map away, the script names the file that is left in public/textures/lg/.

JPEG quality:
    The quality numbers are the numbers of sips (its option formatOptions). They are not the
    numbers of most other JPEG tools. A comparison of the quantization tables gives these
    approximate equal values on the scale of the libjpeg tools: sips 85 is near 95, sips 80 is
    near 94, sips 65 is near 90 and sips 50 is near 80.

The script uses only the Python standard library and the macOS tool `sips`.
The original files are untrusted data. The script reads them only as images.
It never executes anything from them.

Options:
    --only ID ...      build the images of these ids only (the manifest still lists all ids)
    --manifest-only    build no image; write the manifest and docs/ASSETS.md again
    --fetch-missing    download an original file again when it is absent (checks the sha256)
    --docs-only        write docs/ASSETS.md from the manifest that is on disk, and stop

The manifest has these fields beyond the basic list: `conventions` and `sourcesNote` (top
level; `sourcesNote` is a list of sentences about the kinds of sources, and docs/ASSETS.md
prints them), and per texture `licenceStatement` (the words of the source about the license)
and `note`.
Some textures have more fields: see OPTIONAL_FIELDS, `zonalFill` and `ring` below.

Fields of one entry of sources.json:
    id, body, role, original, sha256, title, downloadUrl, centerLongitudeDeg, longitudeNote,
    coverage                 required
    author, licence, licenceUrl, sourceUrl, licenceStatement
                             required, in the entry or in its group (`group` names the group);
                             the license statement of the entry goes before that of the group
    projection               default "equirectangular"
    coordinates              for the star map
    width, height, smallWidth, smallHeight
                             output size, default 2048 x 1024 and 1024 x 512
    largeWidth, largeHeight  size of the large file of this entry (largeWidth 0: no large file);
                             without them the rule of "Large files" above decides
    prepare                  name of a special preparation step (see PREPARE)
    extraChanges             one more sentence for `changes`, without its subject
                             (for example "removes scan marks at the right edge.")
    changes                  the complete text of `changes` (replaces the sentences of the script)
    note                     free text for the manifest
    archiveMember            the original file is this member of the ZIP archive at downloadUrl
    latitudeType, colour, filters, observed, latitudeLimitsDeg
                             optional facts from the source; the script copies them to the manifest.
                             colour is one of: natural, near natural, enhanced, grey
                             (the field `conventions` of sources.json explains these words)
    zonalFill                for a map that covers only a band of latitudes (prepare "zonal_fill"):
                             validRows [first, last]   rows of the original with clean data
                             interpolateRows [[first, last], ...]   masked rows inside the band
                             meanRows, fadeDeg         see prepare_zonal_fill
                             The script writes `latitudeLimitsDeg`, `filledBands` and
                             `filledSharePercent` to the manifest.
    edgeColumns              for a map with black pixels (value 0) at its left or right edge
                             (prepare "edge_columns"): see prepare_edge_columns
    ring                     for the ring strip (role "ring"): see build_ring
"""
import hashlib
import json
import math
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
OUT_LG = OUT / "lg"
MANIFEST = OUT / "manifest.json"
ASSETS_MD = ROOT / "docs" / "ASSETS.md"
CACHE = ROOT / ".cache" / "textures"
SRGB_ICC = "/System/Library/ColorSync/Profiles/sRGB Profile.icc"
JPEG_QUALITY = "85"
# The large files (public/textures/lg/). The field `largeMaps` of sources.json can replace these numbers.
LARGE_DEFAULTS = {"minOriginalWidth": 4000, "width": 4096, "jpegQuality": 80}
USER_AGENT = "ApsisAssetFetch/1.0 (local build script)"

FORMAT_NAMES = {".jpg": "JPEG", ".jpeg": "JPEG", ".tif": "TIFF", ".tiff": "TIFF", ".png": "PNG", ".exr": "OpenEXR"}

# Optional fields that the script copies from sources.json to the manifest without change.
OPTIONAL_FIELDS = ("latitudeLimitsDeg", "latitudeType", "colour", "filters", "observed", "archiveMember")

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
    """Return width, height, color space, profile name and alpha flag of an image file."""
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


def make_jpeg(src, dst, width, height, quality=JPEG_QUALITY):
    """Resize to width x height, convert to sRGB, write a JPEG file with the given quality of sips."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    sips(["-m", SRGB_ICC, "-s", "format", "jpeg", "-s", "formatOptions", quality,
          "-z", height, width, src, "--out", dst])
    p = image_props(dst)
    if (p["width"], p["height"]) != (width, height):
        fail("%s has size %sx%s, expected %sx%s" % (dst, p["width"], p["height"], width, height))
    if p["space"] != "RGB" or "Linear" in p["profile"]:
        fail("%s is not an sRGB file (space %s, profile %s)" % (dst, p["space"], p["profile"]))


# ---------------------------------------------------------------------------
# Pixel access (standard library only)
# ---------------------------------------------------------------------------

def read_tiff_pixels(path):
    """Read an uncompressed 8-bit TIFF. Return (width, height, RGB bytes).

    The function reads these layouts: RGB (chunky or planar), palette and grayscale.
    It returns None for any other layout (for example a compressed file).
    """
    b = path.read_bytes()
    if b[:2] == b"II":
        bo = "<"
    elif b[:2] == b"MM":
        bo = ">"
    else:
        return None
    if struct.unpack(bo + "H", b[2:4])[0] != 42:
        return None
    off = struct.unpack(bo + "I", b[4:8])[0]
    n = struct.unpack(bo + "H", b[off:off + 2])[0]
    tags = {}
    for i in range(n):
        e = b[off + 2 + 12 * i: off + 14 + 12 * i]
        tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
        size = {1: 1, 3: 2, 4: 4}.get(typ)
        if size is None:
            continue
        if size * cnt <= 4:
            data = e[8:8 + size * cnt]
        else:
            pos = struct.unpack(bo + "I", e[8:12])[0]
            data = b[pos:pos + size * cnt]
        tags[tag] = list(struct.unpack(bo + {1: "B", 3: "H", 4: "I"}[typ] * cnt, data))
    try:
        w, h = tags[256][0], tags[257][0]
        photo = tags[262][0]
        offsets, counts = tags[273], tags[279]
    except KeyError:
        return None
    if tags.get(259, [1])[0] != 1 or any(v != 8 for v in tags.get(258, [8])):
        return None
    spp = tags.get(277, [1])[0]
    planar = tags.get(284, [1])[0]
    data = b"".join(b[o:o + c] for o, c in zip(offsets, counts))
    if photo == 2 and spp == 3 and planar == 1:
        rgb = bytearray(data[:w * h * 3])
    elif photo == 2 and spp == 3 and planar == 2:
        rgb = bytearray(w * h * 3)
        for c in range(3):
            rgb[c::3] = data[c * w * h:(c + 1) * w * h]
    elif photo == 3 and spp == 1 and 320 in tags:
        cmap = tags[320]
        k = len(cmap) // 3
        lut = [bytes((cmap[i] >> 8, cmap[k + i] >> 8, cmap[2 * k + i] >> 8)) for i in range(k)]
        rgb = bytearray(b"".join(lut[v] for v in data[:w * h]))
    elif photo == 1 and spp == 1:
        rgb = bytearray(w * h * 3)
        for c in range(3):
            rgb[c::3] = data[:w * h]
    else:
        return None
    if len(rgb) != w * h * 3:
        fail("%s: the TIFF file has too few pixel bytes" % path)
    return w, h, rgb


def read_bmp_pixels(path):
    """Read a 24-bit or 32-bit BMP file (as sips writes it). Return (width, height, RGB bytes)."""
    d = path.read_bytes()
    if d[:2] != b"BM":
        fail("%s is not a BMP file" % path)
    off = struct.unpack("<I", d[10:14])[0]
    w, h = struct.unpack("<ii", d[18:26])
    bpp = struct.unpack("<H", d[28:30])[0]
    comp = struct.unpack("<I", d[30:34])[0]
    if bpp not in (24, 32) or comp not in (0, 3):
        fail("%s: unexpected BMP layout (%d bits, compression %d)" % (path, bpp, comp))
    n = bpp // 8
    stride = (w * n + 3) & ~3
    top_down = h < 0
    h = abs(h)
    rgb = bytearray(w * h * 3)
    for y in range(h):
        sy = y if top_down else h - 1 - y
        row = d[off + sy * stride: off + sy * stride + w * n]
        # BMP stores blue, green, red
        rgb[y * w * 3 + 0:(y + 1) * w * 3:3] = row[2::n]
        rgb[y * w * 3 + 1:(y + 1) * w * 3:3] = row[1::n]
        rgb[y * w * 3 + 2:(y + 1) * w * 3:3] = row[0::n]
    return w, h, rgb


def load_pixels(src, name):
    """Return (width, height, RGB bytes) of an original file.

    The script reads a plain TIFF file itself. For any other file it asks sips for a BMP copy
    in the cache folder and reads that copy. sips does not change the pixel values in this step.
    """
    if src.suffix.lower() in (".tif", ".tiff"):
        got = read_tiff_pixels(src)
        if got is not None:
            return got
    CACHE.mkdir(parents=True, exist_ok=True)
    tmp = CACHE / (name + "_pixels.bmp")
    sips(["-s", "format", "bmp", src, "--out", tmp])
    return read_bmp_pixels(tmp)


def png_bytes(w, h, pixels, channels):
    """Encode 8-bit RGB (channels 3) or RGBA (channels 4) pixels as a PNG file."""
    stride = w * channels
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2 if channels == 3 else 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 6))
            + chunk(b"IEND", b""))


def write_png_rgb(path, w, h, rgb):
    """Write 8-bit RGB pixels as a PNG file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes(w, h, rgb, 3))


def write_png_rgba(path, w, h, rgba):
    """Write 8-bit RGBA pixels (straight alpha) as a PNG file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes(w, h, rgba, 4))


# ---------------------------------------------------------------------------
# Special preparation steps
# ---------------------------------------------------------------------------

def prepare_deimos_scan_marks(e, src, dst):
    """Remove the scan marks of the Deimos map.

    The original file is a scan of a printed map. It has these marks:
    a black wedge at the top right corner, a short dark line at the right edge near row 159,
    a fragment of the label "180" and a tick mark at the right edge near the equator,
    a dark line along the last column, and a dark line along the last row.
    The repair replaces each mark by a linear blend between the pixel to the left of the mark
    and the first pixel of the same row (the map wraps around at 180 degrees).
    """
    got = read_tiff_pixels(src)
    if got is None:
        fail("%s: unexpected TIFF layout" % src)
    w, h, px = got
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


def row_latitude(y, h):
    """Latitude in degrees of the upper edge of row y (row 0 starts at +90)."""
    return round(90.0 - y * 180.0 / h, 1)


def zonal_fill_info(e, h):
    """Return the manifest fields that describe the fill of a zonal map with h rows.

    `filledSharePercent` is the share of the surface that the fill covers. The script computes it
    for a sphere: a band between two latitudes has the share (sin north - sin south) / 2.
    """
    p = e["zonalFill"]
    y0, y1 = p["validRows"]
    rows = []
    if y0 > 0:
        rows.append((0, y0, "mean color of the nearest valid rows"))
    for ya, yb in p.get("interpolateRows", []):
        rows.append((ya, yb + 1, "linear blend between the valid rows above and below"))
    if y1 < h - 1:
        rows.append((y1 + 1, h, "mean color of the nearest valid rows"))
    bands = []
    total = 0.0
    for first, end, method in rows:
        north = math.radians(90.0 - first * 180.0 / h)
        south = math.radians(90.0 - end * 180.0 / h)
        share = (math.sin(north) - math.sin(south)) / 2 * 100
        total += share
        bands.append({"northDeg": row_latitude(first, h), "southDeg": row_latitude(end, h),
                      "sharePercent": round(share, 1), "method": method})
    return {"latitudeLimitsDeg": [row_latitude(y1 + 1, h), row_latitude(y0, h)],
            "filledBands": bands, "filledSharePercent": round(total, 1)}


def prepare_zonal_fill(e, src, dst):
    """Fill the rows of a zonal map (a gas planet) that have no clean data.

    The entry gives `zonalFill` with:
        validRows [first, last]     rows of the original image with clean data
        interpolateRows [[a, b]]    masked rows inside the valid band (for example the rings)
        meanRows                    number of valid rows for the mean color (default 4)
        fadeDeg                     width of the blend zone in degrees of latitude (default 5)
    A masked band inside the valid band becomes a linear blend, column by column, between the
    valid row above it and the valid row below it.
    A row outside the valid band takes the mean color of the nearest valid rows. Near the
    limit the fill blends from the nearest valid row to that mean color over `fadeDeg`.
    The script paints nothing else.
    """
    p = e["zonalFill"]
    w, h, px = load_pixels(src, e["id"])
    stride = w * 3
    y0, y1 = p["validRows"]
    mean_rows = p.get("meanRows", 4)
    fade_rows = max(1, int(round(p.get("fadeDeg", 5.0) * h / 180.0)))
    if not (0 <= y0 < y1 <= h - 1):
        fail("%s: zonalFill.validRows does not fit the image height %d" % (e["id"], h))

    for ya, yb in p.get("interpolateRows", []):
        if not (y0 < ya <= yb < y1):
            fail("%s: zonalFill.interpolateRows is outside the valid band" % e["id"])
        top = bytes(px[(ya - 1) * stride:ya * stride])
        bottom = bytes(px[(yb + 1) * stride:(yb + 2) * stride])
        span = yb - ya + 2
        for y in range(ya, yb + 1):
            t = (y - ya + 1) / span
            px[y * stride:(y + 1) * stride] = bytes(int(round(a + (z - a) * t)) for a, z in zip(top, bottom))

    def mean_colour(first):
        total = [0, 0, 0]
        for y in range(first, first + mean_rows):
            row = px[y * stride:(y + 1) * stride]
            for c in range(3):
                total[c] += sum(row[c::3])
        return [v / (mean_rows * w) for v in total]

    def fill(rows, edge_row, mean):
        edge = bytes(px[edge_row * stride:(edge_row + 1) * stride])
        for y in rows:
            k = max(0.0, 1.0 - abs(y - edge_row) / fade_rows)
            if k <= 0.0:
                line = bytes(int(round(v)) for v in mean) * w
            else:
                line = bytes(int(round(mean[i % 3] + (edge[i] - mean[i % 3]) * k)) for i in range(stride))
            px[y * stride:(y + 1) * stride] = line

    if y0 > 0:
        fill(range(0, y0), y0, mean_colour(y0))
    if y1 < h - 1:
        fill(range(y1 + 1, h), y1, mean_colour(y1 - mean_rows + 1))
    write_png_rgb(dst, w, h, px)


def prepare_edge_columns(e, src, dst):
    """Fill the black pixels in the first and last columns of a map.

    Some mosaics have a broken line of pixels with the value 0 (no data) at the left edge or at
    the right edge. After the resize this line shows as a dark line where the map wraps around.
    The entry gives `edgeColumns` with:
        columns     number of columns at each edge that the step looks at (default 8)
        reach       how far the step looks for a pixel with data, in columns (default 32)
    In these columns a pixel with the value 0 takes the value of the nearest pixel of the same
    row, toward the inside of the map, that is not 0. The step changes nothing else.
    """
    p = e.get("edgeColumns", {})
    n, reach = p.get("columns", 8), p.get("reach", 32)
    w, h, px = load_pixels(src, e["id"])
    if w < 2 * (n + reach):
        fail("%s: the image is too narrow for edgeColumns" % e["id"])
    filled = 0
    for y in range(h):
        row = y * w * 3
        for x in list(range(n - 1, -1, -1)) + list(range(w - n, w)):
            i = row + x * 3
            if px[i] or px[i + 1] or px[i + 2]:
                continue
            step = 3 if x < n else -3
            for k in range(1, reach + 1):
                j = i + step * k
                if px[j] or px[j + 1] or px[j + 2]:
                    px[i:i + 3] = px[j:j + 3]
                    filled += 1
                    break
    print("  edge columns of %s: %d pixels filled" % (e["id"], filled))
    write_png_rgb(dst, w, h, px)


PREPARE = {"deimos_scan_marks": prepare_deimos_scan_marks, "zonal_fill": prepare_zonal_fill,
           "edge_columns": prepare_edge_columns}


# ---------------------------------------------------------------------------
# Ring strip
# ---------------------------------------------------------------------------

def fit_line(points):
    """Least squares line y = a + b x through (x, y) points. Return (a, b)."""
    n = len(points)
    sx = sum(p[0] for p in points)
    sy = sum(p[1] for p in points)
    sxx = sum(p[0] * p[0] for p in points)
    sxy = sum(p[0] * p[1] for p in points)
    b = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    return (sy - b * sx) / n, b


def ring_axis_profile(w, h, px, axis, half_rows):
    """Mean color of each image column along the major axis of the ring ellipses.

    `axis` gives the row of the major axis at the first and at the last column. For each column
    the function averages the rows from (axis row - half_rows) to (axis row + half_rows).
    """
    ya, yb = axis["rowAtFirstColumn"], axis["rowAtLastColumn"]
    prof = []
    for x in range(w):
        yc = int(round(ya + (yb - ya) * x / (w - 1)))
        total = [0, 0, 0]
        for y in range(yc - half_rows, yc + half_rows + 1):
            p = (y * w + x) * 3
            total[0] += px[p]
            total[1] += px[p + 1]
            total[2] += px[p + 2]
        prof.append([v / (2 * half_rows + 1) for v in total])
    return prof


def smooth_profile(prof, columns):
    """Mean of the profile over `columns` neighboring columns (the window is shorter at the two ends)."""
    half = columns // 2
    w = len(prof)
    acc = [(0.0, 0.0, 0.0)]
    for p in prof:
        a = acc[-1]
        acc.append((a[0] + p[0], a[1] + p[1], a[2] + p[2]))
    out = []
    for x in range(w):
        lo, hi = max(0, x - half), min(w, x + half + 1)
        out.append([(acc[hi][c] - acc[lo][c]) / (hi - lo) for c in range(3)])
    return out


def resample_profile(prof, r0, scale, r_in, r_out, out_w):
    """Resample a profile to out_w pixels between the radii r_in and r_out (area-weighted mean).

    Image position x (pixel center at a whole number) has the radius r0 + scale * x.
    A pixel of the result that lies outside of the image is None.
    """
    w = len(prof)
    out = []
    for i in range(out_w):
        # edges of this output pixel in image coordinates (pixel x covers x - 0.5 .. x + 0.5)
        ua = (r_in + (r_out - r_in) * i / out_w - r0) / scale + 0.5
        ub = (r_in + (r_out - r_in) * (i + 1) / out_w - r0) / scale + 0.5
        ua, ub = max(0.0, ua), min(float(w), ub)
        if ub - ua <= 1e-9:
            out.append(None)
            continue
        total = [0.0, 0.0, 0.0]
        for x in range(int(ua), min(w - 1, int(ub)) + 1):
            part = min(ub, x + 1.0) - max(ua, float(x))
            if part > 0:
                for c in range(3):
                    total[c] += prof[x][c] * part
        out.append([v / (ub - ua) for v in total])
    return out


def ring_strip(prof, r0, scale, r_in, r_out, out_w, floor, hue_columns):
    """Make the strip of out_w pixels between the radii r_in and r_out from the axis profile.

    Return (list of RGBA tuples, largest brightness, number of pixels without image data).
    Alpha is the brightness (largest color channel) divided by the largest brightness of the
    strip. The color is the mean color of `hue_columns` image columns around the pixel, scaled
    so that its largest channel is the largest brightness of the strip. So color times alpha
    gives the brightness of the image again. The mean over some columns removes the color
    fringes that the image has at sharp ring edges. A pixel whose mean color is darker than
    `floor` takes the color of the nearest brighter pixel, because the hue of a very dark pixel
    is only noise.
    """
    obs = resample_profile(prof, r0, scale, r_in, r_out, out_w)
    hues = resample_profile(smooth_profile(prof, hue_columns), r0, scale, r_in, r_out, out_w)
    empty = sum(1 for c in obs if c is None)
    vmax = max(max(c) for c in obs if c is not None)
    good = [i for i, c in enumerate(hues) if c is not None and max(c) >= floor]
    out = []
    for i, c in enumerate(obs):
        alpha = 0.0 if c is None else max(c) / vmax
        hue = hues[i]
        if hue is None or max(hue) < floor:
            hue = hues[min(good, key=lambda g: abs(g - i))]
        k = vmax / max(hue)
        out.append((min(255, int(round(hue[0] * k))), min(255, int(round(hue[1] * k))),
                    min(255, int(round(hue[2] * k))), min(255, int(round(alpha * 255)))))
    return out, vmax, empty


def build_ring(e, src, dst, dst_sm, do_build):
    """Make the ring strip from an image of the rings and return the manifest fields.

    The entry gives `ring` with:
        axis            rowAtFirstColumn and rowAtLastColumn: the major axis of the ring ellipses
                        in the image (tools/textures/measure_ring.py measures it)
        halfRows        the strip averages 2 * halfRows + 1 rows around the axis
        calibration     features with their position x on the axis and their radius in km from a
                        published table; the features with "fit": true give the radius scale
        innerRadiusKm, outerRadiusKm, radiusSource
                        radius range of the strip (left edge and right edge)
        alphaSource     where the alpha channel comes from
        colourSource    where the color comes from
        width, height, smallWidth, smallHeight
        hueColumns      the color of a pixel is the mean color of this number of image columns
                        (an odd number; 1 = no mean)
        hueFloor        a pixel whose mean color is darker than this value (0 to 255) takes the
                        color of the nearest brighter pixel (default 12)
    """
    p = e["ring"]
    width, height = p.get("width", 2048), p.get("height", 16)
    sm_w, sm_h = p.get("smallWidth", width // 2), p.get("smallHeight", height // 2)
    cal = p["calibration"]
    r0, scale = fit_line([(c["x"], c["radiusKm"]) for c in cal if c.get("fit")])
    r_in, r_out = p["innerRadiusKm"], p["outerRadiusKm"]
    info = {
        "innerRadiusKm": r_in,
        "outerRadiusKm": r_out,
        "radiusSource": p["radiusSource"],
        "kmPerPixel": round((r_out - r_in) / width, 3),
        "alphaSource": p["alphaSource"],
        "colourSource": p["colourSource"],
        "radiusFit": {
            "kmPerSourcePixel": round(scale, 4),
            "radiusAtFirstSourceColumnKm": round(r0),
            "features": [{"feature": c["feature"], "sourceX": c["x"], "tableRadiusKm": c["radiusKm"],
                          "fitRadiusKm": round(r0 + scale * c["x"]),
                          "residualKm": round(r0 + scale * c["x"] - c["radiusKm"]),
                          "usedInFit": bool(c.get("fit"))} for c in cal],
        },
    }
    if do_build:
        w, h, px = load_pixels(src, e["id"])
        prof = ring_axis_profile(w, h, px, p["axis"], p["halfRows"])
        for path, ow, oh in ((dst, width, height), (dst_sm, sm_w, sm_h)):
            strip, vmax, empty = ring_strip(prof, r0, scale, r_in, r_out, ow, p.get("hueFloor", 12),
                                            p.get("hueColumns", 1))
            line = b"".join(bytes(c) for c in strip)
            write_png_rgba(path, ow, oh, line * oh)
            print("  ring strip %s: %d x %d, largest brightness %.1f, %d pixels without image data" % (
                path.name, ow, oh, vmax, empty))
    return width, height, sm_w, sm_h, info


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
        if t.get("group") and not group:
            fail("sources.json: entry %s names the unknown group %s" % (t.get("id"), t["group"]))
        e = dict(group)
        e.update(t)
        # the license statement of the entry comes first, then the statement of its group
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


def large_settings(data):
    """Return the numbers for the large files: LARGE_DEFAULTS, changed by the field `largeMaps` of sources.json."""
    settings = dict(LARGE_DEFAULTS)
    for key, value in data.get("largeMaps", {}).items():
        if key not in settings:
            fail("sources.json: largeMaps has the unknown field %s" % key)
        if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
            fail("sources.json: largeMaps.%s must be a whole number above 0" % key)
        settings[key] = value
    if settings["jpegQuality"] > 100:
        fail("sources.json: largeMaps.jpegQuality must not be above 100")
    return settings


def large_size(e, orig, width, settings):
    """Return (width, height) of the large file of an entry, or None if the entry has no large file.

    `orig` holds the size of the original and `width` is the width of the usual file.
    An entry can give its own size with `largeWidth` and `largeHeight` (largeWidth 0: no large file).
    Without them the map gets a large file if its original is at least settings["minOriginalWidth"]
    pixels wide. The file is settings["width"] pixels wide, or as wide as the original if the original is
    narrower (the width is then made even). The height is half of the width.
    The ring strip has no large file. A map has none if its usual file is already that wide.
    """
    if e["role"] == "ring":
        return None
    if "largeWidth" in e:
        if not e["largeWidth"]:
            return None
        return e["largeWidth"], e.get("largeHeight", e["largeWidth"] // 2)
    if orig["width"] < settings["minOriginalWidth"]:
        return None
    large_w = min(settings["width"], orig["width"])
    large_w -= large_w % 2
    if large_w <= width:
        return None
    return large_w, large_w // 2


def http_get(url, start=None, end=None):
    """Return the bytes of url, or of the byte range start..end (both inclusive)."""
    headers = {"User-Agent": USER_AGENT}
    if start is not None:
        headers["Range"] = "bytes=%d-%d" % (start, end)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=600) as r:
        if start is not None and r.status != 206:
            fail("%s: the server does not answer with a byte range" % url)
        return r.read()


def fetch_archive_member(url, member, part):
    """Download one member of a remote ZIP archive with HTTP range requests and unpack it.

    The function reads the central directory of the archive, then the bytes of the member only.
    It handles the methods "stored" and "deflate". It checks the CRC-32 of the archive.
    """
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT}, method="HEAD")
    with urllib.request.urlopen(req, timeout=120) as r:
        size = int(r.headers["Content-Length"])
    tail_len = min(size, 66000)
    tail = http_get(url, size - tail_len, size - 1)
    pos = tail.rfind(b"PK\x05\x06")
    if pos < 0:
        fail("%s: no ZIP directory" % url)
    cd_size, cd_off = struct.unpack("<II", tail[pos + 12:pos + 20])
    if cd_off == 0xFFFFFFFF or cd_size == 0xFFFFFFFF:
        fail("%s: ZIP64 archives are not supported" % url)
    cd = http_get(url, cd_off, cd_off + cd_size - 1)
    p = 0
    found = None
    while p < len(cd) and cd[p:p + 4] == b"PK\x01\x02":
        method = struct.unpack("<H", cd[p + 10:p + 12])[0]
        crc, csize, usize = struct.unpack("<III", cd[p + 16:p + 28])
        nlen, xlen, klen = struct.unpack("<HHH", cd[p + 28:p + 34])
        offset = struct.unpack("<I", cd[p + 42:p + 46])[0]
        name = cd[p + 46:p + 46 + nlen].decode("utf-8", "replace")
        if name == member:
            found = (method, crc, csize, usize, offset)
            break
        p += 46 + nlen + xlen + klen
    if found is None:
        fail("%s: the archive has no member %s" % (url, member))
    method, crc, csize, usize, offset = found
    if method not in (0, 8) or 0xFFFFFFFF in (csize, usize, offset):
        fail("%s: member %s has an unsupported layout" % (url, member))
    head = http_get(url, offset, offset + 29)
    if head[:4] != b"PK\x03\x04":
        fail("%s: bad local header of %s" % (url, member))
    nlen, xlen = struct.unpack("<HH", head[26:30])
    start = offset + 30 + nlen + xlen
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                               "Range": "bytes=%d-%d" % (start, start + csize - 1)})
    dec = zlib.decompressobj(-15) if method == 8 else None
    got_crc = 0
    count = 0
    with urllib.request.urlopen(req, timeout=600) as r, open(part, "wb") as f:
        while True:
            block = r.read(1 << 20)
            if not block:
                break
            data = dec.decompress(block) if dec else block
            got_crc = zlib.crc32(data, got_crc)
            count += len(data)
            f.write(data)
        if dec:
            data = dec.flush()
            got_crc = zlib.crc32(data, got_crc)
            count += len(data)
            f.write(data)
    if (got_crc & 0xFFFFFFFF) != crc or count != usize:
        fail("%s: member %s does not match the CRC-32 of the archive" % (url, member))


def fetch_original(e, path):
    """Download one original file again and check its sha256."""
    part = path.with_name(path.name + ".part")
    print("  download %s" % e["downloadUrl"])
    if e.get("archiveMember"):
        fetch_archive_member(e["downloadUrl"], e["archiveMember"], part)
    else:
        req = urllib.request.Request(e["downloadUrl"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=600) as r, open(part, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
    got = sha256_of(part)
    if got != e["sha256"]:
        fail("%s: the downloaded file has sha256 %s, expected %s (the file stays at %s)" % (e["id"], got, e["sha256"], part))
    part.rename(path)


def latitude_text(deg):
    """Return a latitude as text, for example '76.4 degrees north'."""
    if abs(deg) < 0.05:
        return "the equator"
    return "%s degrees %s" % (("%.1f" % abs(deg)).rstrip("0").rstrip("."), "north" if deg > 0 else "south")


# The texts "changes" are simple sentences, at most six for one map. The text check of the project
# (tools/ste/ste-lint.mjs) examines them, and the About screen of the application shows them.

def zonal_fill_changes(e, h):
    """Describe the fill of a zonal map in simple sentences."""
    p = e["zonalFill"]
    y0, y1 = p["validRows"]
    out = ["The project gave a new color to each row that has no good image data."]
    caps = []
    if y0 > 0:
        caps.append("north of " + latitude_text(row_latitude(y0, h)))
    if y1 < h - 1:
        caps.append("south of " + latitude_text(row_latitude(y1 + 1, h)))
    if caps:
        where = " and ".join(caps)
        out.append("%s, the new color is the mean color of the nearest good rows." % (where[0].upper() + where[1:]))
        out.append("Near the limit, the color changes in small steps from the color of the nearest good row to this mean color.")
    for ya, yb in p.get("interpolateRows", []):
        out.append("Between %s and %s, the new color of a row is a linear interpolation between the two nearest good rows." % (
            latitude_text(row_latitude(ya, h)), latitude_text(row_latitude(yb + 1, h))))
    return out


def edge_columns_changes(e):
    """Describe the repair of the edge columns in simple sentences."""
    n = e.get("edgeColumns", {}).get("columns", 8)
    return ["The project gave a new value to each black pixel (value 0) in the first %d and the last %d columns of the source image." % (n, n),
            "The new value is the value of the nearest pixel of the same row that is not black."]


def ring_changes(e):
    """Describe the making of the ring strip in simple sentences (the details are in ring_strip)."""
    p = e["ring"]
    width, height = p.get("width", 2048), p.get("height", 16)
    return " ".join([
        "The project made a new image from the source image: one line of %d pixels from the smallest radius of the rings to the largest radius." % width,
        "The brightness of a pixel is the mean brightness of %d image rows along the long axis of the ring ellipses." % (2 * p["halfRows"] + 1),
        "The scale of the radius comes from a fit to ring edges that have a known radius.",
        "The alpha value of a pixel is its brightness as a fraction of the largest brightness of the image.",
        "A pixel gets the mean color of %d image columns around it, or the color of the nearest brighter pixel if it is very dark." % p.get("hueColumns", 1),
        "The file has %d equal rows (PNG), and the small version has %d x %d pixels." % (height, p.get("smallWidth", width // 2), p.get("smallHeight", height // 2)),
    ])


COUNT_WORDS = {1: "one size", 2: "two sizes", 3: "three sizes"}


def size_text(size):
    return "%d x %d" % size


def sizes_text(sizes):
    """Return a list of sizes as text, for example '4096 x 2048, 2048 x 1024 and 1024 x 512'."""
    names = [size_text(s) for s in sizes]
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


def changes_text(e, orig, sizes, large_quality):
    """Describe the changes in simple sentences (active voice, present tense).

    `sizes` is the list of the sizes that the build makes, the largest first: the large file (if the
    entry has one), the usual file and the small file. `large_quality` is the JPEG quality of the large
    file, or None if the entry has no large file.
    """
    if e.get("changes"):
        return e["changes"]
    if e["role"] == "ring":
        return ring_changes(e)
    ext = Path(e["original"]).suffix.lower()
    fmt = FORMAT_NAMES.get(ext, ext.lstrip(".").upper())
    first = []
    if e.get("zonalFill"):
        first = zonal_fill_changes(e, orig["height"])
    elif e.get("prepare") == "edge_columns":
        first = edge_columns_changes(e)
    parts = []
    ow, oh = orig["width"], orig["height"]
    # The sizes, and how they compare with the source image.
    larger = [s for s in sizes if s[0] > ow]
    about = "the source image has %d x %d pixels" % (ow, oh)
    if larger and len(larger) == len(sizes):
        about += ", thus each size is larger than the source image"
    elif len(larger) == 1:
        about += ", thus the size %s is larger than the source image" % size_text(larger[0])
    elif larger:
        about += ", thus the sizes %s are larger than the source image" % sizes_text(larger)
    parts.append("made %s of the image: %s pixels (%s)." % (COUNT_WORDS[len(sizes)], sizes_text(sizes), about))
    quality = "JPEG quality %s" % JPEG_QUALITY
    one_quality = large_quality is None or str(large_quality) == JPEG_QUALITY
    if not one_quality:
        quality = "JPEG quality %s for the size %s, JPEG quality %s for the other sizes" % (large_quality, size_text(sizes[0]), JPEG_QUALITY)
    if fmt == "JPEG":
        convert = "wrote each size as a new JPEG file (%s)" % quality
    else:
        convert = "converted each size from %s to JPEG (%s)" % (fmt, quality)
    no_space = orig["space"] != "Gray" and "Linear" not in orig["profile"] and orig["profile"] in ("", "<nil>")
    # A paragraph has a maximum of six sentences (ASD-STE100): when the sentence stays short, one sentence
    # gives the conversion and the color space.
    if no_space and one_quality:
        parts.append(convert + " with the color space sRGB, because the source image gives no color space.")
    else:
        parts.append(convert + ".")
    if orig["space"] == "Gray":
        parts.append("converted each size from gray values to sRGB color values.")
    elif "Linear" in orig["profile"]:
        parts.append("converted each size from linear values to sRGB values.")
    elif no_space and not one_quality:
        parts.append("set the color space of each size to sRGB, because the source image gives no color space.")
    if e.get("extraChanges"):
        parts.append(e["extraChanges"])
    subject = "Then the project " if first else "The project "
    return " ".join(first + [(subject if i == 0 else "It ") + part for i, part in enumerate(parts)])


def build(only, fetch_missing):
    data, entries = load_sources()
    settings = large_settings(data)
    OUT_SM.mkdir(parents=True, exist_ok=True)
    OUT_LG.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest = {"retrieved": data["retrieved"], "conventions": data.get("conventions", ""),
                "sourcesNote": data.get("sourcesNote", []), "textures": [], "missing": data.get("missing", [])}
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
        do_build = only is None or tid in only
        extra = {}
        large = None
        if do_build:
            print("build %-15s from %s (%dx%d, %s, %s)" % (tid, src.name, orig["width"], orig["height"], orig["space"], orig["profile"]))
        if is_ring:
            name = tid + ".png"
            dst, dst_sm = OUT / name, OUT_SM / name
            width, height, sm_w, sm_h, extra = build_ring(e, src, dst, dst_sm, do_build)
        else:
            width, height = e.get("width", 2048), e.get("height", 1024)
            sm_w, sm_h = e.get("smallWidth", 1024), e.get("smallHeight", 512)
            name = tid + ".jpg"
            dst, dst_sm = OUT / name, OUT_SM / name
            large = large_size(e, orig, width, settings)
            if e.get("zonalFill"):
                extra = zonal_fill_info(e, orig["height"])
            if do_build:
                # The three sizes come from the same prepared image, so they show the same repair and the same fill.
                work = src
                if e.get("prepare"):
                    work = CACHE / (tid + "_prepared.png")
                    PREPARE[e["prepare"]](e, src, work)
                if large:
                    make_jpeg(work, OUT_LG / name, large[0], large[1], settings["jpegQuality"])
                make_jpeg(work, dst, width, height)
                make_jpeg(work, dst_sm, sm_w, sm_h)
        outputs = [(dst, (width, height)), (dst_sm, (sm_w, sm_h))]
        sizes = [(width, height), (sm_w, sm_h)]
        if large:
            outputs.append((OUT_LG / name, large))
            sizes.insert(0, large)
        for p, (w, h) in outputs:
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
        }
        if large:
            m["large"] = "textures/lg/" + name
        m["width"] = width
        m["height"] = height
        if large:
            m["largeWidth"], m["largeHeight"] = large
        m.update({
            "projection": e.get("projection", "equirectangular"),
            "centerLongitudeDeg": e["centerLongitudeDeg"],
            "longitudeNote": e["longitudeNote"],
        })
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
            "changes": changes_text(e, orig, sizes, settings["jpegQuality"] if large else None),
        })
        m["licenceStatement"] = e["licenceStatement"]
        if e.get("note"):
            m["note"] = e["note"]
        for key in OPTIONAL_FIELDS:
            if key in e:
                m[key] = e[key]
        m.update(extra)
        manifest["textures"].append(m)
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote %s (%d textures, %d missing)" % (MANIFEST.relative_to(ROOT), len(manifest["textures"]), len(manifest["missing"])))
    # The script does not delete a file. It names each file of the large directory that the manifest does not use.
    used = {m["large"].rsplit("/", 1)[1] for m in manifest["textures"] if "large" in m}
    total = 0
    for p in sorted(OUT_LG.iterdir()):
        if p.name.startswith("."):
            continue
        if p.name in used:
            total += p.stat().st_size
        else:
            print("NOTE: %s is not in the manifest. The build does not delete files: remove it by hand." % p.relative_to(ROOT))
    print("large files: %d, %.2f MB in total (JPEG quality %s)" % (len(used), total / 1048576, settings["jpegQuality"]))


# ---------------------------------------------------------------------------
# docs/ASSETS.md
# ---------------------------------------------------------------------------

def cell(text):
    return " ".join(str(text).split()).replace("|", "\\|")


def write_assets_md():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    lines = []
    # The text of this page follows the rules of ASD-STE100 (npm run lint:ste examines it).
    lines.append("# Assets")
    lines.append("")
    lines.append("This page gives the source and the license of each asset of Apsis.")
    lines.append("The assets are the maps of the bodies, the spacecraft models, the data of the engine and the libraries.")
    lines.append("")
    lines.append("The script `tools/textures/build_textures.py` writes the first two sections of this page.")
    lines.append("It uses the data in `public/textures/manifest.json`.")
    lines.append("Do not change these two sections. Change `data-src/textures/sources.json` or the script, and then use the script again.")
    lines.append("")
    lines.append("## Maps of the bodies")
    lines.append("")
    lines.append("The table shows each map file in `public/`.")
    lines.append("Each map also has a small file in `public/textures/sm/`.")
    large = sum(1 for t in manifest["textures"] if "large" in t)
    if large:
        lines.append("%d maps also have a large file in `public/textures/lg/`." % large)
    lines.append("The column Changes gives the sizes that the project made of each map.")
    lines.append("The project got all source files on %s." % manifest["retrieved"])
    lines.append("")
    lines.append("The source files are in `data-src/textures/original/`.")
    lines.append("They are not in `git`, because they are large.")
    lines.append("The file `manifest.json` gives the address and the SHA-256 of each source file (fields `downloadUrl` and `sha256`).")
    lines.append("")
    lines.append("The records of the licenses are in `data-src/textures/evidence/`.")
    lines.append("Each record contains text from the page of its source: thus the records are not in `git` (decision D79).")
    lines.append("The file `data-src/reference-copies.json` gives the address, the size and the SHA-256 of each record.")
    lines.append("")
    for sentence in manifest.get("sourcesNote", []):
        lines.append(" ".join(sentence.split()))
    lines.append("")
    lines.append("The field `note` of each map in `manifest.json` gives the limits of its file.")
    lines.append("With the license CC BY 4.0, the user of a file must give a credit and a note about each change.")
    lines.append("The table gives the credit and the note.")
    lines.append("NASA, JPL, the USGS and the Space Telescope Science Institute also tell the user to give a credit for their files.")
    lines.append("The table gives this credit too.")
    lines.append("The field `licenceStatement` of each map in `manifest.json` gives the words of the license of its source.")
    lines.append("")
    lines.append("| File | Body | Title | Credit | License | Source | Changes |")
    lines.append("|---|---|---|---|---|---|---|")
    for t in manifest["textures"]:
        lines.append("| `%s` | `%s` | %s | %s | %s | <%s> | %s |" % (
            cell(t["file"]), cell(t["body"]), cell(t["title"]), cell(t["author"]),
            "[%s](%s)" % (cell(t["licence"]), t["licenceUrl"]), t["sourceUrl"], cell(t["changes"])))
    lines.append("")
    lines.append("## Maps that the application does not have")
    lines.append("")
    if manifest["missing"]:
        lines.append("The list gives the body and the type of each map that the application does not have, and the reason.")
        lines.append("")
        for m in manifest["missing"]:
            label = "`%s`" % m["body"] + (", map `%s`" % m["role"] if m.get("role") else "")
            lines.append("- %s: %s" % (label, " ".join(m["reason"].split())))
    else:
        lines.append("Each body has all its maps.")
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

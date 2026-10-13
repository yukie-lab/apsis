#!/usr/bin/env python3
"""Measure the geometry of the Cassini ring image for the ring strip of Apsis.

Run this script from any directory:

    python3 -I tools/textures/measure_ring.py [IMAGE]

IMAGE is the original image of the entry `saturn_ring` in data-src/textures/sources.json
(default: data-src/textures/original/PIA06175.tif).

The image shows one side of the rings of Saturn. Each ring edge is a part of an ellipse.
The point of each ellipse that is the farthest from Saturn lies on the major axis.
On the major axis the distance in pixels is proportional to the radius in km.

The script does these steps:
  1. It follows ten sharp ring edges from row to row.
     It fits x = x0 - k (y - y0)^2 to each edge. The point (x0, y0) lies on the major axis.
  2. It fits a straight line through these ten points. This line is the major axis.
  3. It makes the brightness profile along the major axis (mean of 17 rows).
  4. It measures the position of known ring features on this profile.
  5. It fits the radius scale with three sharp features and prints the difference for the others.
     The radius of each feature comes from the NASA NSSDC "Saturnian Rings Fact Sheet".
  6. It prints the block `axis` and `calibration` for the entry `saturn_ring` of sources.json.

The script changes no file except one temporary copy of the image in .cache/textures/.
The image is untrusted data. The script reads it only as pixels.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_textures as bt  # noqa: E402  (the build script of this folder)

START_ROW = 479
HALF_ROWS = 8

# Ring edges for step 1: name, x near START_ROW, brightness level of the edge, direction.
# "fall" means bright on the left and dark on the right.
EDGES = [
    ("Maxwell gap, inner edge", 1146, 34, "fall"),
    ("Maxwell gap, outer edge", 1170, 33, "rise"),
    ("B ring, inner edge", 1586, 143, "rise"),
    ("B ring, outer edge", 3935, 80, "fall"),
    ("Laplace gap, inner edge", 4145, 25, "fall"),
    ("A ring, inner edge", 4377, 149, "rise"),
    ("Encke gap, inner edge", 5401, 65, "fall"),
    ("Encke gap, outer edge", 5431, 70, "rise"),
    ("Keeler gap, inner edge", 5684, 85, "fall"),
    ("A ring, outer edge", 5710, 90, "fall"),
]

# Features for step 4 and 5: name, kind, parameters, radius in km (NSSDC fact sheet), use in fit.
#   edge:    (x guess, level, direction)   position where the profile crosses the level
#   gap:     (first x, last x)             middle of the two outer places with half of the depth
#   ringlet: (first x, last x)             centre of brightness above the darkest value
FEATURES = [
    ("Titan ringlet (centre)", "ringlet", (288, 296), 77871, True),
    ("Maxwell gap (centre)", "gap", (1150, 1195), 87491, False),
    ("B ring inner edge", "edge", (1598, 143, "rise"), 91975, False),
    ("B ring outer edge", "edge", (3938, 80, "fall"), 117507, True),
    ("A ring inner edge", "edge", (4379, 149, "rise"), 122340, False),
    ("Encke gap (inner edge)", "edge", (5402, 65, "fall"), 133410, False),
    ("Keeler gap (centre)", "gap", (5676, 5694), 136487, False),
    ("A ring outer edge", "edge", (5711, 90, "fall"), 136780, True),
]


def lum(px, w, x, y):
    p = (y * w + x) * 3
    return (px[p] * 299 + px[p + 1] * 587 + px[p + 2] * 114) / 1000.0


def crossing(values, x_guess, level, fall, win=12):
    """Return the position near x_guess where the list `values` crosses `level`."""
    best = None
    for x in range(max(0, int(x_guess) - win), min(len(values) - 2, int(x_guess) + win) + 1):
        a, b = values[x], values[x + 1]
        if (fall and a >= level > b) or ((not fall) and a < level <= b):
            xc = x + (a - level) / (a - b)
            if best is None or abs(xc - x_guess) < abs(best - x_guess):
                best = xc
    return best


def track_edge(px, w, h, x_start, level, fall):
    """Follow one edge over the rows. Return the apex (x0, y0) and k of x = x0 - k (y - y0)^2."""
    def row_values(y, x_mid):
        lo = max(0, int(x_mid) - 16)
        hi = min(w, int(x_mid) + 17)
        return lo, [lum(px, w, x, y) for x in range(lo, hi)]

    def find(y, x_guess):
        lo, vals = row_values(y, x_guess)
        c = crossing(vals, x_guess - lo, level, fall)
        return None if c is None else c + lo

    xs = {}
    x = find(START_ROW, x_start)
    if x is None:
        bt.fail("no edge near x = %s in row %d" % (x_start, START_ROW))
    xs[START_ROW] = x
    for rows in (range(START_ROW + 1, h), range(START_ROW - 1, -1, -1)):
        prev, slope = xs[START_ROW], 0.0
        for y in rows:
            c = find(y, prev + slope)
            if c is None:
                break
            slope = 0.7 * slope + 0.3 * (c - prev)
            xs[y] = c
            prev = c
    y_max = max(xs, key=lambda y: xs[y])
    sel = [y for y in sorted(xs) if abs(y - y_max) <= 150]
    # least squares fit of x = a + b y + c y^2 (the rows are counted from y_max)
    t = [y - y_max for y in sel]
    s = [sum(v ** k for v in t) for k in range(5)]
    r = [sum(xs[y] * (y - y_max) ** k for y in sel) for k in range(3)]
    m = [[s[0], s[1], s[2], r[0]], [s[1], s[2], s[3], r[1]], [s[2], s[3], s[4], r[2]]]
    for i in range(3):
        p = max(range(i, 3), key=lambda q: abs(m[q][i]))
        m[i], m[p] = m[p], m[i]
        for q in range(3):
            if q != i:
                f = m[q][i] / m[i][i]
                m[q] = [u - f * v for u, v in zip(m[q], m[i])]
    a, b, c = (m[i][3] / m[i][i] for i in range(3))
    t_apex = -b / (2 * c)
    return a + b * t_apex + c * t_apex * t_apex, y_max + t_apex, -c, len(sel)


def measure(kind, par, values):
    if kind == "edge":
        return crossing(values, par[0], par[1], par[2] == "fall")
    xa, xb = par
    part = values[xa:xb + 1]
    if kind == "ringlet":
        base = min(part)
        weight = [v - base for v in part]
        return xa + sum(i * wgt for i, wgt in enumerate(weight)) / sum(weight)
    # gap: half of the depth below the lower one of the two ends.
    # The search starts at the two ends of the range, so a ringlet inside the gap has no effect.
    low = min(part)
    level = (low + min(part[0], part[-1])) / 2.0
    left = None
    for i in range(1, len(part)):
        if part[i - 1] >= level > part[i]:
            left = i - 1 + (part[i - 1] - level) / (part[i - 1] - part[i])
            break
    right = None
    for i in range(len(part) - 2, -1, -1):
        if part[i] < level <= part[i + 1]:
            right = i + (level - part[i]) / (part[i + 1] - part[i])
            break
    if left is None or right is None:
        bt.fail("the gap between x = %d and x = %d has no clear edges" % (xa, xb))
    return xa + (left + right) / 2.0


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else bt.ORIGINAL / "PIA06175.tif"
    w, h, px = bt.load_pixels(src, "saturn_ring_measure")
    print("image %s: %d x %d pixels" % (src.name, w, h))

    print("step 1: ring edges (apex of each edge)")
    apex = []
    for name, x_start, level, direction in EDGES:
        x0, y0, k, n = track_edge(px, w, h, x_start, level, direction == "fall")
        apex.append((x0, y0))
        print("  %-26s x0 = %8.2f  y0 = %6.1f  k = %.6f  (%d rows)" % (name, x0, y0, k, n))

    a, b = bt.fit_line(apex)
    axis = {"rowAtFirstColumn": round(a, 1), "rowAtLastColumn": round(a + b * (w - 1), 1)}
    print("step 2: major axis: row %.1f at column 0, row %.1f at column %d" % (
        axis["rowAtFirstColumn"], axis["rowAtLastColumn"], w - 1))
    for (x0, y0), e in zip(apex, EDGES):
        print("  %-26s apex row %6.1f, axis row %6.1f" % (e[0], y0, a + b * x0))

    prof = bt.ring_axis_profile(w, h, px, axis, HALF_ROWS)
    grey = [(p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000.0 for p in prof]

    print("step 4: features on the axis profile")
    cal = []
    for name, kind, par, radius, fit in FEATURES:
        x = measure(kind, par, grey)
        if x is None:
            bt.fail("feature %s: not found" % name)
        item = {"feature": name, "x": round(x, 2), "radiusKm": radius}
        if fit:
            item["fit"] = True
        cal.append(item)
    r0, scale = bt.fit_line([(c["x"], c["radiusKm"]) for c in cal if c.get("fit")])
    print("step 5: radius = %.1f km + %.4f km x (x = column of the image, pixel centre)" % (r0, scale))
    for c in cal:
        fit_r = r0 + scale * c["x"]
        print("  %-26s x = %8.2f  table %6d km  fit %8.0f km  difference %+5.0f km  %s" % (
            c["feature"], c["x"], c["radiusKm"], fit_r, fit_r - c["radiusKm"], "(in the fit)" if c.get("fit") else ""))
    print("  the first column has the radius %.0f km, the last column %.0f km" % (r0, r0 + scale * (w - 1)))
    lit = [x for x in range(w) if max(prof[x]) >= 1.0]
    print("  columns with image data on the axis: %d to %d (%.0f km to %.0f km)" % (
        lit[0], lit[-1], r0 + scale * lit[0], r0 + scale * lit[-1]))

    print("step 6: block for sources.json")
    print(json.dumps({"axis": axis, "halfRows": HALF_ROWS, "calibration": cal}, indent=2))


if __name__ == "__main__":
    main()

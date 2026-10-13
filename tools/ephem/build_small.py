"""Build the Chebyshev ephemeris of the small bodies from Horizons vectors.

Input : Horizons states relative to the solar system barycentre (ICRF), uniform step, 1980-01-01 to 2060-01-01 TDB.
        The raw responses are cached in data-src/horizons-fit/ (large, not in git).
Output: public/data/small.bin (same format as ephem.bin, centre: solar system barycentre)
The fit is a least-squares Chebyshev fit of positions and velocities. The error at the samples is
written in the header. Independent check epochs are in truth/horizons/small_check.json.
"""
import json, struct, sys, os
import numpy as np
from numpy.polynomial import chebyshev as Ch
sys.path.insert(0, 'tools/truth')
import horizons as H

BODIES = {'CERES': ('1;', '4d'), 'VESTA': ('4;', '4d'), 'PSYCHE': ('16;', '4d'), 'EROS': ('433;', '2d'),
          'ITOKAWA': ('25143;', '1d'), 'RYUGU': ('162173;', '1d'), 'BENNU': ('101955;', '1d'), 'DIDYMOS': ('65803;', '1d'),
          'ARROKOTH': ('486958;', '8d'), 'HALLEY': ('DES=1P; CAP;', '1d'), 'CHURYUMOV_GERASIMENKO': ('DES=67P; CAP;', '1d')}
JD0, JD1 = 2444239.5, 2473459.5   # 1980-01-01 .. 2060-01-01
TOL_KM = 1.0

header = {'format': 'apsis-ephem-1', 'source': 'JPL Horizons vectors, Chebyshev least-squares fit', 'frame': 'ICRF',
          'timeScale': 'TDB', 'unit': 'km', 'jdStart': JD0, 'jdEnd': JD1, 'fitToleranceKm': TOL_KM, 'bodies': []}
blobs = []; offset = 0
for name, (cmd, step) in BODIES.items():
    rows = H.vectors('fitb_' + name, cmd, '500@0', '1980-01-01', '2060-01-01', step, raw_dir='data-src/horizons-fit')
    jd = np.array([r[0] for r in rows]); S = np.array([r[1] for r in rows])
    best = None; fallback = None
    for days in (8, 16, 32, 64, 128, 256, 512):
        nint = int(round((JD1 - JD0) / days + 0.4999))
        for n in range(6, 26):
            coef = np.zeros((nint, 3, n)); worst = 0.0; ok = True
            for i in range(nint):
                a = JD0 + i * days
                m = (jd >= a - 1e-9) & (jd <= a + days + 1e-9)
                if m.sum() * 2 < n + 4: ok = False; break
                x = np.clip(2 * (jd[m] - a) / days - 1, -1, 1)
                T = Ch.chebvander(x, n - 1)
                dT = np.stack([Ch.chebval(x, Ch.chebder(np.eye(n)[j])) if j > 0 else np.zeros_like(x) for j in range(n)], axis=1)
                w = days * 86400 / 2            # d/dt = (2/dt) d/dx ; scale velocity rows to position units
                c, *_ = np.linalg.lstsq(np.vstack([T, dT]), np.vstack([S[m, :3], S[m, 3:] * w]), rcond=None)
                coef[i] = c.T
                worst = max(worst, np.max(np.abs(T @ c - S[m, :3])))
            if not ok: continue
            if worst <= TOL_KM:
                if best is None or coef.size < best[0].size: best = (coef, days, n, nint, worst)
                break
            if fallback is None or worst < fallback[4]: fallback = (coef, days, n, nint, worst)
    if best is None: best = fallback   # close approaches to a planet: the tolerance is not reached; the error is published
    coef, days, n, nint, worst = best
    header['bodies'].append({'name': name, 'intervalDays': days, 'nCoef': n, 'nIntervals': nint, 'offset': offset,
                             'maxFitErrorKm': float(worst), 'center': 'SSB'})
    blobs.append(coef.astype('<f8').tobytes()); offset += coef.size
    print(f'{name:22s} interval {days:4d} d n={n:2d} {coef.size*8/1e3:7.1f} kB  max sample error {worst*1e3:8.2f} m', flush=True)

hj = json.dumps(header).encode(); hj += b' ' * ((8 - (len(hj) + 4) % 8) % 8)
with open('public/data/small.bin', 'wb') as fh:
    fh.write(struct.pack('<I', len(hj))); fh.write(hj)
    for b in blobs: fh.write(b)
print('total kB', (4 + len(hj) + offset * 8) / 1e3)

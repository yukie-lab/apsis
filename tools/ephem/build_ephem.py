"""Build the compact Chebyshev ephemeris used by Apsis.

Source: JPL DE440 (de440s.bsp, NAIF generic kernels). Conditions of use: data-src/evidence/naif_rules.txt.
Each body is re-fitted with Chebyshev polynomials on fixed-length intervals.
The fit error against DE440 is measured on dense check points and written
into the header so that the application can publish it.

Output: public/data/ephem.bin  (little-endian)
  uint32 headerLength, UTF-8 JSON header (padded to 8 bytes), Float64 coefficients.
Time argument: TDB seconds past J2000.0 (JD 2451545.0 TDB). Frame: ICRF. Unit: km.
"""
import json, struct, sys, hashlib
import numpy as np
from jplephem.spk import SPK

SRC = 'data-src/kernels/de440s.bsp'
OUT = 'public/data/ephem.bin'
JD0, JD1 = 2433264.5, 2488080.5        # 1949-12-14 .. 2100-01-12 (TDB), aligned with the 32-day DE440 granules
TOL_KM = 1.0e-2                        # target maximum fit error: 10 m (DE440 granule joins limit the fit to the metre level)

kernel = SPK.open(SRC)

def seg(center, target):
    return kernel[center, target]

def pos_fn(name):
    if name == 'MOON_GEO':
        m, e = seg(3, 301), seg(3, 399)
        return lambda jd: m.compute(jd) - e.compute(jd)
    ids = {'SUN': 10, 'MERCURY': 1, 'VENUS': 2, 'EMB': 3, 'MARS': 4, 'JUPITER': 5,
           'SATURN': 6, 'URANUS': 7, 'NEPTUNE': 8, 'PLUTO': 9}
    s = seg(0, ids[name])
    return lambda jd: s.compute(jd)

def cheb_fit(f, a, b, n):
    """Chebyshev interpolation coefficients (n terms) of f on [a, b]."""
    k = np.arange(n)
    x = np.cos(np.pi * (k + 0.5) / n)
    t = 0.5 * (a + b) + 0.5 * (b - a) * x
    y = f(t)                                  # shape (3, n)
    T = np.cos(np.outer(np.arange(n), np.arccos(x)))   # T_j(x_k)
    c = (2.0 / n) * (y @ T.T)
    c[:, 0] *= 0.5
    return c

def cheb_eval(c, x):
    return np.polynomial.chebyshev.chebval(x, c.T)

def try_fit(f, days, n, sample_intervals):
    worst = 0.0
    xs = np.linspace(-1, 1, 41)
    for a in sample_intervals:
        b = a + days
        c = cheb_fit(f, a, b, n)
        t = 0.5 * (a + b) + 0.5 * (b - a) * xs
        err = np.max(np.linalg.norm(cheb_eval(c, xs) - f(t), axis=0))
        worst = max(worst, err)
    return worst

BODIES = [('SUN', [32, 64]), ('MERCURY', [8, 16, 32]), ('VENUS', [16, 32, 64]), ('EMB', [16, 32, 64]),
          ('MARS', [32, 64]), ('JUPITER', [64, 128, 256]), ('SATURN', [128, 256, 512]),
          ('URANUS', [256, 512, 1024]), ('NEPTUNE', [256, 512, 1024]), ('PLUTO', [256, 512, 1024]),
          ('MOON_GEO', [4, 8])]

header = {'format': 'apsis-ephem-1', 'source': 'JPL DE440 (de440s.bsp)',
          'sourceSha256': hashlib.sha256(open(SRC, 'rb').read()).hexdigest(),
          'frame': 'ICRF', 'timeScale': 'TDB', 'unit': 'km',
          'jdStart': JD0, 'jdEnd': JD1, 'fitToleranceKm': TOL_KM, 'bodies': []}
blobs = []
offset = 0
rng = np.random.default_rng(1)
for name, day_options in BODIES:
    f = pos_fn(name)
    best = None
    for days in day_options:
        nint = int(np.ceil((JD1 - JD0) / days))
        starts = JD0 + days * rng.integers(0, nint, size=60)
        for n in range(6, 31):
            if try_fit(f, days, n, starts) < 0.3 * TOL_KM:
                size = nint * n * 3
                if best is None or size < best[0]:
                    best = (size, days, n, nint)
                break
    size, days, n, nint = best
    coef = np.empty((nint, 3, n))
    worst = 0.0
    xs = np.linspace(-1, 1, 23)
    for i in range(nint):
        a = JD0 + i * days
        c = cheb_fit(f, a, a + days, n)
        coef[i] = c
        t = a + 0.5 * days * (xs + 1)
        worst = max(worst, np.max(np.linalg.norm(cheb_eval(c, xs) - f(t), axis=0)))
    header['bodies'].append({'name': name, 'intervalDays': days, 'nCoef': n, 'nIntervals': nint,
                             'offset': offset, 'maxFitErrorKm': float(worst),
                             'center': 'EARTH' if name == 'MOON_GEO' else 'SSB'})
    blobs.append(coef.astype('<f8').tobytes())
    offset += coef.size
    print(f'{name:9s} interval {days:5d} d  n={n:2d}  intervals={nint:6d}  {coef.size*8/1e6:6.2f} MB  maxerr {worst*1e3:.3f} m', flush=True)

hj = json.dumps(header).encode()
hj += b' ' * ((8 - (len(hj) + 4) % 8) % 8)
with open(OUT, 'wb') as fh:
    fh.write(struct.pack('<I', len(hj)))
    fh.write(hj)
    for b in blobs:
        fh.write(b)
print('total MB', (4 + len(hj) + offset * 8) / 1e6)

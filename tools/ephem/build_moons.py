"""Fit the analytic moon model (precessing ellipse) to Horizons vectors.

Input : truth/horizons/moons_fit.json (planet-centred ICRF states, 2000 to 2050, and one dense arc of 4 days
        that removes the alias of the mean motion)
Output: src/engine/data/moons.json
Model (time t = TDB seconds after J2000):
  reference plane with pole (poleRa, poleDec); X = unit(Z_icrf x pole), Y = pole x X
  node = node0 + nodeRate t; peri = peri0 + periRate t (longitude of periapsis)
  L = L0 + n t + libAmp sin(libRate t + libPhase) (mean longitude with one libration term)
  a, e, inc constant.
"""
import json
import numpy as np
from scipy.optimize import least_squares

const = json.load(open('src/engine/data/constants.json'))['bodies']
fit = json.load(open('truth/horizons/moons_fit.json'))['bodies']
NAIF = {'PHOBOS': 401, 'DEIMOS': 402, 'IO': 501, 'EUROPA': 502, 'GANYMEDE': 503, 'CALLISTO': 504, 'MIMAS': 601,
        'ENCELADUS': 602, 'TETHYS': 603, 'DIONE': 604, 'RHEA': 605, 'TITAN': 606, 'IAPETUS': 608, 'MIRANDA': 705,
        'ARIEL': 701, 'UMBRIEL': 702, 'TITANIA': 703, 'OBERON': 704, 'TRITON': 801, 'CHARON': 901}

def basis(ra, dec):
    z = np.array([np.cos(dec) * np.cos(ra), np.cos(dec) * np.sin(ra), np.sin(dec)])
    x = np.cross([0, 0, 1.0], z); x /= np.linalg.norm(x)
    return x, np.cross(z, x), z

def model(p, t):
    ra, dec, a, e, inc, node0, nrate, peri0, prate, L0, n, lamp, lfreq, lphase = p
    X, Y, Z = basis(ra, dec)
    node = node0 + nrate * t; peri = peri0 + prate * t
    M = L0 + n * t + lamp * np.sin(lfreq * t + lphase) - peri
    E = M.copy()
    e = min(abs(e), 0.9)
    for _ in range(12):
        E = E - (E - e * np.sin(E) - M) / (1 - e * np.cos(E))
    nu = 2 * np.arctan2(np.sqrt(1 + e) * np.sin(E / 2), np.sqrt(1 - e) * np.cos(E / 2))
    r = a * (1 - e * np.cos(E))
    u = peri - node + nu
    xp = r * (np.cos(node) * np.cos(u) - np.sin(node) * np.sin(u) * np.cos(inc))
    yp = r * (np.sin(node) * np.cos(u) + np.cos(node) * np.sin(u) * np.cos(inc))
    zp = r * np.sin(u) * np.sin(inc)
    return np.outer(xp, X) + np.outer(yp, Y) + np.outer(zp, Z)

def coherent(signal, phase0, t, lo, hi, step):
    """Find the rate w in [lo, hi] that maximizes |sum signal * exp(i (phase0 - w t))|. Returns (w, complex sum)."""
    grid = np.arange(lo, hi, step)
    best = (-1.0, 0.0, 0j)
    for chunk in np.array_split(grid, max(1, len(grid) // 20000)):
        sm = (signal[None, :] * np.exp(1j * (phase0[None, :] - chunk[:, None] * t[None, :]))).sum(axis=1)
        k = int(np.argmax(np.abs(sm)))
        if abs(sm[k]) > best[0]: best = (abs(sm[k]), chunk[k], sm[k])
    return best[1], best[2]

out = {}
for name, d in fit.items():
    t = (np.array(d['jd']) - 2451545.0) * 86400.0
    S = np.array(d['state']); R = S[:, :3]; V = S[:, 3:]
    planet = const[d['center']]
    ra0, dec0 = np.radians(planet['poleRa'][0]), np.radians(planet['poleDec'][0])
    h = np.cross(R, V); hm = h.mean(axis=0); hm /= np.linalg.norm(hm)
    X, Y, Z = basis(ra0, dec0)
    if hm @ Z < 0:
        # retrograde relative to the IAU pole: use the opposite pole as the reference so that the motion is prograde
        ra0, dec0 = ra0 + np.pi, -dec0
        X, Y, Z = basis(ra0, dec0)
    rn = np.linalg.norm(R, axis=1)
    a0 = np.mean(rn)
    span = t.max() - t.min(); dw = 0.05 / span
    retro = False
    # longitude in the reference plane (measured from X toward Y)
    lam = np.arctan2(R @ Y, R @ X)
    n0 = np.mean(np.linalg.norm(h, axis=1) / rn ** 2) * (-1 if retro else 1)
    n_init, sm = coherent(np.ones_like(t), lam, t, min(n0 * 0.97, n0 * 1.03), max(n0 * 0.97, n0 * 1.03), dw)
    L_init = np.angle(sm)
    Lk = L_init + n_init * t
    # eccentricity: r - a = -a e cos(L - peri0 - prate t)
    prate, sm = coherent(-(rn - a0) / a0, -Lk, t, -4e-7, 4e-7, dw)
    # sum of -e cos(L-peri) exp(-i(L + prate t)) -> -(N e / 2) exp(-i peri0) ... sign handled below
    e_init = 2 * abs(sm) / len(t); peri_init = -np.angle(sm) ; prate = -prate
    # inclination: z = a sin(inc) sin(L - node0 - nrate t)
    z = (R @ Z) / a0
    nrate, sm = coherent(z, -Lk, t, -4e-7, 4e-7, dw)
    # sum sin(L-node) exp(-i(L + w t)) with w = -nrate -> (N/2i) ... exp(-i node0)
    s_init = 2 * abs(sm) / len(t); node_init = -np.angle(sm * 1j); nrate = -nrate
    inc_init = np.arcsin(min(1.0, s_init))
    if retro: inc_init = np.pi - inc_init
    def resid(p):
        return (model(p, t) - R).ravel() / a0
    p0 = [ra0, dec0, a0, max(e_init, 1e-5), inc_init, node_init, nrate, peri_init, prate, L_init, n_init, 0.0, 1e-9, 0.0]
    xs = [1e-3, 1e-3, a0 * 1e-4, 1e-4, 1e-4, 1e-2, 1e-11, 1e-2, 1e-11, 1e-3, abs(n_init) * 1e-9, 1e-3, 1e-11, 1e-2]
    free = np.array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0], bool)
    def run(p0, free):
        p0 = np.array(p0, float)
        sol = least_squares(lambda q: resid(np.where(free, 0, p0) + np.concatenate([q, np.zeros(0)]) @ np.eye(len(p0))[free] ), p0[free], x_scale=np.array(xs)[free], max_nfev=300)
        pn = p0.copy(); pn[free] = sol.x
        return sol.cost, pn
    cands = []
    for flip in (0, np.pi):
        q0 = list(p0); q0[7] += flip
        cands.append(run(q0, free))
    cost, p = min(cands, key=lambda c: c[0])
    # one periodic term in the mean longitude (resonant libration), found from the along-track residual
    res = model(p, t) - R
    along = np.cross(hm, R / rn[:, None])
    dl = -(res * along).sum(axis=1) / a0
    lf, sm = coherent(dl, np.zeros_like(t), t, 2 * np.pi / (200 * 365.25 * 86400), 2 * np.pi / (0.3 * 365.25 * 86400), dw)
    amp = 2 * abs(sm) / len(t)
    p1 = p.copy(); p1[11] = amp * (-1 if retro else 1); p1[12] = lf; p1[13] = np.angle(sm) + np.pi / 2
    cost2, p2 = run(p1, np.ones(14, bool))
    if cost2 < 0.8 * cost:
        p = p2
    else:
        p[11] = 0.0; p[12] = 0.0; p[13] = 0.0
    if p[3] < 0:
        p[3] = -p[3]; p[7] += np.pi
    err = np.linalg.norm(model(p, t) - R, axis=1)
    keys = ['poleRa', 'poleDec', 'a', 'e', 'inc', 'node0', 'nodeRate', 'peri0', 'periRate', 'L0', 'n', 'libAmp', 'libRate', 'libPhase']
    out[name] = dict(zip(keys, [float(x) for x in p]))
    out[name].update({'naif': NAIF[name], 'center': d['center'], 'fitRmsKm': float(np.sqrt(np.mean(err ** 2))), 'fitMaxKm': float(err.max())})
    print(f"{name:10s} a={p[2]:10.1f} e={p[3]:.5f} inc={np.degrees(p[4]):7.3f} P={2*np.pi/p[10]/86400:9.5f} d lib={np.degrees(p[11]):6.2f}  rms={out[name]['fitRmsKm']:8.1f} km max={err.max():8.1f} km", flush=True)

json.dump({'model': 'precessing ellipse', 'epoch': 'J2000.0 TDB', 'fitSpan': '2000-01-01 to 2050-01-01', 'source': 'JPL Horizons vectors', 'units': 'km, rad, rad/s', 'bodies': out},
          open('src/engine/data/moons.json', 'w'), indent=1)

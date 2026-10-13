"""Download the truth data sets from JPL Horizons and write truth/horizons/*.json.

Run from the project root:  tools/.venv/bin/python tools/truth/fetch_truth.py
Raw responses are cached in truth/horizons/raw/ (the record of the source).
All vectors: geometric, ICRF, km and km/s, time scale TDB (Julian date).
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import horizons as H

OUT = 'truth/horizons'

def dump(name, obj):
    with open(os.path.join(OUT, name + '.json'), 'w') as fh:
        json.dump(obj, fh, separators=(',', ':'))
    print('wrote', name, flush=True)

def jd_to_cal(jd):
    """Julian date to a 'YYYY-MM-DD HH:MM' string (proleptic Gregorian)."""
    j = jd + 0.5
    z = int(j); f = j - z
    a = int((z - 1867216.25) / 36524.25)
    a = z + 1 + a - a // 4
    b = a + 1524; c = int((b - 122.1) / 365.25); d = int(365.25 * c); e = int((b - d) / 30.6001)
    day = b - d - int(30.6001 * e); month = e - 1 if e < 14 else e - 13; year = c - 4716 if month > 2 else c - 4715
    mins = int(round(f * 1440))
    if mins == 1440:
        return jd_to_cal(jd + 1e-6)
    return '%04d-%02d-%02d %02d:%02d' % (year, month, day, mins // 60, mins % 60)

# ---------------------------------------------------------------- 1. planets
PLANET_IDS = {'SUN': '10', 'MERCURY': '199', 'VENUS': '299', 'EARTH': '399', 'MOON': '301', 'EMB': '3',
              'MARS_BARYCENTER': '4', 'MARS': '499', 'JUPITER_BARYCENTER': '5', 'JUPITER': '599',
              'SATURN_BARYCENTER': '6', 'SATURN': '699', 'URANUS_BARYCENTER': '7', 'URANUS': '799',
              'NEPTUNE_BARYCENTER': '8', 'NEPTUNE': '899', 'PLUTO_BARYCENTER': '9', 'PLUTO': '999'}

def planets():
    out = {}
    for name, cid in PLANET_IDS.items():
        rows = H.vectors('planet_' + name, cid, '500@0', '1950-01-10 06:00', '2099-12-20 18:00', '311')
        out[name] = {'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]}
    dump('planets', {'center': 'SSB', 'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons (DE441)', 'bodies': out})

# ---------------------------------------------------------------- 2. spacecraft encounters
MISSIONS = {
    'voyager1': ('-31', '1977-09-06', '1981-01-01', ['599', '699']),
    'voyager2': ('-32', '1977-08-21', '1990-01-01', ['599', '699', '799', '899']),
    'cassini': ('-82', '1997-10-16', '2004-07-10', ['299', '399', '599', '699']),
    'newhorizons': ('-98', '2006-01-20', '2015-08-01', ['599', '999']),
    'galileo': ('-77', '1989-10-20', '1995-12-20', ['299', '399', '599']),
    'juno': ('-61', '2011-08-06', '2016-07-10', ['399', '599']),
    'ulysses': ('-55', '1990-10-07', '1992-06-01', ['599']),
    'pioneer10': ('-23', '1972-03-04', '1974-06-01', ['599']),
    'pioneer11': ('-24', '1973-04-07', '1979-12-01', ['599', '699']),
    'mars2020': ('-168', '2020-07-31', '2021-02-18', ['499']),
    'messenger': ('-236', '2004-08-04', '2011-03-25', ['399', '299', '199']),
    'rosetta': ('-226', '2004-03-03', '2010-01-01', ['399', '499']),
}
LIMIT_KM = {'199': 2e6, '299': 3e6, '399': 4e6, '499': 3e6, '599': 6e7, '699': 6e7, '799': 5e7, '899': 5e7, '999': 5e6}

def norm(v):
    return (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5

def local_minima(rows, limit):
    d = [norm(r[1]) for r in rows]
    idx = []
    for i in range(len(d)):
        lo = d[i - 1] if i > 0 else float('inf')
        hi = d[i + 1] if i < len(d) - 1 else float('inf')
        if d[i] < limit and d[i] <= lo and d[i] <= hi and not (i == 0):
            idx.append(i)
    return idx

def encounters():
    out = {}
    for name, (sid, start, stop, planets_) in MISSIONS.items():
        enc = []
        for pid in planets_:
            coarse = H.vectors(f'enc_{name}_{pid}_coarse', sid, '500@' + pid, start, stop, '1d')
            for k, i in enumerate(local_minima(coarse, LIMIT_KM[pid])):
                jd = coarse[i][0]
                try:
                    hourly = H.vectors(f'enc_{name}_{pid}_{k}_hour', sid, '500@' + pid, jd_to_cal(jd - 2), jd_to_cal(jd + 2), '1h')
                except RuntimeError:
                    # the trajectory ends in this window (for example atmospheric entry)
                    lo = max(jd - 2, coarse[0][0]); hi = min(jd + 2, coarse[-1][0])
                    hourly = H.vectors(f'enc_{name}_{pid}_{k}_hour', sid, '500@' + pid, jd_to_cal(lo), jd_to_cal(hi), '1h')
                j = min(range(len(hourly)), key=lambda q: norm(hourly[q][1]))
                jd2 = hourly[j][0]
                lo = max(jd2 - 1.5 / 24, hourly[0][0]); hi = min(jd2 + 1.5 / 24, hourly[-1][0])
                fine = H.vectors(f'enc_{name}_{pid}_{k}_min', sid, '500@' + pid, jd_to_cal(lo), jd_to_cal(hi), '1m')
                m = min(range(len(fine)), key=lambda q: norm(fine[q][1]))
                helio = H.vectors(f'enc_{name}_{pid}_{k}_helio', sid, '500@10', jd_to_cal(jd2 - 2), jd_to_cal(jd2 + 2), '1h') if lo > coarse[0][0] + 2 and hi < coarse[-1][0] - 2 else []
                enc.append({'planet': pid, 'jdClosest': fine[m][0], 'rangeKm': norm(fine[m][1]),
                            'endOfData': m == len(fine) - 1,
                            'stateAtClosest': fine[m][1],
                            'fine': {'jd': [r[0] for r in fine[max(0, m - 5):m + 6]], 'state': [r[1] for r in fine[max(0, m - 5):m + 6]]},
                            'hourly': {'jd': [r[0] for r in hourly], 'state': [r[1] for r in hourly]}})
                print(name, pid, jd_to_cal(fine[m][0]), '%.0f km' % norm(fine[m][1]), flush=True)
        enc.sort(key=lambda e: e['jdClosest'])
        # state near the start of the data: Earth-centred, and Sun-centred daily states for the whole flight
        first = H.vectors(f'enc_{name}_start', sid, '500@399', start + ' 00:00', start + ' 12:00', '10m')
        helio = H.vectors(f'enc_{name}_helio_10d', sid, '500@10', start, stop, '10d')
        out[name] = {'horizonsId': sid, 'encounters': enc,
                     'startGeocentric': {'jd': [r[0] for r in first], 'state': [r[1] for r in first]},
                     'heliocentric10d': {'jd': [r[0] for r in helio], 'state': [r[1] for r in helio]}}
    dump('encounters', {'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons spacecraft trajectories',
                        'note': 'encounter states are relative to the planet centre', 'missions': out})

# ---------------------------------------------------------------- 3. cruise arcs for propagation tests
ARCS = {
    'voyager2_1990_1992': ('-32', '1990-01-01', '1992-01-01', '5d'),
    'voyager1_1995_2000': ('-31', '1995-01-01', '2000-01-01', '10d'),
    'pioneer10_1980_1985': ('-23', '1980-01-01', '1985-01-01', '10d'),
    'newhorizons_2008_2009': ('-98', '2008-06-01', '2009-06-01', '2d'),
    'newhorizons_2012_2014': ('-98', '2012-01-01', '2014-01-01', '5d'),
    'cassini_2001_2002': ('-82', '2001-06-01', '2002-06-01', '2d'),
    'juno_2014_2015': ('-61', '2014-01-01', '2015-01-01', '2d'),
    'mars2020_cruise': ('-168', '2020-08-20', '2021-02-10', '1d'),
    'voyager2_jupiter_flyby': ('-32', '1979-06-20', '1979-07-30', '6h'),
    'voyager2_neptune_flyby': ('-32', '1989-08-10', '1989-09-10', '6h'),
    'cassini_earth_flyby': ('-82', '1999-08-17', '1999-08-20', '10m'),
    'juno_earth_flyby': ('-61', '2013-10-08', '2013-10-11', '10m'),
    'ulysses_1993_1994': ('-55', '1993-01-01', '1994-01-01', '2d'),
}

def arcs():
    out = {}
    for name, (sid, start, stop, step) in ARCS.items():
        rows = H.vectors('arc_' + name, sid, '500@0', start, stop, step)
        out[name] = {'horizonsId': sid, 'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]}
    dump('arcs', {'center': 'SSB', 'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons spacecraft trajectories', 'arcs': out})

# The same cruise arcs relative to the Sun. Horizons tables of a spacecraft relative to the solar system barycentre
# are offset from its tables relative to the Sun or to a planet (measured: 118 km for Cassini in 1999, 117 km for
# Juno in 2013, see docs/VALIDATION.md). The propagation tests use the tables relative to the Sun.
SUN_ARCS = ['voyager2_1990_1992', 'voyager1_1995_2000', 'pioneer10_1980_1985', 'newhorizons_2008_2009', 'newhorizons_2012_2014',
            'cassini_2001_2002', 'juno_2014_2015', 'mars2020_cruise', 'ulysses_1993_1994']

def arcs_sun():
    out = {}
    for name in SUN_ARCS:
        sid, start, stop, step = ARCS[name]
        rows = H.vectors('arcsun_' + name, sid, '500@10', start, stop, step)
        out[name] = {'horizonsId': sid, 'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]}
    dump('arcs_sun', {'center': 'SUN', 'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons spacecraft trajectories', 'arcs': out})

# ---------------------------------------------------------------- 4. moons (fit set and check set)
MOONS = {'PHOBOS': ('401', '499'), 'DEIMOS': ('402', '499'),
         'IO': ('501', '599'), 'EUROPA': ('502', '599'), 'GANYMEDE': ('503', '599'), 'CALLISTO': ('504', '599'),
         'MIMAS': ('601', '699'), 'ENCELADUS': ('602', '699'), 'TETHYS': ('603', '699'), 'DIONE': ('604', '699'),
         'RHEA': ('605', '699'), 'TITAN': ('606', '699'), 'IAPETUS': ('608', '699'),
         'MIRANDA': ('705', '799'), 'ARIEL': ('701', '799'), 'UMBRIEL': ('702', '799'), 'TITANIA': ('703', '799'), 'OBERON': ('704', '799'),
         'TRITON': ('801', '899'), 'CHARON': ('901', '999')}

def moons():
    fit, check = {}, {}
    for name, (mid, pid) in MOONS.items():
        rows = H.vectors('moon_fit_' + name, mid, '500@' + pid, '2000-01-01 00:00', '2050-01-01 00:00', '1499')
        fit[name] = {'center': pid, 'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]}
        rows = H.vectors('moon_check_' + name, mid, '500@' + pid, '1975-03-03 07:00', '2074-11-11 19:00', '211')
        check[name] = {'center': pid, 'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]}
        rows = H.vectors('moon_dense_' + name, mid, '500@' + pid, '2025-03-01 00:00', '2025-03-05 00:00', '20m')
        fit[name]['jd'] += [r[0] for r in rows]; fit[name]['state'] += [r[1] for r in rows]
    dump('moons_fit', {'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons', 'note': 'relative to the planet centre', 'bodies': fit})
    dump('moons_check', {'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons', 'note': 'relative to the planet centre', 'bodies': check})

# ---------------------------------------------------------------- 5. small bodies (check set; the fit set is made by tools/ephem/build_small.py)
SMALL = {'CERES': '1;', 'VESTA': '4;', 'PSYCHE': '16;', 'EROS': '433;', 'ITOKAWA': '25143;', 'RYUGU': '162173;',
         'BENNU': '101955;', 'DIDYMOS': '65803;', 'ARROKOTH': '486958;', 'HALLEY': 'DES=1P; CAP;', 'CHURYUMOV_GERASIMENKO': 'DES=67P; CAP;'}

def small_check():
    out = {}
    for name, cmd in SMALL.items():
        rows = H.vectors('small_checkb_' + name, cmd, '500@0', '1980-02-03 05:00', '2059-11-17 13:00', '173')
        out[name] = {'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]}
    dump('small_check', {'center': 'SSB', 'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons', 'bodies': out})

# ---------------------------------------------------------------- 6. reference frames and osculating elements
FRAME_BODIES = {'MARS': '499', 'VENUS': '299', 'JUPITER_BARYCENTER': '5', 'EARTH': '399'}
FRAME_TIMES = [2433300.5, 2440000.5, 2451545.0, 2459000.5, 2470000.5, 2488000.5]

def frames():
    """Heliocentric vectors in the ICRF and in the ecliptic of J2000, and heliocentric osculating elements."""
    out = {}
    for name, cid in FRAME_BODIES.items():
        icrf = H.vectors('frame_icrf_' + name, cid, '500@10', tlist=FRAME_TIMES, ref_plane='FRAME')
        ecl = H.vectors('frame_ecl_' + name, cid, '500@10', tlist=FRAME_TIMES, ref_plane='ECLIPTIC')
        text = H.query('frame_elem_' + name, COMMAND=cid, OBJ_DATA='NO', MAKE_EPHEM='YES', EPHEM_TYPE='ELEMENTS',
                       CENTER='500@10', REF_PLANE='ECLIPTIC', REF_SYSTEM='ICRF', OUT_UNITS='KM-S', CSV_FORMAT='YES',
                       TIME_TYPE='TDB', TLIST=','.join(repr(t) for t in FRAME_TIMES), TLIST_TYPE='JD')
        import re
        body = re.search(r'\$\$SOE(.*?)\$\$EOE', text, re.S).group(1).strip().splitlines()
        keys = ['EC', 'QR', 'IN', 'OM', 'W', 'Tp', 'N', 'MA', 'TA', 'A', 'AD', 'PR']
        elems = []
        for line in body:
            f = [x.strip() for x in line.split(',')]
            elems.append(dict(zip(keys, [float(x) for x in f[2:14]])))
        gm = float(re.search(r'Keplerian GM\s*:\s*([0-9.E+-]+)\s*km\^3/s\^2', text).group(1))
        out[name] = {'jd': [r[0] for r in icrf], 'icrf': [r[1] for r in icrf], 'ecliptic': [r[1] for r in ecl], 'elements': elems, 'keplerianGm': gm}
    dump('frames', {'center': 'SUN', 'timeScale': 'TDB', 'source': 'JPL Horizons',
                    'note': 'ecliptic = ecliptic and mean equinox of J2000 (Horizons REF_PLANE=ECLIPTIC); elements: km, km/s, deg', 'bodies': out})

def dsm():
    """Heliocentric states at 6 h steps around the deep-space maneuvers of Cassini (1998-12) and Juno (2012-08, 2012-09)."""
    rows = H.vectors('cassini_dsm_search', '-82', '500@10', '1998-11-20', '1998-12-20', '6h')
    dump('cassini_dsm', {'center': 'SUN', 'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons, Cassini trajectory (-82)',
                         'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]})
    rows = H.vectors('juno_dsm_search', '-61', '500@10', '2012-08-01', '2012-10-15', '6h')
    dump('juno_dsm', {'center': 'SUN', 'frame': 'ICRF', 'timeScale': 'TDB', 'source': 'JPL Horizons, Juno trajectory (-61)',
                      'jd': [r[0] for r in rows], 'state': [r[1] for r in rows]})

if __name__ == '__main__':
    which = sys.argv[1:] or ['planets', 'encounters', 'arcs', 'arcs_sun', 'moons', 'small_check', 'frames', 'dsm']
    for w in which:
        globals()[w]()

"""Make src/engine/data/famous.json: the facts (bodies, times, aim points) of real missions.

Source of every number: the JPL Horizons spacecraft trajectories in truth/horizons/encounters.json and
truth/horizons/cassini_dsm.json, and the start times in truth/horizons/raw/info_<mission>.txt.
The file has no trajectory: the application solves each path at run time from these facts.

Run from the project root:  tools/.venv/bin/python tools/truth/build_famous.py
"""
import json, math, re
import numpy as np

C = json.load(open('src/engine/data/constants.json'))['bodies']
ENC = json.load(open('truth/horizons/encounters.json'))['missions']
NAME = {'199': 'MERCURY', '299': 'VENUS', '399': 'EARTH', '499': 'MARS', '599': 'JUPITER', '699': 'SATURN', '799': 'URANUS', '899': 'NEPTUNE', '999': 'PLUTO'}
SYSTEM = {'199': '1', '299': '2', '399': '399', '499': '4', '599': '5', '699': '6', '799': '7', '899': '8', '999': '9'}
OBL = math.radians(84381.448 / 3600)
ECL_POLE = np.array([0.0, -math.sin(OBL), math.cos(OBL)])

def gm(pid):
    return C[SYSTEM[pid]]['gm']

def bplane(state, mu):
    r = np.array(state[:3]); v = np.array(state[3:])
    R = np.linalg.norm(r); v2 = v @ v
    energy = v2 / 2 - mu / R
    h = np.cross(r, v)
    ev = ((v2 - mu / R) * r - (r @ v) * v) / mu
    e = np.linalg.norm(ev)
    a = -mu / (2 * energy)
    out = {'e': e, 'a': a, 'rp': a * (1 - e)}
    if energy <= 0:
        out['ra'] = a * (1 + e)
        return out
    vinf = math.sqrt(2 * energy)
    P = ev / e; Q = np.cross(h, ev); Q /= np.linalg.norm(Q)
    k = math.sqrt(e * e - 1)
    S = P / e + Q * k / e
    B = (P * k / e - Q / e) * (-a * k)
    T = np.cross(S, ECL_POLE); T /= np.linalg.norm(T)
    Rv = np.cross(S, T)
    cosnu = max(-1.0, min(1.0, (ev @ r) / (e * R)))
    nu = math.acos(cosnu)
    if r @ v < 0: nu = -nu
    F = 2 * math.atanh(math.sqrt((e - 1) / (e + 1)) * math.tan(nu / 2))
    n = math.sqrt(mu / (-a) ** 3)
    out.update({'vinf': vinf, 'BdotT': float(B @ T), 'BdotR': float(B @ Rv), 'timeToPeriapsis': -(e * math.sinh(F) - F) / n})
    return out

def closest(e):
    """Time (JD TDB) and radius of closest approach: parabola through the 1-minute samples at the minimum."""
    fr = [float(np.linalg.norm(s[:3])) for s in e['fine']['state']]
    m = fr.index(min(fr))
    if m == 0 or m == len(fr) - 1:
        return e['fine']['jd'][m], fr[m]
    a, b, c = fr[m - 1] ** 2, fr[m] ** 2, fr[m + 1] ** 2
    x = 0.5 * (a - c) / (a - 2 * b + c)
    return e['fine']['jd'][m] + x / 1440.0, math.sqrt(b - 0.25 * (a - c) * x)

def start_tdb(name):
    text = open(f'truth/horizons/raw/info_{name}.txt').read()
    m = re.search(r'prior to A\.D\. (\d{4})-([A-Z]{3})-(\d\d) (\d\d:\d\d:\d\d\.\d+) TDB', text)
    mon = {'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6, 'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12}[m.group(2)]
    return '%s-%02d-%s %s' % (m.group(1), mon, m.group(3), m.group(4))

def encounter(e, last=False, burn=False):
    pid = e['planet']
    jd, rad = closest(e)
    if burn:
        # An insertion burn occurs near the periapsis: use the approach hyperbola 12 hours before the closest approach.
        hj = e['hourly']['jd']
        k = min(range(len(hj)), key=lambda q: abs(hj[q] - (jd - 0.5)))
        bp = bplane(e['hourly']['state'][k], gm(pid))
        return {'body': NAME[pid], 'jdTdb': hj[k] + bp['timeToPeriapsis'] / 86400.0, 'radiusKm': bp['rp'], 'vinfKmS': bp['vinf'],
                'aim': {'BdotT': bp['BdotT'], 'BdotR': bp['BdotR']}, 'approachLeadS': bp['timeToPeriapsis'],
                'note': 'Periapsis of the approach hyperbola 12 hours before the closest approach (before the insertion burn). Closest approach in the data: JD %.6f TDB, %.0f km.' % (jd, rad)}
    bp = bplane(e['stateAtClosest'], gm(pid))
    out = {'body': NAME[pid], 'jdTdb': jd, 'radiusKm': rad, 'vinfKmS': bp.get('vinf')}
    if last:
        out['aim'] = {'BdotT': bp['BdotT'], 'BdotR': bp['BdotR']}
    return out

GM_SUN = C['10']['gm']

def jumps(name, limit=0.02):
    """Velocity jumps (maneuvers) in 6 h heliocentric samples: the change of velocity minus the effect of the gravity of the Sun."""
    d = json.load(open(f'truth/horizons/{name}.json'))
    out = []
    for k in range(len(d['jd']) - 1):
        s0 = np.array(d['state'][k]); s1 = np.array(d['state'][k + 1])
        dt = (d['jd'][k + 1] - d['jd'][k]) * 86400.0
        g0 = -GM_SUN * s0[:3] / np.linalg.norm(s0[:3]) ** 3
        g1 = -GM_SUN * s1[:3] / np.linalg.norm(s1[:3]) ** 3
        dv = float(np.linalg.norm(s1[3:] - s0[3:] - 0.5 * (g0 + g1) * dt))
        if dv > limit:
            out.append({'jdTdb': 0.5 * (d['jd'][k] + d['jd'][k + 1]), 'dvKmS': dv,
                        'note': 'Velocity jump between two samples 6 hours apart (gravity of the Sun removed).'})
    return out

missions = {}

def tour(name, picks, arrival='flyby'):
    encs = [ENC[name]['encounters'][k] for k in picks]
    m = {'startTdb': start_tdb(name), 'encounters': [encounter(e, i == len(encs) - 1, arrival == 'orbit' and i == len(encs) - 1) for i, e in enumerate(encs)], 'arrival': arrival,
         'source': 'JPL Horizons trajectory ' + ENC[name]['horizonsId']}
    missions[name] = m
    return m, encs

tour('voyager2', [0, 1, 2, 3])
tour('voyager1', [0, 1])
tour('newhorizons', [0, 1])
tour('ulysses', [0])
tour('pioneer11', [0, 1])

# Cassini: deep-space maneuver and the orbit after the insertion burn
m, encs = tour('cassini', [0, 1, 2, 3, 4], arrival='orbit')
m['dsm'] = jumps('cassini_dsm')
last = encs[-1]
after = bplane(last['hourly']['state'][-1], gm('699'))
m['orbitAfterArrival'] = {'periapsisRadiusKm': closest(last)[1], 'apoapsisRadiusKm': after['ra'], 'note': 'Osculating orbit about Saturn 2 days after the insertion burn'}

# Juno: Earth flyby and the orbit after the insertion burn
m, encs = tour('juno', [0, 1], arrival='orbit')
m['dsm'] = jumps('juno_dsm')
after = bplane(encs[-1]['hourly']['state'][-1], gm('599'))
m['orbitAfterArrival'] = {'periapsisRadiusKm': closest(encs[-1])[1], 'apoapsisRadiusKm': after['ra'], 'note': 'Osculating orbit about Jupiter 2 days after the insertion burn'}

# Mars 2020: the trajectory ends on the surface. The aim point comes from the approach hyperbola at the last
# hourly sample that is more than 60,000 km from Mars.
e = ENC['mars2020']['encounters'][0]
rng = [float(np.linalg.norm(x[:3])) for x in e['hourly']['state']]
k = max(q for q in range(len(rng) - 1) if rng[q] > 60000 and rng[q + 1] < rng[q])
bp = bplane(e['hourly']['state'][k], gm('499'))
missions['mars2020'] = {
    'startTdb': start_tdb('mars2020'), 'arrival': 'entry', 'source': 'JPL Horizons trajectory ' + ENC['mars2020']['horizonsId'],
    'encounters': [{'body': 'MARS', 'jdTdb': e['hourly']['jd'][k] + bp['timeToPeriapsis'] / 86400.0, 'radiusKm': bp['rp'], 'vinfKmS': bp['vinf'],
                    'aim': {'BdotT': bp['BdotT'], 'BdotR': bp['BdotR']}, 'approachLeadS': bp['timeToPeriapsis'],
                    'note': 'Vacuum periapsis of the approach hyperbola (below the surface: the spacecraft enters the atmosphere). End of the data: JD %.6f TDB.' % e['fine']['jd'][-1]}],
}

json.dump(json.loads(json.dumps({'note': 'Facts of real missions from JPL Horizons trajectories. Times: Julian date, TDB. Aim points: B-plane, T = S x (ecliptic north pole), km.',
           'missions': missions}, default=float)), open('src/engine/data/famous.json', 'w'), indent=1)
for k, v in missions.items():
    print(k, v['startTdb'], [(x['body'], round(float(x['jdTdb']), 5), round(x['radiusKm']), round(x['vinfKmS'], 3)) for x in v['encounters']], v.get('dsm', ''))

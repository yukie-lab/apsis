"""Small client for the JPL Horizons API with an on-disk cache of the raw responses.

The raw text of each response is kept in truth/horizons/raw/ as the record of the source.
"""
import hashlib, os, re, time, urllib.parse, urllib.request

RAW = 'truth/horizons/raw'
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'

def query(key, raw_dir=None, **params):
    """Return the raw text of a Horizons request. `key` names the cache file."""
    raw_dir = raw_dir or RAW
    os.makedirs(raw_dir, exist_ok=True)
    path = os.path.join(raw_dir, key + '.txt')
    if os.path.exists(path):
        return open(path).read()
    p = {'format': 'text'}
    p.update({k: "'" + str(v) + "'" for k, v in params.items()})
    url = API + '?' + urllib.parse.urlencode(p)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=180) as r:
                text = r.read().decode()
            break
        except Exception as e:  # network errors: wait and try again
            time.sleep(2 ** (attempt + 1))
            err = e
    else:
        raise err
    with open(path, 'w') as fh:
        fh.write('# REQUEST ' + url + '\n# RETRIEVED ' + time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()) + '\n' + text)
    time.sleep(0.4)
    return text

def vectors(key, command, center, start=None, stop=None, step=None, tlist=None, ref_plane='FRAME', raw_dir=None):
    """Geometric state vectors (ICRF, km, km/s), time scale TDB. Returns list of (jd, [x,y,z,vx,vy,vz])."""
    kw = dict(COMMAND=command, OBJ_DATA='NO', MAKE_EPHEM='YES', EPHEM_TYPE='VECTORS', CENTER=center,
              VEC_TABLE='2', REF_PLANE=ref_plane, REF_SYSTEM='ICRF', OUT_UNITS='KM-S', VEC_CORR='NONE',
              CSV_FORMAT='YES', VEC_LABELS='NO', TIME_TYPE='TDB')
    if tlist is not None:
        kw['TLIST'] = ','.join(repr(float(t)) for t in tlist)
        kw['TLIST_TYPE'] = 'JD'
    else:
        kw.update(START_TIME=start, STOP_TIME=stop, STEP_SIZE=step)
    text = query(key, raw_dir=raw_dir, **kw)
    return parse_vectors(text)

def parse_vectors(text):
    m = re.search(r'\$\$SOE(.*?)\$\$EOE', text, re.S)
    if not m:
        raise RuntimeError('no ephemeris in response:\n' + text[:3000])
    out = []
    for line in m.group(1).strip().splitlines():
        f = [s.strip() for s in line.split(',')]
        out.append((float(f[0]), [float(x) for x in f[2:8]]))
    return out

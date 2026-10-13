"""Read physical data of the small bodies from the JPL Small-Body Database API.
Output: src/engine/data/small.json. Raw responses: truth/sbdb/raw/."""
import json, os, urllib.request, urllib.parse, time
BODIES = [('CERES', '1', 'dwarf', '#b8b2a8'), ('VESTA', '4', 'asteroid', '#c9c0b3'), ('PSYCHE', '16', 'asteroid', '#a9a39b'),
          ('EROS', '433', 'asteroid', '#b89f84'), ('ITOKAWA', '25143', 'asteroid', '#a89c8e'), ('RYUGU', '162173', 'asteroid', '#6f6a66'),
          ('BENNU', '101955', 'asteroid', '#5f5c5a'), ('DIDYMOS', '65803', 'asteroid', '#9c948b'), ('ARROKOTH', '486958', 'asteroid', '#b5745a'),
          ('HALLEY', '1P', 'comet', '#cfe6f2'), ('CHURYUMOV_GERASIMENKO', '67P', 'comet', '#cfe6f2')]
os.makedirs('truth/sbdb/raw', exist_ok=True)
out = []
for bid, des, kind, color in BODIES:
    path = f'truth/sbdb/raw/{bid}.json'
    if not os.path.exists(path):
        url = 'https://ssd-api.jpl.nasa.gov/sbdb.api?' + urllib.parse.urlencode({'sstr': des, 'phys-par': '1'})
        open(path, 'w').write(urllib.request.urlopen(url, timeout=60).read().decode()); time.sleep(0.5)
    d = json.load(open(path))
    phys = {p['name']: p for p in d.get('phys_par', [])}
    diam = float(phys['diameter']['value']) if 'diameter' in phys else None
    gm = float(phys['GM']['value']) if 'GM' in phys else 0.0
    o = d['object']
    out.append({'id': bid, 'naif': int(o['spkid']), 'kind': kind, 'designation': o['fullname'].strip(),
                'radiusKm': diam / 2 if diam else None, 'gm': gm, 'color': color,
                'radiusSource': phys['diameter'].get('ref') if diam else None})
    print(bid, o['spkid'], o['fullname'].strip(), diam, gm)
json.dump({'source': 'JPL Small-Body Database API (sbdb.api, phys-par)', 'bodies': out}, open('src/engine/data/small.json', 'w'), indent=1)

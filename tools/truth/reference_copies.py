"""Record of the local copies of documents and pages that are not in the repository.

Use:
  tools/.venv/bin/python tools/truth/reference_copies.py           compares each local copy with the record
  tools/.venv/bin/python tools/truth/reference_copies.py --write   writes the record again from the local copies

The record is data-src/reference-copies.json. For each copy it has the address, the time of the copy, the size and
the SHA-256. The documents and pages are not in the repository: the project did not find the conditions for a copy
of each document (decision D79). The NAIF kernels are not in the repository because of their size.
The license records of the maps (data-src/textures/evidence) and the records of the conditions of use of the engine
data (data-src/evidence) contain text from the pages of the sources: they are local copies too.
To get a copy again, load the address. A page can change: then the SHA-256 is different.
"""
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
RECORD = 'data-src/reference-copies.json'

NSSDC_FACT = 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/'
NSSDC_CATALOG = 'https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id='
SANA = 'https://sanaregistry.org/r/'
STK = 'https://help.agi.com/stk/Content/stk/'
NAIF = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/'

NO_CONDITIONS = 'The project did not find the conditions for a copy.'
SIZE = 'Size. The NAIF rules permit a copy of a kernel that has no changes (data-src/evidence/naif_rules.txt).'

# Source data of the engine: (path, address, document, use in the project)
KERNELS = [
    ('data-src/kernels/de440s.bsp', NAIF + 'spk/planets/de440s.bsp',
     'NAIF generic kernel: JPL planet ephemeris DE440, short version', 'tools/ephem/build_ephem.py'),
    ('data-src/kernels/gm_de440.tpc', NAIF + 'pck/gm_de440.tpc',
     'NAIF generic kernel: mass parameters of DE440', 'tools/ephem/build_constants.py'),
    ('data-src/kernels/pck00011.tpc', NAIF + 'pck/pck00011.tpc',
     'NAIF generic kernel: sizes and orientation of the bodies', 'tools/ephem/build_constants.py'),
    ('data-src/kernels/naif0012.tls', NAIF + 'lsk/naif0012.tls',
     'NAIF generic kernel: leap seconds', 'tools/ephem/build_constants.py'),
]

# (path, address, document, use in the project)
COPIES = [
    ('data-src/specs/ccsds/502x0b1s.pdf', 'https://public.ccsds.org/Pubs/502x0b1s.pdf',
     'CCSDS 502.0-B-1, Orbit Data Messages', 'docs/IO_FORMATS.md'),
    ('data-src/specs/ccsds/502x0b2s.pdf', 'https://public.ccsds.org/Pubs/502x0b2s.pdf',
     'CCSDS 502.0-B-2, Orbit Data Messages', 'docs/IO_FORMATS.md'),
    ('data-src/specs/ccsds/502x0b3e1.pdf', 'https://public.ccsds.org/Pubs/502x0b3e1.pdf',
     'CCSDS 502.0-B-3, Orbit Data Messages', 'docs/IO_FORMATS.md'),
    ('data-src/specs/gmat/help-letter.pdf',
     'https://gmat.atlassian.net/wiki/download/attachments/380273216/help-letter.pdf?api=v2',
     'GMAT User Guide R2015a', 'docs/IO_FORMATS.md'),
    ('data-src/specs/gmat/ntrs-20170001580.pdf',
     'https://ntrs.nasa.gov/api/citations/20170001580/downloads/20170001580.pdf',
     'NASA presentation about GMAT R2016a, NTRS document 20170001580', 'docs/IO_FORMATS.md (not used)'),
    ('data-src/specs/sana/celestial_body_reference_frames.html', SANA + 'celestial_body_reference_frames/?per_page=500',
     'SANA registry, celestial body reference frames', 'docs/IO_FORMATS.md'),
    ('data-src/specs/sana/orbit_centers.html', SANA + 'orbit_centers/?per_page=500',
     'SANA registry, orbit centers', 'docs/IO_FORMATS.md'),
    ('data-src/specs/sana/orbit_relative_reference_frames.html', SANA + 'orbit_relative_reference_frames/?per_page=500',
     'SANA registry, orbit-relative reference frames', 'docs/IO_FORMATS.md'),
    ('data-src/specs/sana/time_systems.html', SANA + 'time_systems/?per_page=500',
     'SANA registry, time systems', 'docs/IO_FORMATS.md'),
    ('data-src/specs/stk/importfiles-02.htm', STK + 'importfiles-02.htm',
     'STK help, "Ephemeris File Format (*.e)"', 'docs/IO_FORMATS.md'),
    ('data-src/specs/stk/example_ephemeris2.htm', STK + 'example_ephemeris2.htm',
     'STK help, sample file of the ephemeris format', 'docs/IO_FORMATS.md'),
    ('data-src/specs/stk/example_ephemeris3.htm', STK + 'example_ephemeris3.htm',
     'STK help, sample file of the ephemeris format', 'docs/IO_FORMATS.md'),
    ('data-src/specs/stk/example_ephemeris5.htm', STK + 'example_ephemeris5.htm',
     'STK help, sample file of the ephemeris format', 'docs/IO_FORMATS.md'),
    ('data-src/specs/stk/example_ephemeris6.htm', STK + 'example_ephemeris6.htm',
     'STK help, sample file of the ephemeris format', 'docs/IO_FORMATS.md'),
    ('truth/published/nasa_voyager2.html', 'https://science.nasa.gov/mission/voyager/voyager-2/',
     'NASA Science, Voyager 2 mission page', 'truth/published/published.json'),
    ('truth/published/nasa_cassini_timeline.html', 'https://science.nasa.gov/mission/cassini/the-journey/timeline/',
     'NASA Science, Cassini timeline', 'truth/published/published.json'),
    ('truth/published/jpl_mars2020_presskit.html', 'https://www.jpl.nasa.gov/news/press_kits/mars_2020/launch/mission/',
     'JPL, Mars 2020 Perseverance Launch Press Kit, mission page', 'truth/published/published.json'),
    ('truth/published/nssdc_mars2020.html', NSSDC_CATALOG + '2020-052A',
     'NASA NSSDCA Master Catalog, Mars 2020', 'truth/published/published.json, docs/ASSETS.md'),
    ('truth/published/nssdc_newhorizons.html', NSSDC_CATALOG + '2006-001A',
     'NASA NSSDCA Master Catalog, New Horizons', 'truth/published/published.json, docs/ASSETS.md'),
    ('truth/published/nssdc_voyager1.html', NSSDC_CATALOG + '1977-084A',
     'NASA NSSDCA Master Catalog, Voyager 1', 'docs/ASSETS.md'),
    ('truth/published/nssdc_voyager2.html', NSSDC_CATALOG + '1977-076A',
     'NASA NSSDCA Master Catalog, Voyager 2', 'docs/ASSETS.md'),
] + [
    ('data-src/factsheets/' + name + '.html', NSSDC_FACT + name + '.html', 'NSSDC ' + title, use)
    for name, title, use in [
        ('earthfact', 'Earth Fact Sheet', 'docs/ASSETS.md'),
        ('jupiterfact', 'Jupiter Fact Sheet', 'docs/ASSETS.md'),
        ('marsfact', 'Mars Fact Sheet', 'docs/ASSETS.md'),
        ('mercuryfact', 'Mercury Fact Sheet', 'docs/ASSETS.md'),
        ('neptunefact', 'Neptune Fact Sheet', 'docs/ASSETS.md'),
        ('satringfact', 'Saturnian Rings Fact Sheet', 'src/render/bodies/rings.ts'),
        ('saturnfact', 'Saturn Fact Sheet', 'docs/ASSETS.md'),
        ('uranringfact', 'Uranian Rings Fact Sheet', 'src/render/bodies/rings.ts'),
        ('uranusfact', 'Uranus Fact Sheet', 'docs/ASSETS.md'),
        ('venusfact', 'Venus Fact Sheet', 'docs/ASSETS.md'),
    ]
]


# Records of the conditions of use of the engine data: notes of the project and text from the pages of the sources.
RULES = [
    ('data-src/evidence/naif_rules.txt', 'https://naif.jpl.nasa.gov/naif/rules.html',
     'Text of the NAIF page "Rules Regarding Use of SPICE"', 'docs/ASSETS.md'),
    ('data-src/evidence/jpl_ssd_api_fair_use.txt', 'https://ssd-api.jpl.nasa.gov/doc/index.php',
     'Text of the JPL page "API Documentation"', 'docs/ASSETS.md'),
]

EVIDENCE = 'data-src/textures/evidence'


def evidence():
    """License records of the maps: notes of the project and text from the pages of the sources.

    A file of one map has the line "Source page:". A file in _shared/ has the line "SOURCE:".
    """
    rows = []
    for folder, _, names in sorted(os.walk(os.path.join(ROOT, EVIDENCE))):
        for name in sorted(names):
            if not name.endswith('.txt'):
                continue
            path = os.path.relpath(os.path.join(folder, name), ROOT)
            shared = os.path.basename(folder) == '_shared'
            key = 'SOURCE:' if shared else 'Source page:'
            url = ''
            with open(os.path.join(ROOT, path), encoding='utf-8') as f:
                for line in f:
                    if line.startswith(key):
                        url = line[len(key):].strip().split(' ')[0]
                        break
            if not url:
                raise SystemExit('%s: no line "%s"' % (path, key))
            document = ('Text of a page about the license and the credit of the maps' if shared
                        else 'License record of the map "%s": notes of the project and text from the pages of the source' % name[:-4])
            rows.append((path, url, document, 'public/textures/manifest.json (licenceStatement), docs/ASSETS.md'))
    return rows


def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def measure(path):
    full = os.path.join(ROOT, path)
    stamp = datetime.fromtimestamp(os.path.getmtime(full), timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    return {'bytes': os.path.getsize(full), 'sha256': digest(full), 'copiedUtc': stamp}


def write():
    rows = []
    for group, reason in ((KERNELS, SIZE), (COPIES, NO_CONDITIONS), (RULES, NO_CONDITIONS), (evidence(), NO_CONDITIONS)):
        for path, url, document, use in group:
            rows.append({'path': path, 'document': document, 'url': url, 'usedIn': use,
                         'notInRepository': reason, **measure(path)})
    record = {
        'note': 'Local copies of source data, documents and pages from other sources. The copies are not in the '
                'repository (decision D79). copiedUtc is the time when the file was written on the computer of '
                'the project. On 2026-10-14, a second copy from each address of the kernels and of the NSSDC '
                'fact sheets had the same SHA-256. The files in data-src/textures/evidence are the license records '
                'of the maps: each file has notes of the project and text from the pages of the source. The files '
                'in data-src/evidence are the records of the conditions of use of the engine data.',
        'copies': rows,
    }
    with open(os.path.join(ROOT, RECORD), 'w') as f:
        json.dump(record, f, indent=1)
        f.write('\n')
    print('wrote %s: %d copies, %.1f MB' % (RECORD, len(rows), sum(r['bytes'] for r in rows) / 1e6))


def check():
    with open(os.path.join(ROOT, RECORD)) as f:
        rows = json.load(f)['copies']
    missing = changed = 0
    for row in rows:
        full = os.path.join(ROOT, row['path'])
        if not os.path.exists(full):
            missing += 1
            print('no local copy  ' + row['path'])
        elif digest(full) != row['sha256']:
            changed += 1
            print('DIFFERENT      ' + row['path'])
    print('%d copies in the record, %d with no local copy, %d different' % (len(rows), missing, changed))
    return 1 if changed else 0


if __name__ == '__main__':
    if '--write' in sys.argv:
        write()
    sys.exit(check())

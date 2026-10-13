"""Convert the NAIF text kernels to src/engine/data/constants.json.

Sources (NAIF generic kernels): gm_de440.tpc, pck00011.tpc, naif0012.tls.
Only values inside \\begindata sections are read.
"""
import json, re, hashlib

def read_kernel(path):
    text = open(path, encoding='latin-1').read()
    data = ''.join(re.findall(r'\\begindata(.*?)(?:\\begintext|\Z)', text, re.S))
    out = {}
    for m in re.finditer(r'([A-Z0-9_/]+)\s*\+?=\s*(\([^)]*\)|[^\s]+)', data):
        raw = m.group(2).strip('()').replace(',', ' ').split()
        vals = []
        for tok in raw:
            if tok.startswith('@'):
                vals.append(tok[1:])
            else:
                try:
                    vals.append(float(tok.replace('D', 'E')))
                except ValueError:
                    vals.append(tok.strip("'"))
        out[m.group(1)] = vals
    return out, hashlib.sha256(open(path, 'rb').read()).hexdigest()

gm, gm_sha = read_kernel('data-src/kernels/gm_de440.tpc')
pck, pck_sha = read_kernel('data-src/kernels/pck00011.tpc')
lsk, lsk_sha = read_kernel('data-src/kernels/naif0012.tls')

IDS = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 199, 299, 399, 301, 499, 401, 402, 599, 501, 502, 503, 504,
       699, 601, 602, 603, 604, 605, 606, 608, 799, 701, 702, 703, 704, 705, 899, 801, 999, 901]
bodies = {}
for i in IDS:
    b = {}
    if f'BODY{i}_GM' in gm: b['gm'] = gm[f'BODY{i}_GM'][0]
    if f'BODY{i}_RADII' in pck: b['radii'] = pck[f'BODY{i}_RADII']
    for k, n in (('POLE_RA', 'poleRa'), ('POLE_DEC', 'poleDec'), ('PM', 'pm')):
        if f'BODY{i}_{k}' in pck: b[n] = pck[f'BODY{i}_{k}']
    bodies[str(i)] = b

months = {m: k + 1 for k, m in enumerate('JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split())}
at = lsk['DELTET/DELTA_AT']
leaps = []
for k in range(0, len(at), 2):
    y, mon, d = at[k + 1].split('-')
    leaps.append({'taiMinusUtc': at[k], 'utc': '%s-%02d-%02d' % (y, months[mon], int(d))})

out = {
    'sources': {'gm_de440.tpc': gm_sha, 'pck00011.tpc': pck_sha, 'naif0012.tls': lsk_sha},
    'bodies': bodies,
    'time': {'deltaTA': lsk['DELTET/DELTA_T_A'][0], 'K': lsk['DELTET/K'][0], 'EB': lsk['DELTET/EB'][0],
             'M': lsk['DELTET/M'], 'leapSeconds': leaps},
}
json.dump(out, open('src/engine/data/constants.json', 'w'), indent=1)
print(json.dumps(out['time'])[:400]); print(bodies['599'], bodies['606'], bodies['3'])

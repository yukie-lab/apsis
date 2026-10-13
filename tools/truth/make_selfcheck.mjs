// Makes src/validation/selfcheck.json: a small set of JPL Horizons reference values that the product uses to
// measure its accuracy again in the browser of the user (Accuracy screen, "Checks on this computer").
// Input: truth/horizons/*.json (made by tools/truth/fetch_truth.py). Run: node tools/truth/make_selfcheck.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(`truth/horizons/${name}.json`, 'utf8'));
const planets = read('planets'), small = read('small_check'), frames = read('frames');

const pickEpochs = (b, idx) => ({ jd: idx.map((i) => b.jd[i]), state: idx.map((i) => b.state[i]) });
const positions = {};
for (const name of ['SUN', 'MERCURY', 'VENUS', 'EARTH', 'MOON', 'MARS', 'JUPITER_BARYCENTER', 'SATURN_BARYCENTER', 'URANUS_BARYCENTER', 'NEPTUNE_BARYCENTER', 'PLUTO_BARYCENTER']) {
  const b = planets.bodies[name];
  positions[name] = pickEpochs(b, [15, 105, 160, 215, 300]);
}
const smallBodies = {};
for (const name of ['CERES', 'BENNU', 'HALLEY']) smallBodies[name] = pickEpochs(small.bodies[name], [20, 90, 150]);

// One arc for the propagation check: two consecutive epochs of an asteroid.
const eros = small.bodies.EROS;
const k = 100;
const arc = { body: 'EROS', jd0: eros.jd[k], state0: eros.state[k], jd1: eros.jd[k + 1], state1: eros.state[k + 1] };

const mars = frames.bodies.MARS;
const frame = { body: 'MARS', center: 'SUN', jd: mars.jd[3], icrf: mars.icrf[3], ecliptic: mars.ecliptic[3] };

const out = {
  note: 'Reference values from JPL Horizons (ICRF, TDB, km and km/s; centre: solar system barycentre if not given).',
  source: planets.source,
  positions, small: smallBodies, arc, frame,
};
writeFileSync('src/validation/selfcheck.json', JSON.stringify(out) + '\n');
console.log('selfcheck.json', JSON.stringify(out).length, 'bytes; arc days', arc.jd1 - arc.jd0);

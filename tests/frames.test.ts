import { describe, it, expect, afterAll } from 'vitest';
import { solarSystem, truth, Recorder } from './util';
import { jdTdbToEt } from '../src/engine/time';
import { type Vec3, dist, norm, DEG } from '../src/engine/vec';
import { fromIcrf, toIcrf, stateFromIcrf } from '../src/engine/frames';
import { elementsFromState, stateFromElements, apsides, meanFromTrue, period } from '../src/engine/kepler';
import { GM_SUN } from '../src/engine/bodies';

const rec = new Recorder('frames');
afterAll(() => rec.save());
const sys = solarSystem();
const f = truth('frames').bodies;

describe('reference frames against JPL Horizons', () => {
  it('ICRF to ECLIPJ2000 rotation agrees with the Horizons ecliptic vectors', () => {
    let max = 0, maxRel = 0;
    for (const b of Object.values<any>(f)) {
      for (let k = 0; k < b.jd.length; k++) {
        const r = fromIcrf(b.icrf[k].slice(0, 3) as Vec3, 'ECLIPJ2000');
        const e = dist(r, b.ecliptic[k].slice(0, 3) as Vec3);
        max = Math.max(max, e);
        maxRel = Math.max(maxRel, e / norm(r));
        // inverse rotation
        expect(dist(toIcrf(r, 'ECLIPJ2000'), b.icrf[k].slice(0, 3) as Vec3)).toBeLessThan(1e-6);
      }
    }
    // Limit 0.01 km in 8e8 km: only rounding (the rotation angle is the same constant, 84381.448 arcsec).
    rec.add({ id: 'frames.ecliptic', group: 'frames', value: max, unit: 'km', limit: 0.01, truth: 'JPL Horizons vectors of the same body in the ICRF and in the ecliptic of J2000', detail: { maxRelativeError: maxRel } });
    expect(max).toBeLessThan(0.01);
  });

  it('heliocentric ecliptic state of the product agrees with Horizons', () => {
    let max = 0;
    for (const [name, b] of Object.entries<any>(f)) {
      for (let k = 0; k < b.jd.length; k++) {
        const s = stateFromIcrf(sys.stateRel(name, 'SUN', jdTdbToEt(b.jd[k])), 'ECLIPJ2000');
        max = Math.max(max, dist(s.r, b.ecliptic[k].slice(0, 3) as Vec3));
      }
    }
    rec.add({ id: 'frames.heliocentric', group: 'frames', value: max, unit: 'km', limit: 0.02, truth: 'JPL Horizons vectors (heliocentric, ecliptic of J2000) of Venus, the Earth, Mars and the Jupiter barycenter, from 1950 to 2099' });
    expect(max).toBeLessThan(0.02);
  });

  it('osculating elements agree with the Horizons element tables', () => {
    let eA = 0, eE = 0, eInc = 0, eNode = 0, ePeri = 0, eLon = 0, eMean = 0, ePr = 0, eQ = 0;
    const dAng = (a: number, b: number) => { let d = Math.abs(a - b) % 360; if (d > 180) d = 360 - d; return d; };
    for (const [name, b] of Object.entries<any>(f)) {
      // Horizons states the GM that it uses for the elements (Sun + target body) in each table: same value here.
      const mu: number = b.keplerianGm;
      expect(Math.abs(mu - GM_SUN) / GM_SUN).toBeLessThan(2e-3);
      for (let k = 0; k < b.jd.length; k++) {
        const s = stateFromIcrf(sys.stateRel(name, 'SUN', jdTdbToEt(b.jd[k])), 'ECLIPJ2000');
        const el = elementsFromState(s, mu);
        const t = b.elements[k];
        eA = Math.max(eA, Math.abs(el.a - t.A) / t.A);
        eE = Math.max(eE, Math.abs(el.e - t.EC));
        eQ = Math.max(eQ, Math.abs(apsides(el).rp - t.QR) / t.QR);
        ePr = Math.max(ePr, Math.abs(period(el.a, mu) - t.PR) / t.PR);
        eInc = Math.max(eInc, dAng(el.i / DEG, t.IN));
        // The node is not defined for zero inclination and the periapsis is not defined for zero eccentricity.
        // Compare the quantities that are always defined: node error times sin(i), periapsis longitude error
        // times e, true longitude and mean longitude.
        eNode = Math.max(eNode, dAng(el.raan / DEG, t.OM) * Math.sin(el.i));
        ePeri = Math.max(ePeri, dAng((el.raan + el.argp) / DEG, t.OM + t.W) * el.e);
        eLon = Math.max(eLon, dAng((el.raan + el.argp + el.nu) / DEG, t.OM + t.W + t.TA));
        const M = meanFromTrue(el.nu, el.e) / DEG;
        eMean = Math.max(eMean, dAng((el.raan + el.argp) / DEG + M, t.OM + t.W + t.MA));
        // round trip of the elements
        const back = stateFromElements(el, mu);
        expect(dist(back.r, s.r)).toBeLessThan(1e-3);
      }
    }
    // Limits: the product uses a fit of DE440 (position error below 10 m, velocity error about 0.1 mm/s) and
    // Horizons uses DE441. This gives an error of about 4e-9 in the eccentricity vector; the angles that depend
    // on it (periapsis longitude times e, mean longitude) have the same error in radians. Limit for all: 1e-8.
    const rad = (deg: number) => deg * DEG;
    rec.add({ id: 'frames.elements', group: 'frames', value: eA, unit: 'relative', limit: 1e-8, truth: 'JPL Horizons osculating elements (heliocentric, ecliptic of J2000) of Venus, the Earth, Mars and the Jupiter barycenter', detail: { maxEccentricityError: eE, maxPeriapsisRelativeError: eQ, maxPeriodRelativeError: ePr, maxInclinationErrorRad: rad(eInc), maxNodeErrorTimesSinIRad: rad(eNode), maxPeriapsisLongitudeErrorTimesERad: rad(ePeri), maxTrueLongitudeErrorRad: rad(eLon), maxMeanLongitudeErrorRad: rad(eMean) } });
    for (const v of [eA, eE, eQ, ePr, rad(eInc), rad(eNode), rad(ePeri), rad(eLon), rad(eMean)]) expect(v).toBeLessThan(1e-8);
  });
});


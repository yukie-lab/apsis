/**
 * Tisserand graph. Truth: analytic identities of the two-body problem with a circular planet orbit.
 *  - All points of a curve of constant v-infinity have the same Tisserand parameter T = 3 - (vinf / V)^2.
 *  - Pump angle 0: the planet is at the periapsis of the orbit. Pump angle pi: the planet is at the apoapsis.
 *  - A Hohmann transfer from the Earth to Mars (circular orbits) is on the curve of the Earth at its departure
 *    v-infinity and on the curve of Mars at its arrival v-infinity.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { Recorder } from './util';
import { tisserandCurve, tisserandPoint, tisserandParameter, vinfFromTisserand, maxPumpStep } from '../src/engine/tisserand';
import { turnAngle } from '../src/engine/flyby';
import { GM_SUN, AU, BODIES } from '../src/engine/bodies';

const rec = new Recorder('tisserand');
afterAll(() => rec.save());

describe('Tisserand graph', () => {
  it('the Tisserand parameter is constant on a curve', () => {
    let worst = 0;
    for (const [R, vinf] of [[1.0 * AU, 3], [1.0 * AU, 9], [0.723 * AU, 6], [5.2 * AU, 6], [5.2 * AU, 12], [9.58 * AU, 4]] as [number, number][]) {
      const V = Math.sqrt(GM_SUN / R);
      const expected = 3 - (vinf / V) ** 2;
      for (const p of tisserandCurve(R, vinf, 61)) {
        if (!Number.isFinite(p.a)) continue;
        const T = tisserandParameter(R, p.a, p.e);
        worst = Math.max(worst, Math.abs(T - expected));
        expect(Math.abs(vinfFromTisserand(R, T) - vinf)).toBeLessThan(1e-6);
      }
    }
    rec.add({ id: 'tisserand.parameter', group: 'analytic', value: worst, unit: '', limit: 1e-9, truth: 'Analytic: T = 3 − (v∞ / V)² for a circular planet orbit' });
    expect(worst).toBeLessThan(1e-9);
  });

  it('pump angle 0 and pi put the planet at an apsis', () => {
    const R = 5.2 * AU;
    const p0 = tisserandPoint(R, 5, 0);
    const p1 = tisserandPoint(R, 5, Math.PI);
    expect(Math.abs(p0.rp - R) / R).toBeLessThan(1e-12);
    expect(Math.abs(p1.ra - R) / R).toBeLessThan(1e-12);
    // vis-viva at the apsis
    const V = Math.sqrt(GM_SUN / R);
    expect(Math.abs(Math.sqrt(GM_SUN * (2 / R - 1 / p0.a)) - (V + 5))).toBeLessThan(1e-9);
    expect(Math.abs(Math.sqrt(GM_SUN * (2 / R - 1 / p1.a)) - (V - 5))).toBeLessThan(1e-9);
  });

  it('a Hohmann transfer is on the curves of the two planets', () => {
    const r1 = 1.0 * AU, r2 = 1.523679 * AU;
    const a = (r1 + r2) / 2;
    const v1 = Math.sqrt(GM_SUN * (2 / r1 - 1 / a)) - Math.sqrt(GM_SUN / r1);
    const v2 = Math.sqrt(GM_SUN / r2) - Math.sqrt(GM_SUN * (2 / r2 - 1 / a));
    const dep = tisserandPoint(r1, v1, 0);
    const arr = tisserandPoint(r2, v2, Math.PI);
    const e1 = Math.abs(dep.ra - r2) / r2, e2 = Math.abs(arr.rp - r1) / r1;
    rec.add({ id: 'tisserand.hohmann', group: 'analytic', value: Math.max(e1, e2), unit: '', limit: 1e-12, truth: 'Analytic: Hohmann transfer between circular orbits' });
    expect(e1).toBeLessThan(1e-12);
    expect(e2).toBeLessThan(1e-12);
  });

  it('the maximum pump step is the turn angle of the flyby', () => {
    const b = BODIES.JUPITER;
    const rp = b.radius + 200000;
    expect(Math.abs(maxPumpStep(b.gmSystem, 6, rp) - turnAngle(b.gmSystem, 6, rp))).toBeLessThan(1e-12);
  });
});

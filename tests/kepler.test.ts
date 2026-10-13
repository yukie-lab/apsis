import { describe, it, expect, afterAll } from 'vitest';
import { elementsFromState, stateFromElements, keplerPropagate, period, trueFromMean, meanFromTrue } from '../src/engine/kepler';
import { lambert } from '../src/engine/lambert';
import { Rkf78, RKF78_TABLEAU } from '../src/engine/integrator';
import { dist, norm, sub, type Vec3, DEG } from '../src/engine/vec';
import { GM_SUN, AU, BODIES } from '../src/engine/bodies';
import { Recorder } from './util';

const rec = new Recorder('analytic');
afterAll(() => rec.save());
const mu = GM_SUN;

describe('Kepler functions', () => {
  it('elements and state are inverse operations', () => {
    for (const [a, e, i, O, w, nu] of [[1.5 * AU, 0.3, 20, 40, 60, 80], [0.4 * AU, 0.8, 120, 300, 10, 200], [-2 * AU, 1.6, 5, 10, 20, -40], [AU, 0.0167, 0.001, 100, 250, 10]]) {
      const el = { p: a * (1 - e * e), e, i: i * DEG, raan: O * DEG, argp: w * DEG, nu: nu * DEG };
      const s = stateFromElements(el, mu);
      const back = elementsFromState(s, mu);
      const s2 = stateFromElements(back, mu);
      expect(dist(s.r, s2.r) / norm(s.r)).toBeLessThan(1e-10);
      expect(back.a / a).toBeCloseTo(1, 11);
      expect(back.e).toBeCloseTo(e, 11);
    }
  });

  it('propagation by one period returns to the start (ellipse); energy is constant (hyperbola)', () => {
    const s = stateFromElements({ p: 2 * AU * (1 - 0.49), e: 0.7, i: 0.4, raan: 1, argp: 2, nu: 0.5 }, mu);
    const P = period(2 * AU, mu);
    const s1 = keplerPropagate(s, P, mu);
    expect(dist(s.r, s1.r)).toBeLessThan(1e-3);
    const sb = keplerPropagate(keplerPropagate(s, 0.37 * P, mu), -0.37 * P, mu);
    expect(dist(s.r, sb.r)).toBeLessThan(1e-3);
    const h = stateFromElements({ p: 3 * AU, e: 2.5, i: 1, raan: 0, argp: 0, nu: -1.5 }, mu);
    const h1 = keplerPropagate(h, 3e7, mu);
    const en = (x: typeof h) => norm(x.v) ** 2 / 2 - mu / norm(x.r);
    expect(en(h1) / en(h)).toBeCloseTo(1, 11);
  });

  it('propagation agrees with the Kepler equation', () => {
    const e = 0.6, a = 1.2 * AU;
    const s = stateFromElements({ p: a * (1 - e * e), e, i: 0.2, raan: 0.3, argp: 0.4, nu: 0 }, mu);
    const n = Math.sqrt(mu / a ** 3);
    for (const dt of [1e5, 1e6, 1e7, 5e7]) {
      const s1 = keplerPropagate(s, dt, mu);
      const nu = trueFromMean(n * dt, e);
      const expd = stateFromElements({ p: a * (1 - e * e), e, i: 0.2, raan: 0.3, argp: 0.4, nu }, mu);
      expect(dist(s1.r, expd.r)).toBeLessThan(1e-4);
    }
    expect(trueFromMean(meanFromTrue(2.2, 0.9), 0.9)).toBeCloseTo(2.2, 11);
    expect(trueFromMean(meanFromTrue(1.3, 2.4), 2.4)).toBeCloseTo(1.3, 11);
  });
});

describe('Hohmann transfer: Lambert solver against the analytic solution', () => {
  it('Earth-radius to Mars-radius circular coplanar transfer', () => {
    const r1 = AU, r2 = 1.523679 * AU; // the radii are only the inputs of the analytic problem
    const at = (r1 + r2) / 2;
    const tof = Math.PI * Math.sqrt(at ** 3 / mu);
    const dv1 = Math.sqrt(mu / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
    const dv2 = Math.sqrt(mu / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
    // 180 degree transfer is singular for the plane; use 179.999 degrees and compare with a tight limit
    const th = Math.PI - 1e-5;
    const sol = lambert(mu, [r1, 0, 0], [r2 * Math.cos(th), r2 * Math.sin(th), 0], tof * (1 - 1e-5 / Math.PI * 0), {})[0];
    const vc1: Vec3 = [0, Math.sqrt(mu / r1), 0];
    const vc2: Vec3 = [-Math.sqrt(mu / r2) * Math.sin(th), Math.sqrt(mu / r2) * Math.cos(th), 0];
    const myDv1 = norm(sub(sol.v1, vc1)), myDv2 = norm(sub(vc2, sol.v2));
    const err = Math.max(Math.abs(myDv1 - dv1), Math.abs(myDv2 - dv2));
    rec.add({ id: 'analytic.hohmann', group: 'analytic', value: err * 1e3, unit: 'm/s', limit: 0.05, truth: 'Analytic Hohmann transfer between circular coplanar orbits (1 au to 1.523679 au)', detail: { dv1AnalyticKmS: dv1, dv2AnalyticKmS: dv2, tofDays: tof / 86400 } });
    expect(err * 1e3).toBeLessThan(0.05);
    // exact 180 degrees: the solver must still return the Hohmann speeds
    const s180 = lambert(mu, [r1, 0, 0], [-r2, 0, 0], tof, {})[0];
    expect(Math.abs(norm(s180.v1) - (Math.sqrt(mu / r1) + dv1)) * 1e3).toBeLessThan(1e-6);
  });

  it('Hohmann transfer between low orbit and geostationary radius (Earth)', () => {
    const muE = BODIES.EARTH.gm;
    const r1 = 6678, r2 = 42164;
    const dvA = Math.sqrt(muE / r1) * (Math.sqrt((2 * r2) / (r1 + r2)) - 1) + Math.sqrt(muE / r2) * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
    const tof = Math.PI * Math.sqrt(((r1 + r2) / 2) ** 3 / muE);
    const s = lambert(muE, [r1, 0, 0], [-r2, 0, 0], tof)[0];
    const dv = norm(s.v1) - Math.sqrt(muE / r1) + (Math.sqrt(muE / r2) - norm(s.v2));
    expect(Math.abs(dv - dvA) * 1e3).toBeLessThan(1e-6);
  });
});

describe('Lambert solver', () => {
  it('each solution (0 to 3 revolutions, prograde and retrograde) agrees with Kepler propagation', () => {
    let worst = 0, count = 0;
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let k = 0; k < 400; k++) {
      const r1: Vec3 = [(0.3 + 5 * rnd()) * AU, 0, 0];
      const th = rnd() * 2 * Math.PI, inc = (rnd() - 0.5) * 1.2;
      const R2 = (0.3 + 5 * rnd()) * AU;
      const r2: Vec3 = [R2 * Math.cos(th), R2 * Math.sin(th) * Math.cos(inc), R2 * Math.sin(th) * Math.sin(inc)];
      const tof = (30 + 3000 * rnd()) * 86400;
      for (const retrograde of [false, true]) {
        for (const s of lambert(mu, r1, r2, tof, { maxRevs: 3, retrograde })) {
          const end = keplerPropagate({ r: r1, v: s.v1 }, tof, mu);
          const e = dist(end.r, r2) / R2;
          const ev = norm(sub(end.v, s.v2));
          worst = Math.max(worst, e);
          expect(ev).toBeLessThan(1e-6);
          count++;
        }
      }
    }
    rec.add({ id: 'lambert.consistency', group: 'lambert', value: worst, unit: 'relative', limit: 1e-8, truth: 'Analytic two-body propagation (universal variables) of each Lambert solution', detail: { solutions: count } });
    expect(count).toBeGreaterThan(900);
    expect(worst).toBeLessThan(1e-8);
  });
});

describe('RKF7(8) integrator', () => {
  it('each row of the tableau is consistent (sum of a = c, sum of b = 1)', () => {
    const { A, C, B8 } = RKF78_TABLEAU;
    for (let s = 1; s < 13; s++) expect(A[s].reduce((x, y) => x + y, 0)).toBeCloseTo(C[s], 14);
    expect(B8.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 14);
  });

  const f = (_t: number, y: Float64Array, d: Float64Array) => {
    const r3 = Math.hypot(y[0], y[1], y[2]) ** 3;
    d[0] = y[3]; d[1] = y[4]; d[2] = y[5];
    d[3] = (-mu * y[0]) / r3; d[4] = (-mu * y[1]) / r3; d[5] = (-mu * y[2]) / r3;
  };
  const s0 = stateFromElements({ p: 1.3 * AU * (1 - 0.25), e: 0.5, i: 0.3, raan: 1, argp: 2, nu: 0.3 }, mu);

  it('fixed-step error decreases with order 8', () => {
    const T = period(1.3 * AU, mu) / 4;
    const run = (steps: number) => {
      const y = new Float64Array([...s0.r, ...s0.v]);
      const rk = new Rkf78(f, 6);
      const h = T / steps;
      // rtol very large: every step is accepted with the given size
      rk.integrate(0, y, T, { rtol: 1e30, atol: 1e30, h0: h, hMax: h });
      return dist([y[0], y[1], y[2]], keplerPropagate(s0, T, mu).r);
    };
    const e1 = run(20), e2 = run(40);
    const order = Math.log2(e1 / e2);
    rec.add({ id: 'integrator.order', group: 'analytic', value: order, unit: 'order', limit: 7.5, truth: 'Analytic two-body solution; error ratio for step h and h/2', detail: { errorKmCoarse: e1, errorKmFine: e2 } });
    expect(order).toBeGreaterThan(7.5);
    expect(order).toBeLessThan(9.5);
  });

  it('adaptive integration of 10 orbits (e = 0.5) agrees with the analytic solution', () => {
    const T = 10 * period(1.3 * AU, mu);
    const y = new Float64Array([...s0.r, ...s0.v]);
    const rk = new Rkf78(f, 6);
    rk.integrate(0, y, T, { rtol: 1e-13, atol: new Float64Array([1e-6, 1e-6, 1e-6, 1e-13, 1e-13, 1e-13]), h0: 3600 });
    const err = dist([y[0], y[1], y[2]], keplerPropagate(s0, T, mu).r);
    rec.add({ id: 'integrator.kepler10', group: 'analytic', value: err, unit: 'km', limit: 1, truth: 'Analytic two-body solution after 10 revolutions (a = 1.3 au, e = 0.5)', detail: { derivativeEvaluations: rk.evals } });
    expect(err).toBeLessThan(1);
  });
});

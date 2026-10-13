/**
 * Runge-Kutta-Fehlberg 7(8) integrator with adaptive step size.
 * Coefficients: E. Fehlberg, NASA TR R-287 (1968). The 8th-order solution is propagated.
 */
export type Derivative = (t: number, y: Float64Array, dydt: Float64Array) => void;

const C = [0, 2 / 27, 1 / 9, 1 / 6, 5 / 12, 1 / 2, 5 / 6, 1 / 6, 2 / 3, 1 / 3, 1, 0, 1];
const A: number[][] = [
  [],
  [2 / 27],
  [1 / 36, 1 / 12],
  [1 / 24, 0, 1 / 8],
  [5 / 12, 0, -25 / 16, 25 / 16],
  [1 / 20, 0, 0, 1 / 4, 1 / 5],
  [-25 / 108, 0, 0, 125 / 108, -65 / 27, 125 / 54],
  [31 / 300, 0, 0, 0, 61 / 225, -2 / 9, 13 / 900],
  [2, 0, 0, -53 / 6, 704 / 45, -107 / 9, 67 / 90, 3],
  [-91 / 108, 0, 0, 23 / 108, -976 / 135, 311 / 54, -19 / 60, 17 / 6, -1 / 12],
  [2383 / 4100, 0, 0, -341 / 164, 4496 / 1025, -301 / 82, 2133 / 4100, 45 / 82, 45 / 164, 18 / 41],
  [3 / 205, 0, 0, 0, 0, -6 / 41, -3 / 205, -3 / 41, 3 / 41, 6 / 41, 0],
  [-1777 / 4100, 0, 0, -341 / 164, 4496 / 1025, -289 / 82, 2193 / 4100, 51 / 82, 33 / 164, 12 / 41, 0, 1],
];
/** 8th-order weights. */
const B8 = [0, 0, 0, 0, 0, 34 / 105, 9 / 35, 9 / 35, 9 / 280, 9 / 280, 0, 41 / 840, 41 / 840];
/** Error estimate: (41/840) * (k0 + k10 - k11 - k12) * h. */
const ERR_W = 41 / 840;

export const RKF78_TABLEAU = { C, A, B8 };

export interface StepControl {
  /** Relative tolerance. */
  rtol: number;
  /** Absolute tolerance for each component. */
  atol: Float64Array | number;
  /** First step (s). Sign is not important. */
  h0?: number;
  hMin?: number;
  hMax?: number;
  /** Maximum number of accepted steps for one call (default 5 million). */
  maxSteps?: number;
}

/** The integration cannot continue: the state is not finite, or the step limit was reached. */
export class IntegrationError extends Error {
  constructor(readonly reason: 'not-finite' | 'step-limit', readonly t: number) {
    super('integration stopped: ' + reason);
  }
}

export class Rkf78 {
  private readonly n: number;
  private readonly k: Float64Array[];
  private readonly tmp: Float64Array;
  /** Number of derivative evaluations. */
  evals = 0;
  /** Number of rejected steps. */
  rejected = 0;
  /** Number of steps accepted at the minimum step size with an error above the tolerance. */
  forced = 0;

  constructor(private readonly f: Derivative, n: number) {
    this.n = n;
    this.k = Array.from({ length: 13 }, () => new Float64Array(n));
    this.tmp = new Float64Array(n);
  }

  /** One trial step of size h from (t, y). Writes the new state in yOut. Returns the scaled error norm. */
  private trial(t: number, y: Float64Array, h: number, yOut: Float64Array, ctl: StepControl, k0Ready: boolean): number {
    const { n, k, tmp, f } = this;
    if (!k0Ready) { f(t, y, k[0]); this.evals++; }
    for (let s = 1; s < 13; s++) {
      const a = A[s];
      for (let i = 0; i < n; i++) {
        let acc = 0;
        for (let j = 0; j < s; j++) { const aj = a[j]; if (aj !== 0) acc += aj * k[j][i]; }
        tmp[i] = y[i] + h * acc;
      }
      f(t + C[s] * h, tmp, k[s]);
      this.evals++;
    }
    let err = 0;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = 5; j < 13; j++) acc += B8[j] * k[j][i];
      const yn = y[i] + h * acc;
      yOut[i] = yn;
      const e = ERR_W * h * (k[0][i] + k[10][i] - k[11][i] - k[12][i]);
      const at = typeof ctl.atol === 'number' ? ctl.atol : ctl.atol[i];
      const sc = at + ctl.rtol * Math.max(Math.abs(y[i]), Math.abs(yn));
      err += (e / sc) * (e / sc);
    }
    return Math.sqrt(err / n);
  }

  /**
   * Integrate from t0 to t1 (t1 can be less than t0).
   * onStep is called after each accepted step with (t, y, tPrev, yPrev). Return true from onStep to stop.
   * Returns the final time and the suggested next step.
   */
  integrate(
    t0: number,
    y: Float64Array,
    t1: number,
    ctl: StepControl,
    onStep?: (t: number, y: Float64Array, tPrev: number, yPrev: Float64Array, dydtPrev: Float64Array) => boolean | void,
  ): { t: number; h: number; steps: number } {
    const dir = t1 >= t0 ? 1 : -1;
    const span = Math.abs(t1 - t0);
    if (span === 0) return { t: t0, h: ctl.h0 ?? 0, steps: 0 };
    const hMax = ctl.hMax ?? span;
    const hMin = ctl.hMin ?? 1e-9;
    let h = Math.min(Math.abs(ctl.h0 ?? span / 100), hMax, span);
    let t = t0;
    const yNew = new Float64Array(this.n);
    const yPrev = new Float64Array(this.n);
    const dPrev = new Float64Array(this.n);
    const maxSteps = ctl.maxSteps ?? 5e6;
    let steps = 0;
    let k0Ready = false;
    while ((t1 - t) * dir > 1e-12 * Math.max(1, Math.abs(t1))) {
      let last = false;
      if (h >= Math.abs(t1 - t)) { h = Math.abs(t1 - t); last = true; }
      const err = this.trial(t, y, dir * h, yNew, ctl, k0Ready);
      if (!(err >= 0)) {
        // The error is not a number: the state or the derivative is not finite. A smaller step can help only if
        // the start state of the step is finite.
        if (h <= hMin || !Number.isFinite(y[0])) throw new IntegrationError('not-finite', t);
        this.rejected++;
        k0Ready = true;
        h = Math.max(hMin, h * 0.2);
        continue;
      }
      if (steps >= maxSteps) throw new IntegrationError('step-limit', t);
      if (err > 1 && h <= hMin) this.forced++;
      if (err <= 1 || h <= hMin) {
        yPrev.set(y);
        dPrev.set(this.k[0]);
        const tPrev = t;
        t = last ? t1 : t + dir * h;
        y.set(yNew);
        steps++;
        k0Ready = false;
        const fac = err > 0 ? Math.min(4, Math.max(0.2, 0.9 * Math.pow(err, -1 / 8))) : 4;
        const hNext = Math.min(hMax, Math.max(hMin, h * fac));
        if (onStep && onStep(t, y, tPrev, yPrev, dPrev) === true) return { t, h: hNext, steps };
        if (!last || fac < 1) h = hNext;
      } else {
        this.rejected++;
        k0Ready = true;
        h = Math.max(hMin, h * Math.max(0.2, 0.9 * Math.pow(err, -1 / 8)));
      }
    }
    return { t, h, steps };
  }
}

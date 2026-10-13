/**
 * Chebyshev ephemeris reader.
 *
 * File format (made by tools/ephem/build_ephem.py and build_small.py):
 *   uint32 headerLength, JSON header, Float64 coefficients (little-endian).
 * Each body has fixed-length intervals. Each interval has nCoef coefficients for x, y and z.
 * Time argument: TDB. Frame: ICRF. Units: km, km/s.
 */
import type { State, Vec3 } from './vec';
import { DAY, J2000_JD } from './time';

export interface EphemBodyHeader {
  name: string;
  intervalDays: number;
  nCoef: number;
  nIntervals: number;
  offset: number;
  maxFitErrorKm: number;
  center: string;
  jdStart?: number;
}
export interface EphemHeader {
  format: string;
  source: string;
  sourceSha256?: string;
  frame: string;
  timeScale: string;
  unit: string;
  jdStart: number;
  jdEnd: number;
  fitToleranceKm: number;
  bodies: EphemBodyHeader[];
}

interface Segment { h: EphemBodyHeader; et0: number; dt: number; coef: Float64Array }

export class ChebyshevEphemeris {
  readonly header: EphemHeader;
  private readonly segs = new Map<string, Segment>();
  readonly etStart: number;
  readonly etEnd: number;

  constructor(buffer: ArrayBuffer) {
    const dv = new DataView(buffer);
    const hlen = dv.getUint32(0, true);
    const text = new TextDecoder().decode(new Uint8Array(buffer, 4, hlen));
    this.header = JSON.parse(text) as EphemHeader;
    const data = new Float64Array(buffer, 4 + hlen);
    for (const h of this.header.bodies) {
      const n = h.nIntervals * 3 * h.nCoef;
      this.segs.set(h.name, {
        h,
        et0: ((h.jdStart ?? this.header.jdStart) - J2000_JD) * DAY,
        dt: h.intervalDays * DAY,
        coef: data.subarray(h.offset, h.offset + n),
      });
    }
    this.etStart = (this.header.jdStart - J2000_JD) * DAY;
    this.etEnd = (this.header.jdEnd - J2000_JD) * DAY;
  }

  has(name: string): boolean { return this.segs.has(name); }
  bodyHeader(name: string): EphemBodyHeader | undefined { return this.segs.get(name)?.h; }
  covers(et: number): boolean { return et >= this.etStart && et <= this.etEnd; }

  /**
   * Position only (km). `out` receives the result. Time is clamped to the limits of the data.
   * The time is et + dEt. A caller that knows the time more accurately than one 64-bit number gives the small
   * part in dEt: the difference between et and the start of the interval is exact, thus the sum keeps the small
   * part (a 64-bit time near the year 2030 has a step of 1.2e-7 s, which is 4 mm of the motion of the Earth).
   */
  position(name: string, et: number, out: Vec3, dEt = 0): Vec3 {
    const s = this.segs.get(name)!;
    const n = s.h.nCoef;
    let i = Math.floor((et - s.et0 + dEt) / s.dt);
    if (i < 0) i = 0; else if (i >= s.h.nIntervals) i = s.h.nIntervals - 1;
    const x = (2 * (et - (s.et0 + i * s.dt) + dEt)) / s.dt - 1;
    const x2 = 2 * x;
    const c = s.coef;
    let base = i * 3 * n;
    for (let k = 0; k < 3; k++) {
      let b1 = 0, b2 = 0;
      for (let j = n - 1; j >= 1; j--) {
        const t = x2 * b1 - b2 + c[base + j];
        b2 = b1; b1 = t;
      }
      out[k] = x * b1 - b2 + c[base];
      base += n;
    }
    return out;
  }

  /** Position (km) and velocity (km/s) at the time et + dEt (see `position`). */
  state(name: string, et: number, dEt = 0): State {
    const s = this.segs.get(name)!;
    const n = s.h.nCoef;
    let i = Math.floor((et - s.et0 + dEt) / s.dt);
    if (i < 0) i = 0; else if (i >= s.h.nIntervals) i = s.h.nIntervals - 1;
    const x = (2 * (et - (s.et0 + i * s.dt) + dEt)) / s.dt - 1;
    const c = s.coef;
    const r: Vec3 = [0, 0, 0];
    const v: Vec3 = [0, 0, 0];
    let base = i * 3 * n;
    for (let k = 0; k < 3; k++) {
      // T_j and its derivative by recurrence
      let t0 = 1, t1 = x, d0 = 0, d1 = 1;
      let p = c[base] + c[base + 1] * x;
      let dp = c[base + 1];
      for (let j = 2; j < n; j++) {
        const t2 = 2 * x * t1 - t0;
        const d2 = 2 * t1 + 2 * x * d1 - d0;
        p += c[base + j] * t2;
        dp += c[base + j] * d2;
        t0 = t1; t1 = t2; d0 = d1; d1 = d2;
      }
      r[k] = p;
      v[k] = (dp * 2) / s.dt;
      base += n;
    }
    return { r, v };
  }
}

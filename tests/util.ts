import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ChebyshevEphemeris } from '../src/engine/ephemeris';
import { SolarSystem } from '../src/engine/system';

function load(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

let cached: SolarSystem | null = null;
export function solarSystem(): SolarSystem {
  cached ??= new SolarSystem(new ChebyshevEphemeris(load('public/data/ephem.bin')), new ChebyshevEphemeris(load('public/data/small.bin')));
  return cached;
}

export function truth<T = any>(name: string): T {
  return JSON.parse(readFileSync(`truth/horizons/${name}.json`, 'utf8')) as T;
}

export interface Measurement {
  /** Identifier, also the key of the description text in the locale file (validation.items.<id>). */
  id: string;
  /** Group for the report. */
  group: 'ephemeris' | 'time' | 'analytic' | 'lambert' | 'window' | 'flyby' | 'propagation' | 'interchange' | 'frames';
  /** Measured value. */
  value: number;
  unit: string;
  /** Limit that the test asserts. */
  limit: number;
  /** Where the truth comes from. */
  truth: string;
  /** Extra numbers for the report. */
  detail?: Record<string, number | string>;
}

/** Collector: the measured errors are written to src/validation/measured/<file>.json and shown in the product. */
export class Recorder {
  private items: Measurement[] = [];
  constructor(private readonly file: string) {}
  add(m: Measurement): void { this.items.push(m); }
  save(): void {
    mkdirSync('src/validation/measured', { recursive: true });
    writeFileSync(`src/validation/measured/${this.file}.json`, JSON.stringify(this.items, null, 1) + '\n');
  }
}

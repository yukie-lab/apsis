/**
 * Work of the calculator screens that is not part of a mission (the transfer in work, the last launch window map).
 * It stays in memory when the user changes the screen or the mode.
 */
import { create } from 'zustand';
import type { Plan } from '../engine/plan';
import type { PorkchopRequest, PorkchopData } from '../engine/planopt';
import type { Flight } from '../engine/flight';
import type { Aim } from '../engine/target';
import type { State } from '../engine/vec';
import type { TimeScale } from '../engine/time';
import type { FrameId } from '../engine/frames';
import type { Mission } from '../engine/mission';
import type { ManeuverCandidate } from '../engine/forensics';
import type { EphemerisTable, FileFormat, Opm, TableApproach, TableBoundary } from '../engine/io';

export type WindowQuantity = 'c3' | 'vinfArr' | 'dvTotal' | 'dvDep';
/** One comparison flight of a study: the flight with one change of the force model, or with a larger tolerance. */
export interface StudyRow {
  /** 'body:<id>', 'moons', 'j2', 'relativity', 'srp', or 'tol:<relative tolerance>'. */
  id: string;
  group: 'force' | 'tolerance';
  /** Force: true if the model of the flight has it (the comparison flight is then without it). */
  inModel: boolean;
  /** Position difference at the end of the flight, km. null: the comparison flight stopped before the end. */
  endKm: number | null;
  maxKm: number;
  maxEt: number;
  /** Position difference at each closest approach of the study, km. NaN: the comparison flight stopped before it. */
  at: number[];
  steps: number;
  evals: number;
  /** log10 of the position difference (km) at the sample times. NaN: no value. */
  log: Float32Array;
  /** The comparison flight ended before the flight on the screen: the time, and the body that it hit (if known). */
  stop: { et: number; body: string | null } | null;
}
export interface ForceStudy {
  /** The flight that the study is for (the same object as in the mission). */
  flight: Flight;
  /** arc: each comparison flight starts again from the flight on the screen at each maneuver. whole: it does not. */
  mode: 'arc' | 'whole';
  /** Closest approaches of the flight for which the table has a column. */
  encounters: { et: number; body: string }[];
  times: Float64Array;
  rows: StudyRow[];
  /** Steps and force evaluations of the flight with no stored states at the maneuvers. */
  steps: number;
  evals: number;
}

/** Closest approaches and end state of a flight before the last change of its maneuvers. */
export interface ManeuverEffect {
  missionId: string;
  before: Aim[];
  endEt: number;
  endState: State;
  /** Result text data of the targeter, if the change came from it. */
  target: { index: number; body: string; iterations: number; dvBefore: number; dvAfter: number; miss: number; timeMiss: number | null } | null;
}

/** Data for a file that does not contain them (a CSV table, a Horizons text with no header). */
export interface FileInOptions {
  center: string;
  frame: FrameId;
  timeScale: TimeScale;
  distanceUnit: 'km' | 'm';
  horizonsUnits: 'KM-S' | 'AU-D' | 'KM-D';
  horizonsScale: 'TDB' | 'UTC';
}
/** A text that the user gave to the Files screen, and what the application read from it. */
export interface FileIn {
  /** Number of the read operation: a new number for each new table. */
  serial: number;
  /** File name, or an empty text for a text from the field. */
  name: string;
  text: string;
  lines: number;
  /** Format that the application found from the text. */
  detected: FileFormat | null;
  /** Format that the user selected, or null (automatic). */
  choice: FileFormat | null;
  /** Format in use (found, or selected by the user). */
  format: FileFormat | null;
  /** True after the header of a Horizons text did not give the center, the frame, the units or the time scale. */
  needsOptions: boolean;
  options: FileInOptions;
  error: { code: string; line?: number; detail?: string; lineText?: string } | null;
  table: EphemerisTable | null;
  opm: Opm | null;
  mission: Mission | null;
  /** null: the analysis of the table is in progress. */
  approaches: TableApproach[] | null;
  boundaries: TableBoundary[];
  /** Result of the maneuver search, and the maneuvers that the user selected for a new mission. */
  search: { threshold: number; candidates: ManeuverCandidate[]; noiseFloor: number; skipped: number } | null;
  /** Maneuvers for a new mission: one flag for each maneuver of `boundaries`, then for each candidate of `search`. */
  use: boolean[];
}
/** Options of the file writer on the Files screen. null: the value comes from the mission or from the settings. */
export interface FileOut {
  format: 'oem' | 'opm' | 'stk' | 'gmat' | 'csv' | 'mission';
  objectName: string | null;
  objectId: string;
  center: string | null;
  timeScale: TimeScale | null;
  frame: FrameId | null;
  sampling: 'steps' | 'fixed';
  between: number;
  step: number;
  stepUnit: 's' | 'min' | 'h' | 'd';
  csvTime: 'iso' | 'jd';
  gmatAxes: 'MJ2000Eq' | 'ICRF';
  gmatOutput: 'report' | 'oem' | 'both';
  gmatSetGm: boolean;
  gmatSource: string;
}
export const DEFAULT_FILE_OUT: FileOut = {
  format: 'oem', objectName: null, objectId: 'UNKNOWN', center: null, timeScale: null, frame: null, sampling: 'steps', between: 0,
  step: 1, stepUnit: 'd', csvTime: 'iso', gmatAxes: 'MJ2000Eq', gmatOutput: 'both', gmatSetGm: true, gmatSource: '',
};

interface Drafts {
  transfer: Plan | null;
  windowRequest: PorkchopRequest | null;
  windowData: PorkchopData | null;
  windowQuantity: WindowQuantity;
  windowPick: { ix: number; iy: number } | null;
  /** Actual mission that the window example is for (the plot shows its dates), or null. */
  windowExample: string | null;
  forceStudy: ForceStudy | null;
  maneuverEffect: ManeuverEffect | null;
  fileIn: FileIn | null;
  fileOut: FileOut;
  set(p: Partial<Omit<Drafts, 'set'>>): void;
}

export const useDrafts = create<Drafts>((set) => ({
  transfer: null,
  windowRequest: null,
  windowData: null,
  windowQuantity: 'c3',
  windowPick: null,
  windowExample: null,
  forceStudy: null,
  maneuverEffect: null,
  fileIn: null,
  fileOut: DEFAULT_FILE_OUT,
  set: (p) => set(p),
}));

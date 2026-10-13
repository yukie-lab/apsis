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
  set: (p) => set(p),
}));

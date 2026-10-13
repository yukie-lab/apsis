/**
 * Work of the calculator screens that is not part of a mission (the transfer in work, the last launch window map).
 * It stays in memory when the user changes the screen or the mode.
 */
import { create } from 'zustand';
import type { Plan } from '../engine/plan';
import type { PorkchopRequest, PorkchopData } from '../engine/planopt';
import type { ForceModel } from '../engine/propagate';

export type WindowQuantity = 'c3' | 'vinfArr' | 'dvTotal' | 'dvDep';
export interface ForceStudy {
  /** Identifier of the flight that the study is for. */
  key: string;
  rows: { id: string; model: ForceModel; endKm: number; maxKm: number }[];
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
  set: (p) => set(p),
}));

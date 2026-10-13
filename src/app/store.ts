/**
 * State of the application: the mission in work, its results, the display settings and the mission library.
 * The two modes use this one state: a change of the mode keeps the mission, the trajectory and the time.
 * The library and the settings are kept in the storage of the browser on this computer only.
 */
import { create } from 'zustand';
import type { Mission } from '../engine/mission';
import { missionFromJson, missionToJson } from '../engine/mission';
import { type Plan, type PlanResult, evaluatePlan } from '../engine/plan';
import type { TimeScale } from '../engine/time';
import { utcToEt } from '../engine/time';
import type { FrameId } from '../engine/frames';
import type { Trajectory } from '../engine/propagate';
import type { DistanceUnit } from './format';
import { engine, EngineError, type Solved } from './engine';
import { system } from './system';
import { clock } from './clock';
import type { CustomBody } from '../engine/system';
import type { EphemerisTable } from '../engine/io/types';
import { registerBodyName } from '../i18n';
import { type Route, type Mode, parseRoute, routeHash } from './router';

export interface Settings {
  timeScale: TimeScale;
  frame: FrameId;
  /** Centre of the coordinates in tables and readouts. */
  center: string;
  distUnit: DistanceUnit;
}
export interface Busy {
  task: 'solve' | 'quick' | 'optimize' | 'porkchop' | 'fly' | 'search' | 'target' | 'study';
  /** Machine text of the stage (for example 'JUPITER: A'), or empty. */
  stage: string;
  fraction: number | null;
}

/** A body that the user defines by orbit elements. */
export interface CustomEntry { body: CustomBody; radiusKm: number }

interface AppState {
  route: Route;
  settings: Settings;
  library: Mission[];
  /** Bodies of the user (kept in the storage of the browser). */
  custom: CustomEntry[];
  /** Mission in work, or null. */
  mission: Mission | null;
  /** Patched-conic result of the plan of the mission (always current). */
  planResult: PlanResult | null;
  /** Numerical trajectory of the flight of the mission. null: no flight, or the plan changed after the last conversion. */
  trajectory: Trajectory | null;
  /** True if the plan changed after the flight was made. */
  flightStale: boolean;
  /** Trajectory table from a file, to compare with the flight. In memory only (not in the mission file). */
  reference: EphemerisTable | null;
  busy: Busy | null;
  /** Code of the last error, or null. The user interface has a text for each code. */
  errorCode: string | null;

  go(route: Route): void;
  setSettings(p: Partial<Settings>): void;
  clearError(): void;
  /** Open a mission (and its results if the caller has them). */
  openMission(m: Mission, solved?: Solved): Promise<void>;
  closeMission(): void;
  setReference(table: EphemerisTable | null): void;
  /** Change the plan. The flight stays but is marked as not current. */
  updatePlan(change: (p: Plan) => Plan): void;
  updateMission(change: (m: Mission) => Mission): void;
  /** Convert the plan to a flight in the full force model. */
  solve(): Promise<boolean>;
  /** Replace the flight (maneuver editor, import) and compute its trajectory. */
  setFlight(flight: NonNullable<Mission['flight']>, origin: 'manual' | 'import'): Promise<boolean>;
  saveToLibrary(): void;
  removeFromLibrary(id: string): void;
  setBusy(b: Busy | null): void;
  fail(code: string): void;
  /** Put the saved bodies of the user in the solar system model (call one time after the data load). */
  restoreCustom(): void;
  addCustom(entry: CustomEntry): void;
  removeCustom(id: string): void;
}

const KEY_LIBRARY = 'apsis.library', KEY_SETTINGS = 'apsis.settings', KEY_CUSTOM = 'apsis.custom';
const DEFAULT_SETTINGS: Settings = { timeScale: 'UTC', frame: 'ECLIPJ2000', center: 'SUN', distUnit: 'km' };

function loadSettings(): Settings {
  try {
    const o = JSON.parse(localStorage.getItem(KEY_SETTINGS) ?? 'null') as Partial<Settings> | null;
    if (o) return { ...DEFAULT_SETTINGS, ...o };
  } catch { /* use the defaults */ }
  return DEFAULT_SETTINGS;
}
function loadLibrary(): Mission[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY_LIBRARY) ?? '[]') as unknown[];
    const out: Mission[] = [];
    for (const item of list) { try { out.push(missionFromJson(JSON.stringify(item))); } catch { /* a damaged entry is not used */ } }
    return out;
  } catch { return []; }
}
function store(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* the storage is full or not available: the state stays in memory */ }
}
const saveLibrary = (list: Mission[]): void => store(KEY_LIBRARY, '[' + list.map(missionToJson).join(',') + ']');
function loadCustom(): CustomEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY_CUSTOM) ?? '[]') as CustomEntry[];
    const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
    return list.filter((c) => c && c.body && typeof c.body.id === 'string' && [c.body.a, c.body.e, c.body.i, c.body.raan, c.body.argp, c.body.M0, c.body.epochEt, c.radiusKm].every(num));
  } catch { return []; }
}

/** Current time of the computer as et, inside the range of the ephemeris data. */
export function nowEt(): number {
  const d = new Date();
  const et = utcToEt({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() });
  const sys = system();
  return Math.min(sys.etEnd - 86400, Math.max(sys.etStart + 86400, et));
}

function evaluate(plan: Plan): PlanResult | null {
  try { return evaluatePlan(system(), plan); } catch { return null; }
}
function watchList(m: Mission): string[] {
  return m.plan ? [...new Set(m.plan.nodes.map((n) => n.body))] : [];
}
/** The mission with the data of the bodies of the user that its plan uses. */
function withCustom(m: Mission, custom: CustomEntry[]): Mission {
  const used = custom.filter((c) => m.plan?.nodes.some((n) => n.body === c.body.id));
  const { custom: _old, ...rest } = m;
  return used.length ? { ...rest, custom: used } : rest;
}
const errorCode = (e: unknown): string => (e instanceof EngineError ? e.code : 'internal');
/** Text of a mission file (with the bodies of the user that the mission uses). */
export function missionFileText(m: Mission): string {
  return missionToJson(withCustom(m, useApp.getState().custom));
}

export const useApp = create<AppState>((set, get) => ({
  route: parseRoute(location.hash),
  settings: loadSettings(),
  library: loadLibrary(),
  custom: [],
  mission: null,
  planResult: null,
  trajectory: null,
  flightStale: false,
  reference: null,
  busy: null,
  errorCode: null,

  go(route) {
    const hash = routeHash(route);
    if (location.hash !== hash) location.hash = hash; else set({ route });
  },
  setSettings(p) {
    const settings = { ...get().settings, ...p };
    store(KEY_SETTINGS, JSON.stringify(settings));
    set({ settings });
  },
  clearError() { set({ errorCode: null }); },
  setBusy(busy) { set({ busy }); },
  fail(code) { if (code !== 'cancelled') set({ errorCode: code }); },

  async openMission(m, solved) {
    // A mission file can have bodies of the user: put them in the model before the plan is calculated.
    for (const c of m.custom ?? []) if (!get().custom.some((x) => x.body.id === c.body.id)) get().addCustom(c);
    set({ mission: m, planResult: solved?.result ?? (m.plan ? evaluate(m.plan) : null), trajectory: solved?.trajectory ?? null, flightStale: false, reference: null, errorCode: null });
    let tr = solved?.trajectory ?? null;
    if (!tr && m.flight) {
      set({ busy: { task: 'fly', stage: '', fraction: null } });
      try { tr = await engine.fly(m.flight, watchList(m)); } catch (e) { get().fail(errorCode(e)); }
      if (get().mission?.id !== m.id) return;
      set({ trajectory: tr, busy: null });
    }
    if (tr) { clock.setLimits(tr.et0, tr.et1); clock.set(tr.et0); }
    else { const sys = system(); clock.setLimits(sys.etStart, sys.etEnd); clock.set(m.plan?.nodes[0].et ?? m.flight?.et0 ?? clock.et); }
  },
  setReference(reference) { set({ reference }); },
  closeMission() {
    const sys = system();
    clock.play(false);
    clock.setLimits(sys.etStart, sys.etEnd);
    set({ mission: null, planResult: null, trajectory: null, flightStale: false, reference: null });
  },
  updatePlan(change) {
    const m = get().mission;
    if (!m?.plan) return;
    const plan = change(m.plan);
    set({ mission: { ...m, plan, famousId: null }, planResult: evaluate(plan), flightStale: m.flight !== null });
  },
  updateMission(change) {
    const m = get().mission;
    if (m) set({ mission: change(m) });
  },
  async solve() {
    const m = get().mission;
    if (!m || get().busy) return false;
    set({ busy: { task: 'solve', stage: '', fraction: null }, errorCode: null });
    try {
      const out = await engine.solve(m, (p) => set({ busy: { task: 'solve', stage: p.text ?? '', fraction: null } }));
      if (get().mission?.id !== m.id) return false;
      set({ mission: out.mission, planResult: out.result, trajectory: out.trajectory, flightStale: false, busy: null });
      const keep = clock.et;
      clock.setLimits(out.trajectory.et0, out.trajectory.et1);
      clock.set(keep);
      return true;
    } catch (e) {
      set({ busy: null });
      get().fail(errorCode(e));
      return false;
    }
  },
  async setFlight(flight, origin) {
    const m = get().mission;
    if (!m) return false;
    const next: Mission = { ...m, flight, flightOrigin: origin, report: null };
    set({ busy: { task: 'fly', stage: '', fraction: null }, errorCode: null });
    try {
      const tr = await engine.fly(flight, watchList(next));
      set({ mission: next, trajectory: tr, flightStale: false, busy: null });
      const keep = clock.et;
      clock.setLimits(tr.et0, tr.et1);
      clock.set(keep);
      return true;
    } catch (e) {
      set({ busy: null });
      get().fail(errorCode(e));
      return false;
    }
  },
  saveToLibrary() {
    const m = get().mission;
    if (!m) return;
    const library = [withCustom(m, get().custom), ...get().library.filter((x) => x.id !== m.id)];
    saveLibrary(library);
    set({ library });
  },
  removeFromLibrary(id) {
    const library = get().library.filter((x) => x.id !== id);
    saveLibrary(library);
    set({ library });
  },
  restoreCustom() {
    const custom = loadCustom();
    for (const c of custom) { system().addCustom(c.body, c.radiusKm); registerBodyName(c.body.id, c.body.name); }
    set({ custom });
  },
  addCustom(entry) {
    system().addCustom(entry.body, entry.radiusKm);
    registerBodyName(entry.body.id, entry.body.name);
    const custom = [...get().custom.filter((c) => c.body.id !== entry.body.id), entry];
    store(KEY_CUSTOM, JSON.stringify(custom));
    set({ custom });
    // The plan can use the body: calculate it again.
    const m = get().mission;
    if (m?.plan) set({ planResult: evaluate(m.plan) });
  },
  removeCustom(id) {
    system().removeCustom(id);
    registerBodyName(id, null);
    const custom = get().custom.filter((c) => c.body.id !== id);
    store(KEY_CUSTOM, JSON.stringify(custom));
    set({ custom });
  },
}));

let lastMode: Mode = useApp.getState().route.mode;
window.addEventListener('hashchange', () => {
  const route = parseRoute(location.hash, lastMode);
  lastMode = route.mode;
  useApp.setState({ route });
});

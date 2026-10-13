/** Messages between the page and the engine worker. */
import type { Mission, SpacecraftSpec, QuickRequest, QuickWindow } from '../engine/mission';
import type { Plan, PlanResult } from '../engine/plan';
import type { PlanOptOptions, PorkchopRequest, PorkchopData } from '../engine/planopt';
import type { Flight, RefineReport } from '../engine/flight';
import type { TrajectoryData, ForceModel } from '../engine/propagate';
import type { CustomBody } from '../engine/system';
import type { State } from '../engine/vec';
import type { ManeuverCandidate } from '../engine/forensics';
import type { SystemData } from './system';

export interface SolvedData { mission: Mission; result: PlanResult; report: RefineReport; trajectory: TrajectoryData }
export type CustomList = { body: CustomBody; radiusKm: number }[];

export interface Methods {
  init: { args: SystemData; result: true };
  solve: { args: { mission: Mission; custom: CustomList }; result: SolvedData };
  /** Plan of an actual mission from its facts, then the flight. */
  famous: { args: { id: string; custom: CustomList }; result: SolvedData };
  quick: { args: { request: QuickRequest; name: string; spacecraft: SpacecraftSpec; custom: CustomList }; result: { solved: SolvedData; window: QuickWindow } };
  porkchop: { args: { request: PorkchopRequest; custom: CustomList }; result: PorkchopData };
  optimize: { args: { plan: Plan; options: Omit<PlanOptOptions, 'onProgress'>; custom: CustomList }; result: { plan: Plan; result: PlanResult; cost: number } };
  fly: { args: { flight: Flight; watch: string[]; custom: CustomList }; result: TrajectoryData };
  findManeuvers: { args: { et: number[]; states: State[]; model: ForceModel; threshold: number; custom: CustomList }; result: { candidates: ManeuverCandidate[]; mismatch: Float64Array; noiseFloor: number } };
}
export type MethodName = keyof Methods;

export interface RequestMessage<M extends MethodName = MethodName> { id: number; method: M; args: Methods[M]['args'] }
export type ReplyMessage =
  | { id: number; kind: 'result'; result: unknown }
  | { id: number; kind: 'progress'; progress: { text?: string; fraction?: number; best?: number } }
  /** code: machine code of the error ('quick:<code>', 'plan', 'internal'). detail: text for a log, never shown as is. */
  | { id: number; kind: 'error'; code: string; detail: string };

/**
 * Client of the engine worker. Each call returns a promise. If the browser cannot start a worker, the same code
 * runs on the page (the user interface then stops during a long calculation).
 */
import { Trajectory } from '../engine/propagate';
import type { Mission, SpacecraftSpec, QuickRequest, QuickWindow } from '../engine/mission';
import { DEFAULT_SPACECRAFT } from '../engine/mission';
import type { PlanResult } from '../engine/plan';
import type { RefineReport } from '../engine/flight';
import { EngineCore, EngineError, type Progress } from './engineCore';
import type { Methods, MethodName, ReplyMessage, SolvedData, CustomList } from './protocol';
import { system, systemData } from './system';
import { BODIES } from '../engine/bodies';

export { EngineError };
export interface Solved { mission: Mission; result: PlanResult; report: RefineReport; trajectory: Trajectory }

function unpack(d: SolvedData): Solved {
  return { mission: d.mission, result: d.result, report: d.report, trajectory: Trajectory.fromData(d.trajectory) };
}
function customList(): CustomList {
  return [...system().custom.values()].map((body) => ({ body, radiusKm: BODIES[body.id]?.radius ?? 1 }));
}

interface Pending { resolve: (v: unknown) => void; reject: (e: unknown) => void; progress?: Progress }

class EngineClient {
  private worker: Worker | null = null;
  private local: EngineCore | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private started: Promise<void> | null = null;

  /** Start the worker and give it the ephemeris data. */
  start(): Promise<void> {
    this.started ??= this.boot();
    return this.started;
  }
  private async boot(): Promise<void> {
    const data = systemData();
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<ReplyMessage>) => this.receive(e.data);
      this.worker.onerror = () => this.fail('internal');
      // The worker gets a copy: the page keeps its data.
      await this.send('init', { ephem: data.ephem.slice(0), small: data.small.slice(0) });
    } catch {
      this.worker?.terminate();
      this.worker = null;
      this.local = new EngineCore();
      this.local.call('init', data, () => undefined);
    }
  }
  private receive(m: ReplyMessage): void {
    const p = this.pending.get(m.id);
    if (!p) return;
    if (m.kind === 'progress') { p.progress?.(m.progress); return; }
    this.pending.delete(m.id);
    if (m.kind === 'result') p.resolve(m.result); else p.reject(new EngineError(m.code, m.detail));
  }
  private fail(code: string): void {
    for (const p of this.pending.values()) p.reject(new EngineError(code));
    this.pending.clear();
  }
  private send<M extends MethodName>(method: M, args: Methods[M]['args'], progress?: Progress): Promise<Methods[M]['result']> {
    if (this.local) {
      const local = this.local;
      // A short delay lets the browser draw the "in progress" state before the calculation starts.
      return new Promise((resolve, reject) => setTimeout(() => {
        try { resolve(local.call(method, args, progress ?? (() => undefined))); } catch (e) { reject(e); }
      }, 30));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress });
      this.worker!.postMessage({ id, method, args });
    });
  }
  private async call<M extends MethodName>(method: M, args: Methods[M]['args'], progress?: Progress): Promise<Methods[M]['result']> {
    await this.start();
    return this.send(method, args, progress);
  }

  /** Stop all calculations that are in progress (their promises fail with the code 'cancelled'). */
  cancel(): void {
    if (!this.worker) return;
    this.worker.terminate();
    this.worker = null;
    this.started = null;
    this.fail('cancelled');
  }

  async solve(mission: Mission, progress?: Progress): Promise<Solved> {
    return unpack(await this.call('solve', { mission, custom: customList() }, progress));
  }
  async famous(id: string, progress?: Progress): Promise<Solved> {
    return unpack(await this.call('famous', { id, custom: customList() }, progress));
  }
  async quick(request: QuickRequest, name: string, spacecraft: SpacecraftSpec = DEFAULT_SPACECRAFT, progress?: Progress): Promise<{ solved: Solved; window: QuickWindow }> {
    const r = await this.call('quick', { request, name, spacecraft, custom: customList() }, progress);
    return { solved: unpack(r.solved), window: r.window };
  }
  porkchop(request: Methods['porkchop']['args']['request']): Promise<Methods['porkchop']['result']> {
    return this.call('porkchop', { request, custom: customList() });
  }
  optimize(plan: Methods['optimize']['args']['plan'], options: Methods['optimize']['args']['options'], progress?: Progress): Promise<Methods['optimize']['result']> {
    return this.call('optimize', { plan, options, custom: customList() }, progress);
  }
  async fly(flight: Methods['fly']['args']['flight'], watch: string[], options: { rtol?: number; restartAtAnchors?: boolean } = {}): Promise<Trajectory> {
    return Trajectory.fromData(await this.call('fly', { flight, watch, custom: customList(), ...options }));
  }
  findManeuvers(args: Omit<Methods['findManeuvers']['args'], 'custom'>, progress?: Progress): Promise<Methods['findManeuvers']['result']> {
    return this.call('findManeuvers', { ...args, custom: customList() }, progress);
  }
  target(request: Methods['target']['args']['request'], progress?: Progress): Promise<Methods['target']['result']> {
    return this.call('target', { request, custom: customList() }, progress);
  }
}

export const engine = new EngineClient();

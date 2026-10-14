/** The engine calls that can take a long time. This code runs in the worker (or on the page if no worker is possible). */
import { ChebyshevEphemeris } from '../engine/ephemeris';
import { SolarSystem } from '../engine/system';
import { solveMission, quickMission, famousMission, QuickError, type SolvedMission } from '../engine/mission';
import { optimizePlan, computePorkchop } from '../engine/planopt';
import { flyFlight } from '../engine/flight';
import { findManeuvers } from '../engine/forensics';
import { targetManeuver } from '../engine/target';
import type { Methods, MethodName, SolvedData, CustomList } from './protocol';

export type Progress = (p: { text?: string; fraction?: number; best?: number }) => void;

export class EngineError extends Error {
  constructor(readonly code: string, detail = '') { super(detail || code); }
}

function pack(out: SolvedMission): SolvedData {
  return { mission: out.mission, result: out.result, report: out.report, trajectory: out.trajectory.toData() };
}

export class EngineCore {
  private sys: SolarSystem | null = null;

  private system(custom?: CustomList): SolarSystem {
    if (!this.sys) throw new EngineError('not-ready');
    const sys = this.sys;
    if (custom) {
      for (const id of [...sys.custom.keys()]) sys.removeCustom(id);
      for (const c of custom) sys.addCustom(c.body, c.radiusKm);
    }
    return sys;
  }

  call<M extends MethodName>(method: M, args: Methods[M]['args'], progress: Progress): Methods[M]['result'] {
    try {
      return this.run(method, args, progress) as Methods[M]['result'];
    } catch (err) {
      if (err instanceof EngineError) throw err;
      if (err instanceof QuickError) throw new EngineError('quick:' + err.code);
      const text = err instanceof Error ? err.message : String(err);
      throw new EngineError(text === 'plan' || text.startsWith('target:') ? text : 'internal', text);
    }
  }

  private run(method: MethodName, a: unknown, progress: Progress): unknown {
    switch (method) {
      case 'init': {
        const args = a as Methods['init']['args'];
        this.sys = new SolarSystem(new ChebyshevEphemeris(args.ephem), new ChebyshevEphemeris(args.small));
        return true;
      }
      case 'solve': {
        const args = a as Methods['solve']['args'];
        return pack(solveMission(this.system(args.custom), args.mission, (text) => progress({ text })));
      }
      case 'famous': {
        const args = a as Methods['famous']['args'];
        const sys = this.system(args.custom);
        progress({ text: 'plan' });
        return pack(solveMission(sys, famousMission(sys, args.id, args.name), (text) => progress({ text })));
      }
      case 'quick': {
        const args = a as Methods['quick']['args'];
        const sys = this.system(args.custom);
        progress({ text: 'window' });
        const { mission, window } = quickMission(sys, args.request, args.name, args.spacecraft);
        return { solved: pack(solveMission(sys, mission, (text) => progress({ text }))), window };
      }
      case 'porkchop': {
        const args = a as Methods['porkchop']['args'];
        return computePorkchop(this.system(args.custom), args.request);
      }
      case 'optimize': {
        const args = a as Methods['optimize']['args'];
        return optimizePlan(this.system(args.custom), args.plan, { ...args.options, onProgress: (fraction, best) => { progress({ fraction, best }); } });
      }
      case 'fly': {
        const args = a as Methods['fly']['args'];
        return flyFlight(this.system(args.custom), args.flight, undefined, args.watch, { rtol: args.rtol, restartAtAnchors: args.restartAtAnchors }).toData();
      }
      case 'findManeuvers': {
        const args = a as Methods['findManeuvers']['args'];
        return findManeuvers(this.system(args.custom), { et: args.et, states: args.states }, { model: args.model, threshold: args.threshold, onProgress: (fraction) => { progress({ fraction }); } });
      }
      case 'target': {
        const args = a as Methods['target']['args'];
        return targetManeuver(this.system(args.custom), args.request, (text) => progress({ text }));
      }
    }
  }
}

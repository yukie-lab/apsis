/**
 * The time of the view: one value for the 3D scene and all readouts. It changes at each frame while the time runs,
 * thus it is not in the React state. Components read it with useClock (limited update rate).
 */
import { useEffect, useState } from 'react';

type Listener = () => void;

class Clock {
  /** Time of the view, TDB seconds after J2000. */
  et = 0;
  playing = false;
  /** Simulation seconds for each real second. */
  rate = 86400;
  /** If true, the scene sets the rate from the distance to the nearest body (slow near a body, fast in the cruise). */
  autoRate = false;
  /** Limits of the time (the range of the trajectory, or of the ephemeris data). */
  min = -Infinity;
  max = Infinity;
  private listeners = new Set<Listener>();
  private last = 0;
  private frame = 0;

  subscribe(f: Listener): () => void { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  private emit(): void { this.listeners.forEach((f) => f()); }

  set(et: number): void {
    this.et = Math.min(this.max, Math.max(this.min, et));
    this.emit();
  }
  setLimits(min: number, max: number): void {
    this.min = min; this.max = max;
    this.set(this.et);
  }
  setRate(rate: number, auto = false): void { this.rate = rate; this.autoRate = auto; this.emit(); }
  play(on: boolean): void {
    if (on === this.playing) return;
    this.playing = on;
    if (on) {
      if (this.et >= this.max) this.et = this.min;
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    } else cancelAnimationFrame(this.frame);
    this.emit();
  }
  private tick = (now: number): void => {
    if (!this.playing) return;
    // A long frame (a hidden tab) must not make a jump of the time. The time of a frame can be before the time
    // of the call that started the clock (browsers round their timers): the step is then zero, not negative.
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    const next = this.et + dt * this.rate;
    // The time stops at the limit to which it moves. At the start of a flight the time is at the other limit.
    if (next >= this.max && this.rate > 0) { this.et = this.max; this.playing = false; }
    else if (next <= this.min && this.rate < 0) { this.et = this.min; this.playing = false; }
    else this.et = Math.min(this.max, Math.max(this.min, next));
    this.emit();
    if (this.playing) this.frame = requestAnimationFrame(this.tick);
  };
}

export const clock = new Clock();

/** Clock values for a component. The component draws again not more than one time for each `intervalMs`. */
export function useClock(intervalMs = 100): { et: number; playing: boolean; rate: number; autoRate: boolean } {
  const snap = () => ({ et: clock.et, playing: clock.playing, rate: clock.rate, autoRate: clock.autoRate });
  const [v, setV] = useState(snap);
  useEffect(() => {
    let timer = 0;
    let lastTime = 0;
    const update = () => { lastTime = performance.now(); timer = 0; setV(snap()); };
    const unsub = clock.subscribe(() => {
      if (timer) return;
      const wait = intervalMs - (performance.now() - lastTime);
      if (wait <= 0) update(); else timer = window.setTimeout(update, wait);
    });
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, [intervalMs]);
  return v;
}

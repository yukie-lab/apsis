/**
 * The clock of the view. The expected values are exact results of the definition: the time changes by
 * (frame time step) x (rate), and it stops at the limit to which it moves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Frame = (now: number) => void;

describe('clock', () => {
  let frames: Frame[] = [];
  let nowMs = 0;
  /** Run the frame that the clock asked for, with a frame time. */
  const frame = (ms: number): void => { const f = frames.shift(); if (f) f(ms); };

  beforeEach(() => {
    frames = [];
    nowMs = 1000;
    vi.resetModules();
    vi.stubGlobal('requestAnimationFrame', (f: Frame) => { frames.push(f); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => { frames = []; });
    vi.stubGlobal('performance', { now: () => nowMs });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('changes the time by the time step multiplied by the rate', async () => {
    const { clock } = await import('../src/app/clock');
    clock.setLimits(0, 1e6);
    clock.set(100);
    clock.setRate(3600);
    clock.play(true);
    frame(1050);
    expect(clock.et).toBeCloseTo(100 + 0.05 * 3600, 9);
    expect(clock.playing).toBe(true);
  });

  it('does not stop at the start of a flight when the first frame has a time before the start call', async () => {
    const { clock } = await import('../src/app/clock');
    clock.setLimits(500, 1e6);
    clock.set(500);
    clock.setRate(120);
    clock.play(true);
    // The frame time is 4 ms before the time of the call of play.
    frame(996);
    expect(clock.playing).toBe(true);
    expect(clock.et).toBe(500);
    frame(1016);
    expect(clock.et).toBeCloseTo(500 + 0.02 * 120, 9);
    expect(clock.playing).toBe(true);
  });

  it('stops at the end of the range', async () => {
    const { clock } = await import('../src/app/clock');
    clock.setLimits(0, 1000);
    clock.set(990);
    clock.setRate(1000);
    clock.play(true);
    frame(1050);
    expect(clock.et).toBe(1000);
    expect(clock.playing).toBe(false);
  });

  it('stops at the start of the range when the time goes back', async () => {
    const { clock } = await import('../src/app/clock');
    clock.setLimits(0, 1000);
    clock.set(10);
    clock.setRate(-1000);
    clock.play(true);
    frame(1050);
    expect(clock.et).toBe(0);
    expect(clock.playing).toBe(false);
  });

  it('limits the step of a long frame to 0.1 s', async () => {
    const { clock } = await import('../src/app/clock');
    clock.setLimits(0, 1e9);
    clock.set(0);
    clock.setRate(86400);
    clock.play(true);
    frame(61000);
    expect(clock.et).toBeCloseTo(0.1 * 86400, 9);
  });

  it('starts from the start of the range when the time is at the end', async () => {
    const { clock } = await import('../src/app/clock');
    clock.setLimits(200, 1000);
    clock.set(1000);
    clock.setRate(10);
    clock.play(true);
    expect(clock.et).toBe(200);
  });
});

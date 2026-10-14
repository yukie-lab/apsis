/**
 * Music of the application (src/app/music.ts): the rules of the piece. The audio graph needs a browser, thus these
 * tests examine the pure functions that make the notes, the times and the reverb.
 */
import { describe, it, expect } from 'vitest';
import { midiToHz, seeded, CHORDS, NEXT, BELL_NOTES, nextChord, chordLength, bellGroup, bellGap, reverbImpulse, PAD_ATTACK } from '../src/app/music';

/** Pitch classes (0 = C) of the A minor scale (A B C D E F G) and of the A minor pentatonic scale (A C D E G). */
const A_MINOR = new Set([9, 11, 0, 2, 4, 5, 7]);
const A_MINOR_PENTATONIC = new Set([9, 0, 2, 4, 7]);

describe('music', () => {
  it('uses equal temperament with A4 = 440 Hz', () => {
    // Reference values: the standard pitch A4 = 440 Hz (ISO 16) and the octave ratio 2. Middle C (note 60) is
    // 440 × 2^(−9/12) Hz = 261.6256 Hz in the published tables of the equal-tempered scale.
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(57)).toBeCloseTo(220, 9);
    expect(midiToHz(81)).toBeCloseTo(880, 9);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 4);
  });

  it('has chords of the A minor scale, from low to high, and a next chord for each chord', () => {
    for (const chord of CHORDS) {
      expect(chord.length).toBeGreaterThanOrEqual(4);
      expect(chord.every((n) => A_MINOR.has(n % 12))).toBe(true);
      expect([...chord].sort((a, b) => a - b)).toEqual([...chord]);
    }
    expect(NEXT.length).toBe(CHORDS.length);
    NEXT.forEach((options, i) => {
      expect(options.length).toBeGreaterThan(0);
      for (const o of options) {
        expect(o).not.toBe(i);
        expect(CHORDS[o]).toBeDefined();
      }
    });
  });

  it('gets to each chord', () => {
    const random = seeded(1);
    let chord = 0;
    const seen = new Set([chord]);
    for (let i = 0; i < 500; i++) seen.add((chord = nextChord(chord, random)));
    expect(seen.size).toBe(CHORDS.length);
  });

  it('makes bells from the pentatonic scale, as one note or as a rising figure', () => {
    expect(BELL_NOTES.every((n) => A_MINOR_PENTATONIC.has(n % 12))).toBe(true);
    const random = seeded(7);
    const sizes = new Set<number>();
    for (let i = 0; i < 3000; i++) {
      const group = bellGroup(CHORDS[i % CHORDS.length], random);
      sizes.add(group.length);
      expect(group.length).toBeGreaterThanOrEqual(1);
      expect(group.length).toBeLessThanOrEqual(3);
      group.forEach((b, j) => {
        expect(BELL_NOTES).toContain(b.note);
        if (j > 0) {
          expect(b.note).toBeGreaterThan(group[j - 1].note);
          expect(b.delay).toBeGreaterThan(group[j - 1].delay);
        }
        expect(b.gain).toBeGreaterThan(0);
        expect(b.gain).toBeLessThanOrEqual(0.1);
        expect(Math.abs(b.pan)).toBeLessThanOrEqual(0.8);
        expect(b.decay).toBeGreaterThanOrEqual(3.5);
      });
    }
    expect([...sizes].sort()).toEqual([1, 2, 3]);
  });

  it('keeps the lengths of the chords and the gaps between the bells in their ranges', () => {
    const random = seeded(3);
    for (let i = 0; i < 2000; i++) {
      const length = chordLength(random);
      expect(length).toBeGreaterThanOrEqual(18);
      expect(length).toBeLessThan(28);
      // A chord gets to its full level before the next chord starts.
      expect(length).toBeGreaterThan(PAD_ATTACK);
      const gap = bellGap(random);
      expect(gap).toBeGreaterThanOrEqual(1.2);
      expect(gap).toBeLessThan(7.2);
    }
  });

  it('makes a reverb impulse response that decays', () => {
    const rate = 8000, seconds = 2;
    const ir = reverbImpulse(rate, seconds, seeded(5));
    expect(ir.length).toBe(rate * seconds);
    expect(ir.every((v) => Number.isFinite(v))).toBe(true);
    const rms = (from: number, to: number): number => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += ir[i] * ir[i];
      return Math.sqrt(sum / (to - from));
    };
    const n = ir.length;
    const first = rms(0, n / 10), last = rms(n * 0.9, n);
    expect(first).toBeGreaterThan(0);
    // The envelope is 60 dB lower at the end than at the start: the last tenth is more than 40 dB below the first tenth.
    expect(20 * Math.log10(last / first)).toBeLessThan(-40);
  });

  it('repeats a random sequence from the same seed, with values from 0 to 1', () => {
    const a = seeded(42), b = seeded(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
    const r = seeded(9);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

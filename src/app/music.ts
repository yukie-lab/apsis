/**
 * Music of the application: a slow ambient piece that the browser makes while it plays (Web Audio API).
 * The piece has no recorded sound. It has four parts: chords of sawtooth waves through a low-pass filter, a low
 * drone, high bells (frequency modulation) and filtered noise. A reverb made from noise connects them.
 *
 * The rules of the piece are the pure functions of this file (tests/music.test.ts). The class Music connects them
 * to the audio graph of the browser. The music starts only when the user selects the music button (a browser plays
 * sound only after an operation of the user). The application does not keep the selection for the next visit.
 */

/** Frequency of a MIDI note number: equal temperament with A4 (note 69) = 440 Hz. */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Random numbers in [0, 1) from a seed (mulberry32), so that a test can repeat a sequence. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The chords of the piece (MIDI notes, low to high), in A minor with added and suspended notes. */
export const CHORDS: readonly (readonly number[])[] = [
  [45, 52, 59, 60, 64], // A minor, added 9th: A2 E3 B3 C4 E4
  [41, 48, 52, 57, 59], // F major 7th, sharp 11th: F2 C3 E3 A3 B3
  [48, 55, 59, 62, 64], // C major 7th, added 9th: C3 G3 B3 D4 E4
  [43, 50, 57, 59, 62], // G, added 9th: G2 D3 A3 B3 D4
  [40, 47, 50, 55, 57], // E minor 7th, added 11th: E2 B2 D3 G3 A3
  [38, 45, 48, 52, 53], // D minor 9th: D2 A2 C3 E3 F3
];
/** The chords that can come after each chord (indexes in CHORDS). */
export const NEXT: readonly (readonly number[])[] = [
  [1, 2, 4, 5],
  [2, 0, 3],
  [3, 0, 1],
  [0, 4, 2],
  [0, 1, 5],
  [0, 1, 3],
];
/** The notes of the bells: the A minor pentatonic scale from A4 to A6. */
export const BELL_NOTES: readonly number[] = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93];

/** Seconds of the start (attack) and of the end (release) of a chord. The next chord starts at the release. */
export const PAD_ATTACK = 6;
export const PAD_RELEASE = 9;

export function nextChord(current: number, random: () => number): number {
  const options = NEXT[current];
  return options[Math.floor(random() * options.length)];
}

/** Seconds from the start of a chord to the start of the next chord. */
export function chordLength(random: () => number): number {
  return 18 + random() * 10;
}

export interface Bell {
  /** MIDI note number. */
  note: number;
  /** Seconds after the start of the group. */
  delay: number;
  /** Peak amplitude. */
  gain: number;
  /** Stereo position, −1 (left) to 1 (right). */
  pan: number;
  /** Seconds until the sound is 80 dB below its peak. */
  decay: number;
}

/**
 * One group of bells: usually one note, sometimes a rising figure of two or three notes. Most groups use the notes
 * of the chord (in a high octave), the others use all the notes of the scale.
 */
export function bellGroup(chord: readonly number[], random: () => number): Bell[] {
  const classes = new Set(chord.map((n) => n % 12));
  const inChord = BELL_NOTES.filter((n) => classes.has(n % 12));
  const pool = inChord.length > 0 && random() < 0.7 ? inChord : BELL_NOTES;
  const count = random() < 0.22 ? 2 + Math.floor(random() * 2) : 1;
  let index = Math.floor(random() * pool.length);
  const out: Bell[] = [];
  for (let i = 0; i < count && index < pool.length; i++) {
    out.push({
      note: pool[index],
      delay: i * (0.16 + random() * 0.18),
      gain: 0.05 + random() * 0.05,
      pan: (random() * 2 - 1) * 0.8,
      decay: 3.5 + random() * 3.5,
    });
    index += 1 + Math.floor(random() * 2);
  }
  return out;
}

/** Seconds from one group of bells to the next. Short gaps are more frequent than long gaps. */
export function bellGap(random: () => number): number {
  return 1.2 + random() * random() * 6;
}

/**
 * Impulse response of the reverb for one channel: noise with an exponential decay (60 dB at the end) through a
 * one-pole low-pass filter that becomes stronger with time (the high frequencies decay first).
 */
export function reverbImpulse(sampleRate: number, seconds: number, random: () => number): Float32Array<ArrayBuffer> {
  const n = Math.max(1, Math.round(sampleRate * seconds));
  const k = Math.log(1000) / n;
  const out = new Float32Array(n);
  let low = 0;
  for (let i = 0; i < n; i++) {
    const alpha = 0.8 - 0.75 * (i / n);
    low += (random() * 2 - 1 - low) * alpha;
    out[i] = low * Math.exp(-k * i);
  }
  return out;
}

/** Peak level of the music (gain of the main output). */
const LEVEL = 0.6;
/** Seconds that the scheduler prepares in advance. */
const LOOKAHEAD = 1.5;

type Listener = () => void;
type AudioContextClass = typeof AudioContext;

function audioContextClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  pads: GainNode;
  bells: GainNode;
  reverb: GainNode;
  drone: [OscillatorNode, OscillatorNode];
  windFilter: BiquadFilterNode;
  windPan: StereoPannerNode;
}

class Music {
  private graph: Graph | null = null;
  private on = false;
  private timer = 0;
  /** The chord that the scheduler prepared last, and the chord after it. */
  private sounding = 0;
  private chord = 0;
  private nextChordAt = 0;
  private nextBellAt = 0;
  private nextWindAt = 0;
  private readonly random = seeded((Date.now() ^ 0x5eed) >>> 0);
  private readonly listeners = new Set<Listener>();

  /** True if the browser can make the music. */
  available(): boolean { return audioContextClass() !== null; }
  isOn(): boolean { return this.on; }
  subscribe(f: Listener): () => void { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  private emit(): void { this.listeners.forEach((f) => f()); }

  toggle(): void {
    if (this.on) this.stop();
    else void this.start();
  }

  async start(): Promise<void> {
    if (this.on) return;
    const Ctx = audioContextClass();
    if (!Ctx) return;
    this.on = true;
    this.emit();
    try {
      // The audio context must start during the operation of the user: build() runs before the first "await".
      const g = this.graph ?? (this.graph = this.build(new Ctx({ latencyHint: 'playback' })));
      await g.ctx.resume();
      if (!this.on) return;
      const t = g.ctx.currentTime;
      g.master.gain.cancelScheduledValues(t);
      g.master.gain.setValueAtTime(g.master.gain.value, t);
      g.master.gain.linearRampToValueAtTime(LEVEL, t + 3);
      if (this.nextChordAt < t) {
        this.nextChordAt = t;
        this.nextBellAt = t + 2.5;
        this.nextWindAt = t;
      }
      this.tick();
      window.clearInterval(this.timer);
      this.timer = window.setInterval(() => this.tick(), 250);
    } catch {
      this.on = false;
      this.emit();
    }
  }

  stop(): void {
    if (!this.on) return;
    this.on = false;
    this.emit();
    window.clearInterval(this.timer);
    const g = this.graph;
    if (!g) return;
    const t = g.ctx.currentTime;
    g.master.gain.cancelScheduledValues(t);
    g.master.gain.setValueAtTime(g.master.gain.value, t);
    g.master.gain.linearRampToValueAtTime(0, t + 1.2);
    // A stopped context uses no processor time. The clock of the context stops too, thus the schedule continues
    // at the same place when the music starts again.
    window.setTimeout(() => { if (!this.on) void g.ctx.suspend(); }, 1400);
  }

  private build(ctx: AudioContext): Graph {
    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.05;
    limiter.release.value = 0.6;
    master.connect(limiter).connect(ctx.destination);

    // Reverb: a short delay, then the convolution with the impulse response.
    const reverb = ctx.createGain();
    const preDelay = ctx.createDelay(0.2);
    preDelay.delayTime.value = 0.035;
    const convolver = ctx.createConvolver();
    const seconds = 6;
    const ir = ctx.createBuffer(2, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
    ir.copyToChannel(reverbImpulse(ctx.sampleRate, seconds, this.random), 0);
    ir.copyToChannel(reverbImpulse(ctx.sampleRate, seconds, this.random), 1);
    convolver.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    reverb.connect(preDelay).connect(convolver).connect(wet).connect(master);

    // Chords: a direct part and a part through the reverb.
    const pads = ctx.createGain();
    const padsDry = ctx.createGain();
    padsDry.gain.value = 0.5;
    const padsWet = ctx.createGain();
    padsWet.gain.value = 0.65;
    pads.connect(padsDry).connect(master);
    pads.connect(padsWet).connect(reverb);

    // Bells: a direct part, an echo and much reverb.
    const bells = ctx.createGain();
    const bellsDry = ctx.createGain();
    bellsDry.gain.value = 0.45;
    bells.connect(bellsDry).connect(master);
    const echo = ctx.createDelay(2);
    echo.delayTime.value = 0.62;
    const echoTone = ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2400;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.35;
    bells.connect(echo).connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(echoOut).connect(master);
    const bellsWet = ctx.createGain();
    bellsWet.gain.value = 0.9;
    bells.connect(bellsWet).connect(reverb);
    echoOut.connect(reverb);

    // Drone: a sine wave one octave below the root of the chord and a triangle wave at the root. A slow swell.
    const droneLevel = ctx.createGain();
    droneLevel.gain.value = 0.1;
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.045;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.04;
    swell.connect(swellDepth).connect(droneLevel.gain);
    const droneTone = ctx.createBiquadFilter();
    droneTone.type = 'lowpass';
    droneTone.frequency.value = 260;
    const low = ctx.createOscillator();
    low.type = 'sine';
    const root = ctx.createOscillator();
    root.type = 'triangle';
    root.detune.value = 4;
    const rootLevel = ctx.createGain();
    rootLevel.gain.value = 0.35;
    low.frequency.value = midiToHz(CHORDS[0][0] - 12);
    root.frequency.value = midiToHz(CHORDS[0][0]);
    low.connect(droneLevel);
    root.connect(rootLevel).connect(droneLevel);
    droneLevel.connect(droneTone).connect(master);
    const droneWet = ctx.createGain();
    droneWet.gain.value = 0.3;
    droneTone.connect(droneWet).connect(reverb);

    // Noise through a band-pass filter that moves slowly: a quiet wind.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = this.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const windHigh = ctx.createBiquadFilter();
    windHigh.type = 'highpass';
    windHigh.frequency.value = 140;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 5;
    windFilter.frequency.value = 600;
    const windLevel = ctx.createGain();
    windLevel.gain.value = 0.022;
    const windPan = ctx.createStereoPanner();
    wind.connect(windHigh).connect(windFilter).connect(windLevel).connect(windPan).connect(master);
    windPan.connect(reverb);

    swell.start();
    low.start();
    root.start();
    wind.start();
    return { ctx, master, pads, bells, reverb, drone: [low, root], windFilter, windPan };
  }

  /** Prepares the events of the next LOOKAHEAD seconds. */
  private tick(): void {
    const g = this.graph;
    if (!g || !this.on) return;
    const until = g.ctx.currentTime + LOOKAHEAD;
    while (this.nextChordAt < until) {
      const length = chordLength(this.random);
      this.pad(g, CHORDS[this.chord], this.nextChordAt, length);
      const root = CHORDS[this.chord][0];
      g.drone[0].frequency.setTargetAtTime(midiToHz(root - 12), this.nextChordAt, 2);
      g.drone[1].frequency.setTargetAtTime(midiToHz(root), this.nextChordAt, 2);
      this.nextChordAt += length;
      this.sounding = this.chord;
      this.chord = nextChord(this.chord, this.random);
    }
    while (this.nextBellAt < until) {
      for (const b of bellGroup(CHORDS[this.sounding], this.random)) this.bell(g, b, this.nextBellAt + b.delay);
      this.nextBellAt += bellGap(this.random);
    }
    while (this.nextWindAt < until) {
      g.windFilter.frequency.setTargetAtTime(220 + this.random() * 1300, this.nextWindAt, 4);
      g.windPan.pan.setTargetAtTime((this.random() * 2 - 1) * 0.7, this.nextWindAt, 5);
      this.nextWindAt += 6 + this.random() * 6;
    }
  }

  /** One chord: two detuned sawtooth waves for each note, one low-pass filter that opens and closes. */
  private pad(g: Graph, notes: readonly number[], at: number, length: number): void {
    const { ctx } = g;
    const end = at + length + PAD_RELEASE;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(450, at);
    filter.frequency.linearRampToValueAtTime(1000 + this.random() * 600, at + length * 0.55);
    filter.frequency.linearRampToValueAtTime(500, end);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(0.05, at + PAD_ATTACK);
    envelope.gain.setValueAtTime(0.05, at + length);
    envelope.gain.linearRampToValueAtTime(0, end);
    filter.connect(envelope).connect(g.pads);
    const voices: AudioNode[] = [filter, envelope];
    let last: OscillatorNode | null = null;
    for (const note of notes) {
      for (const cents of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToHz(note);
        osc.detune.value = cents + (this.random() - 0.5) * 3;
        const level = ctx.createGain();
        level.gain.value = note < 48 ? 0.7 : 0.5;
        osc.connect(level).connect(filter);
        osc.start(at);
        osc.stop(end + 0.05);
        voices.push(osc, level);
        last = osc;
      }
    }
    if (last) last.onended = () => voices.forEach((v) => v.disconnect());
  }

  /** One bell: a sine wave with a frequency modulation that decays (inharmonic partials at the start). */
  private bell(g: Graph, b: Bell, at: number): void {
    const { ctx } = g;
    const f = midiToHz(b.note);
    const end = at + b.decay;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = f;
    const modulator = ctx.createOscillator();
    modulator.frequency.value = f * 3.5;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(f * 1.2, at);
    depth.gain.exponentialRampToValueAtTime(f * 0.01, at + 1.8);
    modulator.connect(depth).connect(carrier.frequency);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(b.gain, at + 0.012);
    amp.gain.exponentialRampToValueAtTime(b.gain * 1e-4, end);
    const pan = ctx.createStereoPanner();
    pan.pan.value = b.pan;
    carrier.connect(amp).connect(pan).connect(g.bells);
    carrier.start(at);
    modulator.start(at);
    carrier.stop(end + 0.05);
    modulator.stop(end + 0.05);
    carrier.onended = () => [carrier, modulator, depth, amp, pan].forEach((v) => v.disconnect());
  }
}

/** The music of the application (one for all screens). */
export const music = new Music();

/**
 * Times of the narration lines of a video. The narration step (tools/manual/narration/speak.mjs) writes
 * .out/audio/<video>/timeline.json with the start and the length of each spoken line. Before that step, the
 * scene uses an estimate from the number of words (for the work on a scene).
 */
export interface ScriptLine { id: string; en: string; ja: string; say?: string; pause?: number }
export interface Script { id: string; lead?: number; tail?: number; lines: ScriptLine[] }
interface TimedLine { id: string; start: number; dur: number }

export class Narration {
  private readonly byId = new Map<string, TimedLine>();
  constructor(readonly lines: TimedLine[], readonly total: number, readonly estimated: boolean) {
    for (const l of lines) this.byId.set(l.id, l);
  }
  private line(id: string): TimedLine {
    const l = this.byId.get(id);
    if (!l) throw new Error(`The script has no line "${id}".`);
    return l;
  }
  /** Time at a fraction of a line (0: start of the line). */
  at(id: string, frac = 0): number { const l = this.line(id); return l.start + frac * l.dur; }
  end(id: string): number { const l = this.line(id); return l.start + l.dur; }
  dur(id: string): number { return this.line(id).dur; }
  /** Time from the end of a line to the start of the next line. */
  gapAfter(id: string): number {
    const k = this.lines.findIndex((l) => l.id === id);
    const next = this.lines[k + 1];
    return (next ? next.start : this.total) - this.end(id);
  }
}

export async function loadNarration(video: string): Promise<Narration> {
  const res = await fetch(`/out/audio/${video}/timeline.json?optional=1`);
  if (res.status === 200) {
    const tl = (await res.json()) as { total: number; lines: TimedLine[] };
    return new Narration(tl.lines, tl.total, false);
  }
  // Estimate: 2.6 words for each second, the pauses of the script.
  const script = (await (await fetch(`/scripts/${video}.json`)).json()) as Script;
  let t = script.lead ?? 1;
  const lines: TimedLine[] = [];
  for (const l of script.lines) {
    const dur = (l.say ?? l.en).split(/\s+/).length / 2.6;
    lines.push({ id: l.id, start: t, dur });
    t += dur + (l.pause ?? 0.35);
  }
  return new Narration(lines, t + (script.tail ?? 2), true);
}

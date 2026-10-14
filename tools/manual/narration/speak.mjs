// Narration of the videos of the manual: English speech, the times of the lines, the subtitles and a check of the
// speech with speech recognition.
//
// Use (from the project directory): node tools/manual/narration/speak.mjs [v1 v2 ...]
// Then: node tools/manual/narration/check.mjs [v1 v2 ...] (speech recognition, a separate process: the phonemizer
// of kokoro-js stops the process at an error of an other module).
//
// Speech: Kokoro-82M v1.0 (Apache-2.0), ONNX model onnx-community/Kokoro-82M-v1.0-ONNX (fp32), package kokoro-js,
// voice af_heart. The model runs on this computer: no service on the internet receives the text. The model files
// are in tools/manual/.cache/hf (the first run downloads them; later runs use no network).
//
// Input: tools/manual/video/scripts/<video>.json (lines with "en", "ja", and optional "say" (the text for the voice
// when it is different from the subtitle) and "pause" (seconds of silence after the line)). {name} in a text is a
// value from tools/manual/values.mjs.
// Output in tools/manual/.out/:
//   audio/<video>/narration.wav     the speech of the full video (48 kHz, loudness -16 LUFS)
//   audio/<video>/timeline.json     start and length of each line (the scenes use these times)
//   subs/<video>.{ja,en}.{vtt,srt}  subtitles; subs/<video>.json the same cues for the manual
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { makeValues, fill } from '../values.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const MANUAL = new URL('..', import.meta.url).pathname;
const OUT = MANUAL + '.out/';
env.cacheDir = MANUAL + '.cache/hf';
env.allowRemoteModels = process.argv.includes('--download');

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart';
const SPEED = 1.0;
const RATE = 24000;
const GAP = 0.35; // default pause after a line, seconds
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const videos = args.length ? args : ['v1', 'v2', 'v3', 'v4'];

const data = {};
for (const name of ['planets', 'orbits', 'mars', 'quick-mars', 'voyager2', 'missions', 'accuracy']) {
  const file = `${OUT}data/${name}.json`;
  if (!existsSync(file)) throw new Error(`No data file ${file}: run npm run manual:data first.`);
  data[name] = JSON.parse(readFileSync(file, 'utf8'));
}
const V = makeValues(data);

let tts = null;
const speak = async (text) => {
  const key = createHash('sha256').update(JSON.stringify([MODEL, VOICE, SPEED, text])).digest('hex').slice(0, 24);
  const file = `${OUT}audio/cache/${key}.f32`;
  if (existsSync(file)) { const b = readFileSync(file); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); }
  if (!tts) tts = await KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'cpu' });
  const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
  if (audio.sampling_rate !== RATE) throw new Error('Unexpected sample rate ' + audio.sampling_rate);
  mkdirSync(`${OUT}audio/cache`, { recursive: true });
  writeFileSync(file, Buffer.from(audio.audio.buffer, audio.audio.byteOffset, audio.audio.byteLength));
  return audio.audio;
};

/** Remove the silence at the start and at the end (level below -40 dBFS), with 40 ms of margin. */
function trim(x) {
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < 0.01) a++;
  while (b > a && Math.abs(x[b]) < 0.01) b--;
  const m = Math.round(0.04 * RATE);
  return x.subarray(Math.max(0, a - m), Math.min(x.length, b + m + 1));
}

function wav16(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let k = 0; k < samples.length; k++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[k] * 32767))), 44 + k * 2);
  return buf;
}

const stamp = (t, sep) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};
/** English subtitle text: two rows if the text is long (break at the space nearest to the middle). */
function rows(text) {
  if (text.length <= 52) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let k = 0; k < text.length; k++) if (text[k] === ' ' && (best < 0 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
  return best > 0 ? text.slice(0, best) + '\n' + text.slice(best + 1) : text;
}

for (const video of videos) {
  const script = JSON.parse(readFileSync(`${MANUAL}video/scripts/${video}.json`, 'utf8'));
  const lead = script.lead ?? 1, tail = script.tail ?? 2;
  const parts = [];
  const timeline = [];
  let t = lead;
  const cues = { ja: [], en: [] };
  const lines = script.lines.map((l) => ({ ...l, enText: fill(l.en, V, 'en'), jaText: fill(l.ja, V, 'ja'), sayText: fill(l.say ?? l.en, V, 'say') }));
  for (const [k, l] of lines.entries()) {
    const audio = trim(await speak(l.sayText));
    const dur = audio.length / RATE;
    parts.push({ start: t, audio });
    timeline.push({ id: l.id, start: +t.toFixed(3), dur: +dur.toFixed(3) });
    t += dur + (l.pause ?? GAP);
    process.stdout.write(`\r${video}: line ${k + 1} of ${lines.length}   `);
  }
  const total = t - (lines.at(-1).pause ?? GAP) + tail;
  // The cues: one cue for each line, from the start of the line to a short time after its end.
  for (const [k, l] of lines.entries()) {
    const tl = timeline[k];
    const next = k + 1 < timeline.length ? timeline[k + 1].start : total;
    const end = Math.min(next - 0.04, tl.start + tl.dur + 0.6);
    cues.ja.push({ start: tl.start, end: +end.toFixed(3), text: l.jaText.replace(/\|/g, '\n') });
    cues.en.push({ start: tl.start, end: +end.toFixed(3), text: rows(l.enText) });
    // Width of a Japanese row in units of the size of the font: a Japanese character 1, a Latin letter or a digit
    // 0.55, a space 0.3. More than 26 is too wide for the subtitle area.
    for (const row of l.jaText.split('|')) {
      const w = [...row].reduce((s, c) => s + (c === ' ' ? 0.3 : c.charCodeAt(0) < 0x2000 ? 0.55 : 1), 0);
      if (w > 26) console.log(`\n  note: ${video}/${l.id}: a Japanese row is ${w.toFixed(1)} characters wide: ${row}`);
    }
  }
  const n = Math.round(total * RATE);
  const mix = new Float32Array(n);
  for (const p of parts) mix.set(p.audio, Math.round(p.start * RATE));
  const dir = `${OUT}audio/${video}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/raw.wav`, wav16(mix, RATE));
  // Loudness: two passes of the ffmpeg filter loudnorm (EBU R128) to -16 LUFS, peak -1.5 dBTP.
  const log = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${dir}/raw.wav" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`]).toString();
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', `${dir}/raw.wav`, '-af',
    `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    '-ar', '48000', `${dir}/narration.wav`]);
  writeFileSync(`${dir}/timeline.json`, JSON.stringify({ video, total: +total.toFixed(3), voice: VOICE, model: MODEL, lines: timeline }, null, 1) + '\n');
  mkdirSync(`${OUT}subs`, { recursive: true });
  for (const lang of ['ja', 'en']) {
    writeFileSync(`${OUT}subs/${video}.${lang}.vtt`, 'WEBVTT\n\n' + cues[lang].map((c, k) => `${k + 1}\n${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n'));
    writeFileSync(`${OUT}subs/${video}.${lang}.srt`, cues[lang].map((c, k) => `${k + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n'));
  }
  writeFileSync(`${OUT}subs/${video}.json`, JSON.stringify({ video, title: script.title, total: +total.toFixed(3), cues }, null, 1) + '\n');
  console.log(`\n${video}: ${total.toFixed(1)} s, ${lines.length} lines, loudness before ${m.input_i} LUFS`);

}

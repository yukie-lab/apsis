// Check of the narration with speech recognition: Whisper small.en (Xenova/whisper-small.en, Apache-2.0, on this
// computer) changes the speech of each line back to text. The tool compares that text with the script and writes
// the word error rate of each line. The check finds words that the voice says incorrectly. It does not find a bad
// stress or a bad rhythm: a person must listen to the result too.
//
// Use (from the project directory, after speak.mjs): node tools/manual/narration/check.mjs [v1 v2 ...]
// Output: tools/manual/.out/audio/<video>/check.json
import { env, pipeline } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const MANUAL = new URL('..', import.meta.url).pathname;
const OUT = MANUAL + '.out/';
env.cacheDir = MANUAL + '.cache/hf';
env.allowRemoteModels = process.argv.includes('--download');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const videos = args.length ? args : ['v1', 'v2', 'v3', 'v4'];

/** Words for the comparison: lower case, no punctuation (a point between digits stays), hyphens are spaces. */
const words = (s) => s.toLowerCase().replace(/[–—-]/g, ' ').replace(/[^\p{L}\p{N}.\s]/gu, ' ').replace(/\.(?!\d)/g, ' ').split(/\s+/).filter(Boolean);
function wer(ref, hyp) {
  const r = words(ref), h = words(hyp);
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return { errors: d[r.length][h.length], words: r.length };
}

const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small.en', { dtype: 'fp32' });
let allErrors = 0, allWords = 0;
for (const video of videos) {
  const dir = `${OUT}audio/${video}`;
  const timeline = JSON.parse(readFileSync(`${dir}/timeline.json`, 'utf8'));
  const subs = JSON.parse(readFileSync(`${OUT}subs/${video}.json`, 'utf8'));
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', `${dir}/narration.wav`, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const x16 = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.length));
  const report = [];
  let errors = 0, count = 0;
  for (const [k, l] of timeline.lines.entries()) {
    const seg = x16.slice(Math.max(0, Math.floor((l.start - 0.05) * 16000)), Math.ceil((l.start + l.dur + 0.05) * 16000));
    const heard = (await asr(seg)).text.trim();
    const script = subs.cues.en[k].text.replace(/\n/g, ' ');
    const w = wer(script, heard);
    errors += w.errors; count += w.words;
    report.push({ id: l.id, rate: +(w.errors / w.words).toFixed(3), script, heard });
    process.stdout.write(`\r${video}: line ${k + 1} of ${timeline.lines.length}   `);
  }
  allErrors += errors; allWords += count;
  writeFileSync(`${dir}/check.json`, JSON.stringify({ video, recognizer: 'Xenova/whisper-small.en', wordErrorRate: +(errors / count).toFixed(4), words: count, lines: report }, null, 1) + '\n');
  console.log(`\n${video}: word error rate ${(100 * errors / count).toFixed(1)} % (${errors} of ${count} words)`);
  for (const r of report.filter((x) => x.rate > 0)) console.log(`  ${r.id} (${(100 * r.rate).toFixed(0)} %)\n    script: ${r.script}\n    heard:  ${r.heard}`);
}
if (videos.length > 1) console.log(`All: word error rate ${(100 * allErrors / allWords).toFixed(1)} % (${allErrors} of ${allWords} words)`);

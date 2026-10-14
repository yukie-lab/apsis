// Pictures and videos of the scenes in tools/manual/video/src/scenes.
// Use (from the project directory):
//   node tools/manual/video/capture.mjs <scene> --stills 0,2.5,10       pictures at these times (seconds)
//   node tools/manual/video/capture.mjs <scene> --video [--fps 30] [--from s] [--to s] [--scale 0.5] [--out file]
// The script starts the development server of the frames (port 5330). A picture is 1920 x 1080 pixels (--scale
// makes it smaller for a quick check). The video has the narration of .out/audio/<scene>/narration.wav if it is there.
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = new URL('../.out/', import.meta.url).pathname;
const args = process.argv.slice(2);
const scene = args[0];
const opt = (name, fallback) => { const k = args.indexOf('--' + name); return k > 0 ? args[k + 1] : fallback; };
const has = (name) => args.includes('--' + name);
if (!scene || scene.startsWith('--')) { console.error('capture: give the name of a scene.'); process.exit(2); }

const server = await createServer({ configFile: new URL('../vite.config.ts', import.meta.url).pathname, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none'] });
const scale = Number(opt('scale', '1'));
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
page.on('pageerror', (e) => problems.push(e.message));
await page.goto(`http://localhost:5330/stage.html?scene=${encodeURIComponent(scene)}`);
await page.waitForFunction(() => window.__scene || window.__error, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.error(err); await browser.close(); await server.close(); process.exit(1); }
const info = await page.evaluate(() => ({ duration: window.__scene.duration, estimated: window.__scene.estimated }));
console.log(`scene ${scene}: ${info.duration.toFixed(2)} s${info.estimated ? ' (estimated times: no narration yet)' : ''}`);
const cdp = await page.context().newCDPSession(page);
const shot = async (t) => {
  await page.evaluate((x) => window.__scene.render(x), t);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
};

if (opt('stills')) {
  const dir = `${OUT}stills/${scene}`;
  mkdirSync(dir, { recursive: true });
  const { writeFileSync } = await import('node:fs');
  for (const s of opt('stills').split(',')) {
    const t = s === 'end' ? info.duration - 0.01 : Number(s);
    const file = `${dir}/t${t.toFixed(2).padStart(7, '0')}.png`;
    writeFileSync(file, await shot(t));
    console.log(file);
  }
} else if (has('video')) {
  const fps = Number(opt('fps', '30'));
  const from = Number(opt('from', '0')), to = Math.min(Number(opt('to', String(info.duration))), info.duration);
  const out = opt('out', `${OUT}video/${scene}${scale < 1 ? '-draft' : ''}.mp4`);
  mkdirSync(out.replace(/\/[^/]*$/, ''), { recursive: true });
  const wav = `${OUT}audio/${scene}/narration.wav`;
  const audio = existsSync(wav) && !has('silent');
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    ...(audio ? ['-ss', String(from), '-t', String(to - from), '-i', wav] : []),
    '-c:v', 'libx264', '-preset', scale < 1 ? 'veryfast' : 'slow', '-crf', scale < 1 ? '28' : '17', '-pix_fmt', 'yuv420p', '-tune', 'animation',
    ...(audio ? ['-c:a', 'aac', '-b:a', '160k', '-shortest'] : []), '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round((to - from) * fps);
  const t0 = Date.now();
  for (let k = 0; k < n; k++) {
    const png = await shot(from + k / fps);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (k % (fps * 10) === 0) process.stdout.write(`\r${scene}: frame ${k} of ${n} (${((Date.now() - t0) / 1000 / Math.max(1, k)).toFixed(3)} s for each frame)   `);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`\n${out}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
if (problems.length) console.log('Problems on the page:\n  ' + problems.join('\n  '));
await browser.close();
await server.close();
if (problems.length) process.exit(1);

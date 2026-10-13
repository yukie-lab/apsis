/**
 * One screenshot with a free camera, for a close look at a part of a model.
 *
 *   node dev/spacecraft/shot1.mjs <kind> <name> "<query>"
 *
 * Example: node dev/spacecraft/shot1.mjs voyager rtg "dir=-0.3,0.8,0.5&target=-2.6,0,-0.9&dist=3.5"
 * Output: shots/spacecraft/zoom/<kind>-<name>.png. Start the dev server first (see shots.mjs).
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const [kind, name, query = ''] = process.argv.slice(2);
if (!kind || !name) {
  console.log('usage: node dev/spacecraft/shot1.mjs <kind> <name> "<query>"');
  process.exit(2);
}
const BASE = process.env.APSIS_DEV_URL ?? 'http://localhost:5311/dev/spacecraft/index.html';
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../shots/spacecraft/zoom');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--hide-scrollbars'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const messages = [];
page.on('console', (msg) => {
  const type = msg.type();
  if (type === 'error' || type === 'warning') messages.push(`[console ${type}] ${msg.text()}`);
});
page.on('pageerror', (err) => messages.push(`[page error] ${err.message}`));
await page.goto(`${BASE}?kind=${kind}&view=mid${query ? `&${query}` : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const error = await page.evaluate(() => window.__error ?? null);
if (error) messages.push(`[model error] ${error}`);
const file = resolve(outDir, `${kind}-${name}.png`);
await page.screenshot({ path: file });
await browser.close();
for (const m of messages) console.log(m);
console.log(messages.length === 0 ? `ok ${file}` : `${messages.length} problem(s)`);
process.exit(messages.length === 0 ? 0 : 1);

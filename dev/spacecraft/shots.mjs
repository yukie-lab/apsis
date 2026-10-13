/**
 * Screenshots of the procedural spacecraft models.
 *
 * Start the dev server first:   npx vite --port 5311 --strictPort
 * Then:                         node dev/spacecraft/shots.mjs [kinds] [views] [extra query]
 *
 *   kinds        comma list, or "all" (default)
 *   views        comma list, or "all" (default: front,side,top,iso,back,mid,far,close,detail)
 *   extra query  for example "bg=grey" or "env=flat"; it is added to the file name
 *
 * Output: shots/spacecraft/<kind>-<view>.png (1280 x 800), the model statistics, and each
 * console error or warning of the browser. The exit code is 1 if there was an error or warning.
 *
 * Set APSIS_PARTS=20 to print also the 20 meshes with the most triangles of each model.
 */
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ALL_KINDS = ['voyager', 'cassini', 'newhorizons', 'juno', 'galileo', 'pioneer', 'marscruise', 'apsis', 'ulysses'];
const ALL_VIEWS = ['front', 'side', 'top', 'iso', 'back', 'mid', 'far', 'close', 'detail'];
const BASE = process.env.APSIS_DEV_URL ?? 'http://localhost:5311/dev/spacecraft/index.html';

const arg = (k) => (process.argv[k] && process.argv[k] !== 'all' ? process.argv[k].split(',') : null);
const kinds = arg(2) ?? ALL_KINDS;
const views = arg(3) ?? ALL_VIEWS;
const extra = process.argv[4] ?? '';
const tag = extra ? `-${extra.replace(/[^a-z0-9]+/gi, '_')}` : '';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../shots/spacecraft');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--hide-scrollbars'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
let problems = 0;

for (const kind of kinds) {
  let statsPrinted = false;
  for (const view of views) {
    const page = await context.newPage();
    const messages = [];
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') messages.push(`[console ${type}] ${msg.text()}`);
    });
    page.on('pageerror', (err) => messages.push(`[page error] ${err.message}`));
    const url = `${BASE}?kind=${kind}&view=${view}${extra ? `&${extra}` : ''}`;
    await page.goto(url, { waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    } catch {
      messages.push('[timeout] the page did not become ready in 60 s');
    }
    const error = await page.evaluate(() => window.__error ?? null);
    if (error) messages.push(`[model error] ${error}`);
    const stats = await page.evaluate(() => window.__stats ?? null);
    if (stats && !statsPrinted) {
      const { parts, ...summary } = stats;
      console.log(`${kind}: ${JSON.stringify(summary)}`);
      if (process.env.APSIS_PARTS) {
        for (const part of parts.slice(0, Number(process.env.APSIS_PARTS) || 12)) console.log(`  ${String(part.triangles).padStart(6)}  ${part.name}`);
      }
      statsPrinted = true;
    }
    const file = resolve(outDir, `${kind}-${view}${tag}.png`);
    await page.screenshot({ path: file });
    for (const m of messages) {
      problems++;
      console.log(`${kind}-${view}: ${m}`);
    }
    await page.close();
  }
}

await browser.close();
console.log(problems === 0 ? 'No browser console error or warning.' : `${problems} browser console error(s) or warning(s).`);
process.exit(problems === 0 ? 0 : 1);

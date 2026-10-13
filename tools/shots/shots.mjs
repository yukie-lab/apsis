// Screenshots of the screens of the application at desktop and phone sizes, with a list of console errors.
// Use: start the application (npm run dev, or npm run preview after a build), then
//   node tools/shots/shots.mjs [--base http://localhost:5310/] [--only <text in the name>] [--out shots/app]
// The scenarios are in tools/shots/scenarios.mjs.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { scenarios } from './scenarios.mjs';

const arg = (name, fallback) => { const k = process.argv.indexOf('--' + name); return k > 0 ? process.argv[k + 1] : fallback; };
const base = arg('base', 'http://localhost:5310/');
const only = arg('only', '');
const outDir = arg('out', 'shots/app');
mkdirSync(outDir, { recursive: true });

const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = [];
let failed = 0;
for (const sc of scenarios) {
  for (const size of sc.sizes ?? ['desktop']) {
    const name = `${sc.name}-${size}`;
    if (only && !name.includes(only)) continue;
    const context = await browser.newContext(SIZES[size]);
    const page = await context.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
    const t0 = Date.now();
    try {
      await page.goto(base + (sc.hash ?? ''), { waitUntil: 'load' });
      await page.waitForSelector('.app', { timeout: 30000 });
      if (sc.run) await sc.run(page, size);
      await page.waitForTimeout(sc.settle ?? 600);
      // A full-page picture needs a page that grows with its content (the application scrolls inside its panels).
      if (sc.fullPage) await page.addStyleTag({ content: 'html,body,#root,.app{height:auto!important}.page{overflow:visible!important}.scroll{max-height:none!important}.expert{min-height:calc(100vh - 74px)}' });
      const shot = async (suffix = '') => page.screenshot({ path: `${outDir}/${name}${suffix}.png`, fullPage: !!sc.fullPage });
      await shot();
      // Horizontal overflow of the page is a layout fault at any size.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(`layout: the page is ${overflow} px wider than the screen`);
    } catch (e) {
      problems.push('scenario: ' + String(e).split('\n')[0]);
      try { await page.screenshot({ path: `${outDir}/${name}-failed.png` }); } catch { /* no picture */ }
    }
    const ms = Date.now() - t0;
    report.push({ name, ms, problems });
    if (problems.length) failed++;
    console.log(`${problems.length ? 'PROBLEM' : 'ok     '} ${name} (${ms} ms)` + problems.map((p) => '\n   ' + p.slice(0, 300)).join(''));
    await context.close();
  }
}
await browser.close();
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1) + '\n');
console.log(`${report.length} pictures, ${failed} with problems. Report: ${outDir}/report.json`);
process.exit(failed ? 1 : 0);

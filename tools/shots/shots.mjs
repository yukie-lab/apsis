// Pictures of the screens of the application at the sizes of a desktop screen and of a phone screen, with checks.
// Use: start the application (npm run dev, or npm run preview after a build), then
//   node tools/shots/shots.mjs [--base http://localhost:5310/] [--only <text in the name>] [--sizes desktop,phone]
//                              [--at small,landscape-small] [--out shots/app]
// --sizes makes only the pictures with these sizes, from the sizes of each scenario.
// --at makes each scenario at the given sizes: use it to examine a screen at a size that the scenario does not have.
// The scenarios are in tools/shots/scenarios.mjs.
//
// Checks for each picture:
//   - the console has no error and no warning, and no request fails;
//   - the browser sends no request to a different server;
//   - the page is not wider than the screen;
//   - the screen shows no text key (a key shows when a text is not in the locale files).
// The command stops with the status 1 if a picture has a problem. A person must examine the pictures: the
// checks do not find a fault of the layout or of the 3D view.
import { chromium } from 'playwright-core';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { scenarios } from './scenarios.mjs';

const arg = (name, fallback) => { const k = process.argv.indexOf('--' + name); return k > 0 ? process.argv[k + 1] : fallback; };
const base = arg('base', 'http://localhost:5310/');
const only = arg('only', '');
const sizesArg = arg('sizes', '');
const atArg = arg('at', '');
const outDir = arg('out', 'shots/app');
mkdirSync(outDir, { recursive: true });
const origin = new URL(base).origin;

const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // A phone that the user holds with the long side down.
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // A small phone, with the short side down and with the long side down. Only the option --at uses these sizes.
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'landscape-small': { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const DEFAULT_SIZES = ['desktop', 'phone'];

// A text key on the screen: a name of the top level of the locale files, then parts with points ("scene.rate.h1").
const LOCALE_DIR = 'src/i18n/locales/en';
const tops = new Set();
for (const file of readdirSync(LOCALE_DIR)) {
  const part = JSON.parse(readFileSync(`${LOCALE_DIR}/${file}`, 'utf8'));
  for (const key of Object.keys(part.text ?? {})) tops.add(key.split('.')[0]);
}
const KEY_SHAPE = new RegExp(`(?<![\\w./-])(?:${[...tops].join('|')})(?:\\.[A-Za-z0-9_:-]+)+(?![\\w/-])`, 'g');
// A file name can have the same shape ("mission.json").
const FILE_NAME = /\.(json|txt|oem|opm|e|csv|script|md|png|jpg)$/;
/** All text that the user can read on the page: the text of the elements and the text of their labels. */
const pageText = (page) => page.evaluate(() => {
  const parts = [document.body.innerText];
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    for (const name of ['aria-label', 'title', 'placeholder', 'alt']) { const v = el.getAttribute(name); if (v) parts.push(v); }
  }
  return parts.join('\n');
});

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const report = [];
let failed = 0;
for (const sc of scenarios) {
  for (const size of atArg ? atArg.split(',') : sc.sizes ?? DEFAULT_SIZES) {
    if (!SIZES[size]) { console.error(`shots: there is no size "${size}".`); process.exit(2); }
    const name = `${sc.name}-${size}`;
    if (only && !name.includes(only)) continue;
    if (sizesArg && !sizesArg.split(',').includes(size)) continue;
    const context = await browser.newContext({ ...SIZES[size], acceptDownloads: true });
    const page = await context.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => {
      // A scenario that loads the page again stops the requests of the old page.
      if (sc.reloads && r.failure()?.errorText === 'net::ERR_ABORTED') return;
      problems.push(`requestfailed: ${r.url()} (${r.failure()?.errorText ?? 'no reason'})`);
    });
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      if (new URL(url).origin !== origin) problems.push('other server: ' + url);
    });
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
    const check = async () => {
      // Horizontal overflow of the page is a layout fault at any size.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(`layout: the page is ${overflow} px wider than the screen`);
      const keys = [...new Set(((await pageText(page)).match(KEY_SHAPE) ?? []).filter((k) => !FILE_NAME.test(k)))];
      if (keys.length) problems.push('text: the screen shows the keys ' + keys.join(', '));
    };
    const t0 = Date.now();
    try {
      await page.goto(base + (sc.hash ?? ''), { waitUntil: 'load' });
      await page.waitForSelector('.app', { timeout: 30000 });
      /** A picture of a state in the middle of a scenario, with the same checks. */
      const shot = async (suffix) => { await page.screenshot({ path: `${outDir}/${name}-${suffix}.png` }); await check(); };
      if (sc.run) await sc.run(page, size, shot);
      await page.waitForTimeout(sc.settle ?? 600);
      await check();
      // A full-page picture needs a page that grows with its content (the application scrolls inside its panels).
      if (sc.fullPage) await page.addStyleTag({ content: 'html,body,#root,.app{height:auto!important}.page{overflow:visible!important}.scroll{max-height:none!important}.expert{min-height:calc(100vh - 74px)}' });
      // Chrome cannot make one picture higher than 16 384 device pixels: such a picture shows the top of the page again.
      // Thus a longer page gets a sequence of pictures, one for each height of the screen.
      const { viewport, deviceScaleFactor } = SIZES[size];
      const total = sc.fullPage ? await page.evaluate(() => document.documentElement.scrollHeight) : 0;
      for (const old of readdirSync(outDir)) if (old === `${name}.png` || old.startsWith(`${name}-part`)) rmSync(`${outDir}/${old}`);
      if (total * deviceScaleFactor > 16000) {
        const parts = Math.ceil(total / viewport.height);
        for (let k = 0; k < parts; k++) {
          await page.evaluate((y) => window.scrollTo(0, y), k * viewport.height);
          await page.waitForTimeout(80);
          await page.screenshot({ path: `${outDir}/${name}-part${String(k + 1).padStart(2, '0')}.png` });
        }
      } else await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: !!sc.fullPage });
    } catch (e) {
      problems.push('scenario: ' + String(e).split('\n')[0]);
      try { await page.screenshot({ path: `${outDir}/${name}-failed.png` }); } catch { /* no picture */ }
    }
    const ms = Date.now() - t0;
    const list = [...new Set(problems)];
    report.push({ name, ms, problems: list });
    if (list.length) failed++;
    console.log(`${list.length ? 'PROBLEM' : 'ok     '} ${name} (${ms} ms)` + list.map((p) => '\n   ' + p.slice(0, 300)).join(''));
    await context.close();
  }
}
await browser.close();
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1) + '\n');
console.log(`${report.length} scenarios, ${failed} with problems. Report: ${outDir}/report.json`);
process.exit(failed ? 1 : 0);

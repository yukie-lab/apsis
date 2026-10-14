// Pictures of the screens of the application for the manual and the videos.
//
// Use (from the project directory, after npm run build): node tools/manual/shots/capture.mjs [--only <text>]
// The script starts the built application (vite preview, port 5311) and Google Chrome without a window. Each
// picture is a desktop screen of 1440 x 900 pixels at a device scale of 2. For each picture, the script also
// writes the boxes of the parts of the screen that the manual marks with numbers (pixels of the picture).
// Output: tools/manual/.out/shots/<name>.png and <name>.json.
// Checks: no console error or warning, no failed request, no request to an other server.
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = new URL('../.out/shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const only = (() => { const k = process.argv.indexOf('--only'); return k > 0 ? process.argv[k + 1] : ''; })();
const PORT = 5311;
const BASE = `http://localhost:${PORT}/`;
const DPR = 2;

// ---- Steps on the screens of the application (the same steps as tools/shots/scenarios.mjs) ---------------------
const busyDone = (page) => page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 180000 });
const homeReady = async (page) => {
  await page.waitForSelector('.xp-home', { timeout: 60000 });
  await page.waitForSelector('.view3d canvas', { timeout: 30000 });
  await page.waitForTimeout(3500);
};
const pickChip = (page, text) => page.locator('.xp-chips .chip', { hasText: text }).first().click();
const stopTime = async (page) => {
  const stop = page.getByRole('button', { name: 'Stop the time' });
  await stop.first().waitFor({ timeout: 15000 });
  await stop.first().click();
  await page.getByRole('button', { name: 'Start the time' }).first().waitFor({ timeout: 5000 });
};
const flyTo = async (page, body) => {
  await homeReady(page);
  await pickChip(page, body);
  await page.locator('.xp-card .btn.primary').click();
  await page.waitForSelector('.xp-flight', { timeout: 300000 });
  await stopTime(page);
};
const caption = async (page) => (await page.locator('.xp-caption b').allTextContents()).join(' | ');
const toEvent = async (page, text) => {
  for (let k = 0; k < 24; k++) {
    await page.getByRole('button', { name: 'Go to the next event' }).click();
    await page.waitForTimeout(500);
    if ((await caption(page)).includes(text)) return;
  }
  throw new Error('The flight has no event with the text: ' + text);
};
const toEnd = async (page) => {
  for (let k = 0; k < 40 && !(await page.locator('.xp-done').count()); k++) {
    await page.getByRole('button', { name: 'Go to the next event' }).click();
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('.xp-done', { timeout: 5000 });
};
const openFamous = async (page, name) => {
  await page.locator('tr', { hasText: name }).first().getByRole('button', { name: 'Open' }).click();
  await page.waitForTimeout(300);
  await busyDone(page);
  await page.waitForSelector('table.data tr.click', { timeout: 30000 });
};
const expertPage = (page, name) => page.locator('.nav button', { hasText: name }).click();
/** A page that grows with its content (the application scrolls inside its panels): for a picture of a full page. */
const grow = (page) => page.addStyleTag({ content: 'html,body,#root,.app{height:auto!important}.page{overflow:visible!important}.scroll{max-height:none!important}.expert{min-height:calc(100vh - 74px)}' });
const panel = (page, heading) => page.locator('.panel', { has: page.locator('h2, h3', { hasText: heading }) }).first();

// ---- The pictures -----------------------------------------------------------------------------------------------
// boxes: name -> locator (or a list of locators: the box around all of them). full: picture of the full page.
// element: picture of one element only.
const shots = [
  { name: 'explorer-home', hash: '#/explorer',
    run: async (page) => { await homeReady(page); await pickChip(page, 'Mars'); await page.waitForSelector('.xp-card'); await page.waitForTimeout(3500); },
    boxes: (page) => ({
      mode: page.locator('.top .mode'), about: page.locator('.top').getByRole('button', { name: 'About', exact: true }),
      time: page.locator('.xp-live'), chips: page.locator('.xp-chips'), mars: page.locator('.xp-chips .chip', { hasText: 'Mars' }).first(),
      tabs: page.locator('.xp-tabs'), card: page.locator('.xp-card'),
      goal: page.locator('.xp-card').getByRole('button', { name: 'Do a flyby' }), more: page.locator('.xp-card details summary'),
      launch: page.locator('.xp-card .btn.primary'), scale: page.getByText('True scale').first(),
    }) },
  { name: 'explorer-options', hash: '#/explorer',
    run: async (page) => { await homeReady(page); await pickChip(page, 'Saturn'); await page.waitForSelector('.xp-card'); await page.locator('.xp-card details summary').click(); await page.waitForTimeout(3500); },
    boxes: (page) => ({
      goals: [page.locator('.xp-card').getByRole('button', { name: 'Do a flyby' }), page.locator('.xp-card').getByRole('button', { name: 'Go into the atmosphere' })],
      style: [page.locator('.xp-card').getByRole('button', { name: 'Minimum propellant' }), page.locator('.xp-card').getByRole('button', { name: 'Short flight time' })],
      date: page.locator('.xp-card .xp-field', { hasText: 'Earliest launch date' }), model: page.locator('.xp-card .xp-field', { hasText: 'Spacecraft model' }),
      launch: page.locator('.xp-card .btn.primary'),
    }) },
  { name: 'explorer-flight', hash: '#/explorer',
    run: async (page) => { await flyTo(page, 'Mars'); await toEvent(page, 'Closest approach to Mars'); await page.waitForTimeout(4000); },
    boxes: (page) => ({
      back: page.locator('.xp-top button').first(), title: page.locator('.xp-title'), numbers: page.getByRole('button', { name: 'Show the numbers' }),
      views: page.locator('.xp-views'), data: page.locator('.xp-data'), caption: page.locator('.xp-caption'),
      buttons: [page.getByRole('button', { name: 'Go to the event before this time' }).first(), page.getByRole('button', { name: 'Go to the next event' }).first()],
      timeline: page.locator('.transport .timeline'), rate: page.locator('.transport select'), note: page.locator('.scene-note-line'),
    }) },
  { name: 'explorer-notes', hash: '#/explorer',
    run: async (page) => {
      await flyTo(page, 'Mars'); await toEvent(page, 'Closest approach to Mars'); await page.waitForTimeout(5000);
      await page.locator('.scene-note-line').click(); await page.waitForSelector('.scene-note-text'); await page.waitForTimeout(500);
    },
    boxes: (page) => ({ notes: page.locator('.scene-note-text') }) },
  { name: 'explorer-done', hash: '#/explorer',
    run: async (page) => { await flyTo(page, 'Mars'); await toEnd(page); await page.waitForTimeout(4000); },
    boxes: (page) => ({ summary: page.locator('.xp-done') }) },
  { name: 'explorer-famous', hash: '#/explorer/famous',
    run: async (page) => { await homeReady(page); await pickChip(page, 'Voyager 2'); await page.waitForSelector('.xp-card'); await page.waitForTimeout(3500); },
    boxes: (page) => ({ chips: page.locator('.xp-chips'), card: page.locator('.xp-card'), fly: page.locator('.xp-card .btn.primary'), tabs: page.locator('.xp-tabs') }) },
  { name: 'explorer-voyager2', hash: '#/explorer/famous',
    run: async (page) => {
      await homeReady(page); await pickChip(page, 'Voyager 2'); await page.locator('.xp-card .btn.primary').click();
      await page.waitForSelector('.xp-flight', { timeout: 300000 }); await stopTime(page);
      await toEvent(page, 'Closest approach to Jupiter'); await page.waitForTimeout(6000);
    },
    boxes: (page) => ({ caption: page.locator('.xp-caption'), data: page.locator('.xp-data') }) },
  { name: 'expert-mission', hash: '#/expert/mission',
    run: async (page) => { await openFamous(page, 'Voyager 2'); await page.waitForTimeout(4000); },
    boxes: (page) => ({
      mode: page.locator('.top .mode'), context: page.locator('.top .context'), nav: page.locator('.nav'),
      mission: page.locator('.missionbox').first(), view: page.locator('.view3d.inpanel'), status: page.locator('.statusbar'),
    }) },
  { name: 'expert-mission-start', hash: '#/expert/mission', run: async (page) => { await page.waitForTimeout(1500); },
    boxes: (page) => ({ famous: page.locator('table.data').first() }) },
  { name: 'expert-mission-compare', hash: '#/expert/mission',
    run: async (page) => { await openFamous(page, 'Voyager 2'); await grow(page); await page.waitForTimeout(800); },
    element: (page) => panel(page, 'Comparison with the actual flight') },
  { name: 'expert-ephemeris', hash: '#/expert/ephemeris', run: async (page) => { await page.waitForTimeout(2500); },
    boxes: (page) => ({ source: page.locator('button.src').first() }) },
  { name: 'expert-source', hash: '#/expert/ephemeris',
    run: async (page) => {
      await page.waitForTimeout(2500);
      await panel(page, 'State of').locator('button.src').first().click(); await page.waitForSelector('.pop'); await page.waitForTimeout(600);
    },
    boxes: (page) => ({ button: panel(page, 'State of').locator('button.src').first(), pop: page.locator('.pop') }) },
  { name: 'expert-transfer', hash: '#/expert/transfer', full: true,
    run: async (page) => { await page.getByRole('button', { name: 'Find the best dates' }).click(); await page.waitForTimeout(300); await busyDone(page); await page.waitForTimeout(800); },
    boxes: (page) => ({
      bodies: panel(page, 'Bodies and dates'), find: page.getByRole('button', { name: 'Find the best dates' }), budget: panel(page, 'Velocity budget'),
      top: panel(page, 'Top view'), legs: panel(page, 'Legs'), hohmann: panel(page, 'Hohmann'), make: page.getByRole('button', { name: 'Make a mission from these dates' }),
    }) },
  { name: 'expert-windows', hash: '#/expert/windows', full: true,
    run: async (page) => { await page.waitForSelector('canvas.map', { timeout: 60000 }); await busyDone(page); await page.waitForTimeout(800); },
    boxes: (page) => ({
      ranges: panel(page, 'Bodies and date ranges'), map: page.locator('canvas.map'), actual: panel(page, 'Actual missions'),
      minimum: panel(page, 'Dates with the minimum'), open: page.getByRole('button', { name: 'Open these dates in the Transfer screen' }),
    }) },
  { name: 'expert-tour', hash: '#/expert/mission', full: true,
    run: async (page) => { await openFamous(page, 'Voyager 2'); await expertPage(page, 'Flyby tour'); await page.waitForSelector('canvas.tiss'); await page.waitForTimeout(1500); },
    boxes: (page) => ({ sequence: panel(page, 'Sequence of bodies'), legs: panel(page, 'Legs'), tiss: page.locator('canvas.tiss'), optimizer: panel(page, 'Optimizer') }) },
  { name: 'expert-maneuvers', hash: '#/expert/mission', full: true,
    run: async (page) => {
      await openFamous(page, 'Cassini'); await expertPage(page, 'Maneuvers'); await page.waitForSelector('table.inputs');
      await page.locator('table.inputs tbody tr').first().locator('button').first().click(); await page.waitForTimeout(1500);
    },
    boxes: (page) => ({ list: page.locator('table.inputs') }) },
  { name: 'expert-propagation-earth', hash: '#/expert/propagation', full: true,
    run: async (page) => {
      await page.locator('.context select').nth(2).selectOption('EARTH');
      await page.getByRole('button', { name: /Set example values/ }).click();
      await page.getByRole('button', { name: 'Orbit elements', exact: true }).first().click();
      await page.getByRole('button', { name: 'Calculate the flight' }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.getByRole('button', { name: 'Do the comparison' }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.waitForSelector('canvas.wide', { timeout: 30000 }); await page.waitForTimeout(800);
    },
    boxes: (page) => ({
      compare: page.locator('canvas.wide').first(), start: panel(page, 'Start state'), force: panel(page, 'Force model'),
      top: panel(page, 'Top view of the flight'), integration: panel(page, 'Integration'), effect: panel(page, 'Effect of each force'),
      error: panel(page, 'Numerical error'),
    }) },
  { name: 'expert-files', hash: '#/expert/mission', full: true,
    run: async (page) => { await openFamous(page, 'Voyager 2'); await expertPage(page, 'Files'); await page.waitForSelector('pre.filetext'); await page.waitForTimeout(800); },
    boxes: (page) => ({ write: page.getByRole('button', { name: 'Write the file' }), text: page.locator('pre.filetext') }) },
  { name: 'expert-accuracy', hash: '#/expert/accuracy',
    run: async (page) => { await page.click('button.primary'); await page.waitForSelector('.banner.good, .banner.bad', { timeout: 120000 }); await page.waitForTimeout(800); },
    boxes: (page) => ({ banner: page.locator('.banner.good, .banner.bad').first() }) },
  { name: 'expert-glossary', hash: '#/expert/glossary', run: async (page) => { await page.waitForTimeout(1500); } },
  { name: 'about', hash: '#/about', full: true,
    run: async (page) => { await page.waitForSelector('.about-maps article', { timeout: 30000 }); await page.waitForTimeout(1500); },
    boxes: (page) => ({ remove: page.getByRole('button', { name: 'Remove the stored data' }) }) },
];

// ---- Capture ------------------------------------------------------------------------------------------------------
const server = await preview({ root: ROOT, configFile: ROOT + 'vite.config.ts', logLevel: 'warn', preview: { port: PORT, strictPort: true, open: false } });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const sc of shots) {
  if (only && !sc.name.includes(only)) continue;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== new URL(BASE).origin) problems.push('other server: ' + u); });
  const t0 = Date.now();
  try {
    await page.goto(BASE + sc.hash, { waitUntil: 'load' });
    await page.waitForSelector('.app', { timeout: 30000 });
    await sc.run(page);
    if (sc.full) { await grow(page); await page.waitForTimeout(600); }
    await page.evaluate(() => window.scrollTo(0, 0));
    // The boxes first, then the picture: some parts of the screen (for example the caption of an event) show only
    // for some seconds.
    let origin = { x: 0, y: 0 };
    const file = `${sc.name}.png`;
    const el = sc.element ? sc.element(page) : null;
    const ebb = el ? await el.boundingBox() : null;
    if (ebb) origin = { x: ebb.x, y: ebb.y };
    const boxes = {};
    for (const [key, loc] of Object.entries(sc.boxes ? sc.boxes(page) : {})) {
      const list = Array.isArray(loc) ? loc : [loc];
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const l of list) {
        const bb = await l.first().boundingBox({ timeout: 5000 }).catch((e) => { throw new Error(`box "${key}": ${String(e).split('\n')[0]}`); });
        if (!bb) throw new Error(`no box for "${key}"`);
        x0 = Math.min(x0, bb.x); y0 = Math.min(y0, bb.y); x1 = Math.max(x1, bb.x + bb.width); y1 = Math.max(y1, bb.y + bb.height);
      }
      boxes[key] = [x0 - origin.x, y0 - origin.y, x1 - x0, y1 - y0].map((v) => Math.round(v * DPR));
    }
    let size;
    if (el) {
      await el.screenshot({ path: OUT + file });
      size = { w: ebb.width, h: ebb.height };
    } else {
      await page.screenshot({ path: OUT + file, fullPage: !!sc.full });
      size = sc.full ? await page.evaluate(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight })) : { w: 1440, h: 900 };
    }
    const png = (await import('node:fs')).readFileSync(OUT + file);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    writeFileSync(OUT + `${sc.name}.json`, JSON.stringify({ name: sc.name, file, width, height, scale: DPR, cssWidth: Math.round(size.w), boxes }, null, 1) + '\n');
  } catch (e) {
    problems.push('scenario: ' + String(e).split('\n')[0]);
  }
  const list = [...new Set(problems)];
  if (list.length) failed++;
  console.log(`${list.length ? 'PROBLEM' : 'ok     '} ${sc.name} (${Date.now() - t0} ms)` + list.map((p) => '\n   ' + p.slice(0, 300)).join(''));
  await context.close();
}
await browser.close();
await new Promise((r) => server.httpServer.close(r));
process.exit(failed ? 1 : 0);

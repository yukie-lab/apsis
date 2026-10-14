// Pictures of the screens of the application for the manual and the videos.
//
// Use (from the project directory, after npm run build):
//   node tools/manual/shots/capture.mjs [--lang <code>] [--only <text>]
// The script starts the built application (vite preview, port 5311) and Google Chrome without a window. Each
// picture is a desktop screen of 1440 x 900 pixels at a device scale of 2. For each picture, the script also
// writes the boxes of the parts of the screen that the manual marks with numbers (pixels of the picture).
// --lang: the language of the application in the pictures (default: en). The labels that the steps look for come
// from the locale files of that language (src/i18n/locales/<code>/).
// Output: tools/manual/.out/shots/<name>.png and <name>.json (English), tools/manual/.out/shots/<code>/ (other languages).
// Checks: no console error or warning, no failed request, no request to an other server.
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const arg = (name, fallback) => { const k = process.argv.indexOf(name); return k > 0 ? process.argv[k + 1] : fallback; };
const only = arg('--only', '');
const LANG = arg('--lang', 'en');
const OUT = new URL(`../.out/shots/${LANG === 'en' ? '' : LANG + '/'}`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// ---- Texts of the application in the language of the pictures (the same merge as src/i18n/index.ts) --------------
const LOCALES = ROOT + 'src/i18n/locales/';
function merge(into, from) {
  for (const [key, v] of Object.entries(from)) {
    const path = key.split('.');
    let node = into;
    for (const part of path.slice(0, -1)) node = node[part] && typeof node[part] === 'object' ? node[part] : (node[part] = {});
    const k = path[path.length - 1];
    if (v && typeof v === 'object' && !Array.isArray(v)) { if (!node[k] || typeof node[k] !== 'object') node[k] = {}; merge(node[k], v); } else node[k] = v;
  }
}
function localeTexts(code) {
  if (!existsSync(LOCALES + code)) throw new Error(`No locale files for the language "${code}".`);
  const text = {};
  for (const f of readdirSync(LOCALES + code).filter((n) => n.endsWith('.json')).sort()) merge(text, JSON.parse(readFileSync(LOCALES + code + '/' + f, 'utf8')).text ?? {});
  return text;
}
const TEXT = localeTexts(LANG), ENGLISH = localeTexts('en');
const lookup = (table, key) => { let n = table; for (const p of key.split('.')) n = n && typeof n === 'object' ? n[p] : undefined; return typeof n === 'string' ? n : undefined; };
/** The text of a key in the language of the pictures (as the application shows it), with the parts in braces. */
const L = (key, vars = {}) => {
  let s = lookup(TEXT, key) ?? lookup(ENGLISH, key);
  if (s === undefined) throw new Error(`No text for the key "${key}".`);
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
};
/** The text of a key as a regular expression: any text for each part in braces. */
const LR = (key) => new RegExp(L(key).split(/\{[A-Za-z0-9_]+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'));
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
  const stop = page.getByRole('button', { name: L('common.pause') });
  await stop.first().waitFor({ timeout: 15000 });
  await stop.first().click();
  await page.getByRole('button', { name: L('common.play') }).first().waitFor({ timeout: 5000 });
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
    await page.getByRole('button', { name: L('explorer.flight.nextEvent') }).click();
    await page.waitForTimeout(500);
    if ((await caption(page)).includes(text)) return;
  }
  throw new Error('The flight has no event with the text: ' + text);
};
const toEnd = async (page) => {
  for (let k = 0; k < 40 && !(await page.locator('.xp-done').count()); k++) {
    await page.getByRole('button', { name: L('explorer.flight.nextEvent') }).click();
    await page.waitForTimeout(200);
  }
  await page.waitForSelector('.xp-done', { timeout: 5000 });
};
const openFamous = async (page, name) => {
  await page.locator('tr', { hasText: name }).first().getByRole('button', { name: L('page.mission.open') }).click();
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
    run: async (page) => { await homeReady(page); await pickChip(page, L('body.MARS')); await page.waitForSelector('.xp-card'); await page.waitForTimeout(3500); },
    boxes: (page) => ({
      mode: page.locator('.top .mode'), about: page.locator('.top .about-button'),
      language: page.locator('.top > label.context'), music: page.locator('.top .topicon'),
      time: page.locator('.xp-live'), chips: page.locator('.xp-chips'), mars: page.locator('.xp-chips .chip', { hasText: L('body.MARS') }).first(),
      tabs: page.locator('.xp-tabs'), card: page.locator('.xp-card'),
      goal: page.locator('.xp-card').getByRole('button', { name: L('explorer.goal.flyby') }), more: page.locator('.xp-card details summary'),
      launch: page.locator('.xp-card .btn.primary'), scale: page.getByText(L('scene.trueScale')).first(),
    }) },
  { name: 'explorer-options', hash: '#/explorer',
    run: async (page) => { await homeReady(page); await pickChip(page, L('body.SATURN')); await page.waitForSelector('.xp-card'); await page.locator('.xp-card details summary').click(); await page.waitForTimeout(3500); },
    boxes: (page) => ({
      goals: [page.locator('.xp-card').getByRole('button', { name: L('explorer.goal.flyby') }), page.locator('.xp-card').getByRole('button', { name: L('explorer.goal.entry') })],
      style: [page.locator('.xp-card').getByRole('button', { name: L('explorer.style.efficient') }), page.locator('.xp-card').getByRole('button', { name: L('explorer.style.fast') })],
      date: page.locator('.xp-card .xp-field', { hasText: L('explorer.after') }), model: page.locator('.xp-card .xp-field', { hasText: L('explorer.model') }),
      launch: page.locator('.xp-card .btn.primary'),
    }) },
  { name: 'explorer-flight', hash: '#/explorer',
    run: async (page) => { await flyTo(page, L('body.MARS')); await toEvent(page, L('explorer.flight.event.periapsis', { body: L('body.MARS') })); await page.waitForTimeout(4000); },
    boxes: (page) => ({
      back: page.locator('.xp-top button').first(), title: page.locator('.xp-title'), numbers: page.getByRole('button', { name: L('explorer.flight.numbers') }),
      views: page.locator('.xp-views'), data: page.locator('.xp-data'), caption: page.locator('.xp-caption'),
      buttons: [page.getByRole('button', { name: L('explorer.flight.prevEvent') }).first(), page.getByRole('button', { name: L('explorer.flight.nextEvent') }).first()],
      timeline: page.locator('.transport .timeline'), rate: page.locator('.transport select'), note: page.locator('.scene-note-line'),
    }) },
  { name: 'explorer-notes', hash: '#/explorer',
    run: async (page) => {
      await flyTo(page, L('body.MARS')); await toEvent(page, L('explorer.flight.event.periapsis', { body: L('body.MARS') })); await page.waitForTimeout(5000);
      await page.locator('.scene-note-line').click(); await page.waitForSelector('.scene-note-text'); await page.waitForTimeout(500);
    },
    boxes: (page) => ({ notes: page.locator('.scene-note-text') }) },
  { name: 'explorer-done', hash: '#/explorer',
    run: async (page) => { await flyTo(page, L('body.MARS')); await toEnd(page); await page.waitForTimeout(4000); },
    boxes: (page) => ({ summary: page.locator('.xp-done') }) },
  { name: 'explorer-famous', hash: '#/explorer/famous',
    run: async (page) => { await homeReady(page); await pickChip(page, L('spacecraft.voyager2')); await page.waitForSelector('.xp-card'); await page.waitForTimeout(3500); },
    boxes: (page) => ({ chips: page.locator('.xp-chips'), card: page.locator('.xp-card'), fly: page.locator('.xp-card .btn.primary'), tabs: page.locator('.xp-tabs') }) },
  { name: 'explorer-voyager2', hash: '#/explorer/famous',
    run: async (page) => {
      await homeReady(page); await pickChip(page, L('spacecraft.voyager2')); await page.locator('.xp-card .btn.primary').click();
      await page.waitForSelector('.xp-flight', { timeout: 300000 }); await stopTime(page);
      await toEvent(page, L('explorer.flight.event.periapsis', { body: L('body.JUPITER') })); await page.waitForTimeout(6000);
    },
    boxes: (page) => ({ caption: page.locator('.xp-caption'), data: page.locator('.xp-data') }) },
  { name: 'expert-mission', hash: '#/expert/mission',
    run: async (page) => { await openFamous(page, L('spacecraft.voyager2')); await page.waitForTimeout(4000); },
    boxes: (page) => ({
      mode: page.locator('.top .mode'), context: page.locator('.top .context'), nav: page.locator('.nav'),
      mission: page.locator('.missionbox').first(), view: page.locator('.view3d.inpanel'), status: page.locator('.statusbar'),
    }) },
  { name: 'expert-mission-start', hash: '#/expert/mission', run: async (page) => { await page.waitForTimeout(1500); },
    boxes: (page) => ({ famous: page.locator('table.data').first() }) },
  { name: 'expert-mission-compare', hash: '#/expert/mission',
    run: async (page) => { await openFamous(page, L('spacecraft.voyager2')); await grow(page); await page.waitForTimeout(800); },
    element: (page) => panel(page, L('basis.flight.real.title')) },
  { name: 'expert-ephemeris', hash: '#/expert/ephemeris', run: async (page) => { await page.waitForTimeout(2500); },
    boxes: (page) => ({ source: page.locator('button.src').first() }) },
  { name: 'expert-source', hash: '#/expert/ephemeris',
    run: async (page) => {
      await page.waitForTimeout(2500);
      await panel(page, LR('page.ephemeris.state')).locator('button.src').first().click(); await page.waitForSelector('.pop'); await page.waitForTimeout(600);
    },
    boxes: (page) => ({ button: panel(page, LR('page.ephemeris.state')).locator('button.src').first(), pop: page.locator('.pop') }) },
  { name: 'expert-transfer', hash: '#/expert/transfer', full: true,
    run: async (page) => { await page.getByRole('button', { name: L('page.transfer.findBest') }).click(); await page.waitForTimeout(300); await busyDone(page); await page.waitForTimeout(800); },
    boxes: (page) => ({
      bodies: panel(page, L('page.transfer.input')), find: page.getByRole('button', { name: L('page.transfer.findBest') }), budget: panel(page, L('plan.budget')),
      top: panel(page, L('page.transfer.plot')), legs: panel(page, L('plan.legs')), hohmann: panel(page, L('page.transfer.hohmann')), make: page.getByRole('button', { name: L('page.transfer.makeMission') }),
    }) },
  { name: 'expert-windows', hash: '#/expert/windows', full: true,
    run: async (page) => { await page.waitForSelector('canvas.map', { timeout: 60000 }); await busyDone(page); await page.waitForTimeout(800); },
    boxes: (page) => ({
      ranges: panel(page, L('page.windows.input')), map: page.locator('canvas.map'), actual: panel(page, L('page.windows.examples')),
      minimum: panel(page, L('page.windows.best')), open: page.getByRole('button', { name: L('page.windows.toTransfer') }),
    }) },
  { name: 'expert-tour', hash: '#/expert/mission', full: true,
    run: async (page) => { await openFamous(page, L('spacecraft.voyager2')); await expertPage(page, L('nav.tour')); await page.waitForSelector('canvas.tiss'); await page.waitForTimeout(1500); },
    boxes: (page) => ({ sequence: panel(page, L('page.tour.sequence')), legs: panel(page, L('plan.legs')), tiss: page.locator('canvas.tiss'), optimizer: panel(page, L('page.tour.optimizer')) }) },
  { name: 'expert-maneuvers', hash: '#/expert/mission', full: true,
    run: async (page) => {
      await openFamous(page, L('spacecraft.cassini')); await expertPage(page, L('nav.maneuvers')); await page.waitForSelector('table.inputs');
      await page.locator('table.inputs tbody tr').first().locator('button').first().click(); await page.waitForTimeout(1500);
    },
    boxes: (page) => ({ list: page.locator('table.inputs') }) },
  { name: 'expert-propagation-earth', hash: '#/expert/propagation', full: true,
    run: async (page) => {
      await page.locator('.context select').nth(2).selectOption('EARTH');
      await page.getByRole('button', { name: LR('page.propagation.example') }).click();
      await page.getByRole('button', { name: L('page.propagation.elements'), exact: true }).first().click();
      await page.getByRole('button', { name: L('page.propagation.create') }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.getByRole('button', { name: L('page.propagation.studyRun') }).click();
      await page.waitForTimeout(300); await busyDone(page);
      await page.waitForSelector('canvas.wide', { timeout: 30000 }); await page.waitForTimeout(800);
    },
    boxes: (page) => ({
      compare: page.locator('canvas.wide').first(), start: panel(page, L('page.propagation.start')), force: panel(page, L('page.propagation.model')),
      top: panel(page, L('page.propagation.plot')), integration: panel(page, L('page.propagation.integration')), effect: panel(page, L('page.propagation.study')),
      error: panel(page, L('page.propagation.tolerance_')),
    }) },
  { name: 'expert-files', hash: '#/expert/mission', full: true,
    run: async (page) => { await openFamous(page, L('spacecraft.voyager2')); await expertPage(page, L('nav.files')); await page.waitForSelector('pre.filetext'); await page.waitForTimeout(800); },
    boxes: (page) => ({ write: page.getByRole('button', { name: L('page.files.writeFile') }), text: page.locator('pre.filetext') }) },
  { name: 'expert-accuracy', hash: '#/expert/accuracy',
    run: async (page) => { await page.click('button.primary'); await page.waitForSelector('.banner.good, .banner.bad', { timeout: 120000 }); await page.waitForTimeout(800); },
    boxes: (page) => ({ banner: page.locator('.banner.good, .banner.bad').first() }) },
  { name: 'expert-glossary', hash: '#/expert/glossary', run: async (page) => { await page.waitForTimeout(1500); } },
  { name: 'about', hash: '#/about', full: true,
    run: async (page) => { await page.waitForSelector('.about-maps article', { timeout: 30000 }); await page.waitForTimeout(1500); },
    boxes: (page) => ({ remove: page.getByRole('button', { name: L('about.privacy.clear') }), manual: page.locator('.about-manual a.btn') }) },
];

// ---- Capture ------------------------------------------------------------------------------------------------------
const server = await preview({ root: ROOT, configFile: ROOT + 'vite.config.ts', logLevel: 'warn', preview: { port: PORT, strictPort: true, open: false } });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const sc of shots) {
  if (only && !sc.name.includes(only)) continue;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  // The language of the application: the setting that the language control keeps (src/i18n/index.ts).
  await context.addInitScript((code) => { try { localStorage.setItem('apsis.locale', code); } catch { /* no storage */ } }, LANG);
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

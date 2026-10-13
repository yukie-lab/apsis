/**
 * Screenshots of the body rendering module.
 *
 * Start the dev server first:   npx vite --port 5333 --strictPort
 * Then:                         node dev/bodies/shots.mjs [bodies] [views]
 *
 *   bodies   comma list of body ids, or "all" (default), or "sheet" for the sheets only
 *   views    comma list of view names, or "all" (default). View names: see VIEWS, SATURN_VIEWS, LOW_VIEWS and PHONE_VIEWS below.
 *
 * Output: shots/bodies/<ID>-<view>.png, one line of numbers for each body and quality (triangles, textures,
 * build time), and each console error or warning of the browser. The exit code is 1 if there was an error or warning.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE = process.env.APSIS_DEV_URL ?? 'http://localhost:5333/dev/bodies/index.html';
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../shots/bodies');
mkdirSync(outDir, { recursive: true });

/** Body ids: the planets and moons of the body table in src/engine/bodies.ts, and the small bodies of small.json. */
function bodyIds() {
  const text = readFileSync(resolve(here, '../../src/engine/bodies.ts'), 'utf8');
  const ids = [...text.matchAll(/make\('([A-Z_]+)'/g)].map((m) => m[1]);
  const small = JSON.parse(readFileSync(resolve(here, '../../src/engine/data/small.json'), 'utf8'));
  for (const s of small.bodies) ids.push(s.id);
  return ids;
}

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const WIDE = { width: 1920, height: 1200 };

/** Views of each body. */
const VIEWS = {
  p30: 'phase=30&bg=stars',
  p90: 'phase=90&bg=stars',
  p150: 'phase=150&bg=stars',
  close: 'phase=60&distance=1.3&aim=0.82&aimaz=60',
  far: 'phase=60&distance=30',
};
/** More views of Saturn: above and below the ring plane, edge-on, and against the light. The Sun is north of the ring plane. */
const SATURN_VIEWS = {
  above: 'phase=50&lat=28&sunlat=18&bg=stars',
  below: 'phase=60&lat=-28&sunlat=18&bg=stars',
  edge: 'phase=50&lat=0.4&sunlat=18&bg=stars',
  backlit: 'phase=160&lat=12&sunlat=18',
  ringclose: 'phase=40&lat=20&sunlat=18&distance=2.6&aim=0.9&aimaz=0',
};
/** More views of some bodies. */
const EXTRA_VIEWS = {
  EARTH: {
    night: 'phase=165&lon=10&lat=25',
    glint: 'phase=50&lon=-150&lat=5',
    nadir: 'phase=40&distance=1.3&lon=12&lat=42',
    eclipse: 'phase=20&lon=20&caster=0.25,0.15,60,0.2725',
    orbit: 'phase=75&distance=1.05&aim=0.97&aimaz=75&lon=-70&lat=20',
  },
  MARS: { limb: 'phase=110&distance=1.6&aim=0.95&aimaz=20' },
  SUN: { disc: 'distance=4.2', limb: 'distance=1.5&aim=0.9' },
  VENUS: { surface: 'phase=40&variant=surface', backlit: 'phase=165' },
  TITAN: { surface: 'phase=40&variant=surface', backlit: 'phase=165' },
  PLUTO: { backlit: 'phase=168' },
  JUPITER: { spot: 'phase=20&lat=-15&lon=60' },
  URANUS: { rings: 'phase=40&lat=40' },
};
/** The low quality, for some bodies. */
const LOW_BODIES = ['EARTH', 'SATURN', 'JUPITER', 'MARS', 'MOON', 'RYUGU'];
const LOW_VIEWS = {
  'low-p30': 'quality=low&phase=30&bg=stars',
  'low-close': 'quality=low&phase=60&distance=1.3&aim=0.82&aimaz=60',
};
/** A phone screen, low quality. */
const PHONE_BODIES = ['EARTH', 'SATURN', 'MOON', 'MARS', 'RYUGU', 'SUN'];
const PHONE_VIEWS = {
  phone: 'quality=low&phase=50&bg=stars&dpr=2',
};
/** All bodies in one picture. */
const SHEETS = {
  'sheet-p30': 'sheet=1&phase=30',
  'sheet-p90': 'sheet=1&phase=90',
  'sheet-p150': 'sheet=1&phase=150',
  'sheet-low-p60': 'sheet=1&phase=60&quality=low',
  'sheet-nomaps-p60': 'sheet=1&phase=60&maps=none',
  'sheet-surface-p40': 'sheet=1&phase=40&variant=surface',
};

const ids = bodyIds();
const bodyArg = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : null;
const viewArg = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : null;
const wantView = (name) => !viewArg || viewArg.includes(name);
const sheetsOnly = bodyArg?.length === 1 && bodyArg[0] === 'sheet';
const wantBody = (id) => !sheetsOnly && (!bodyArg || bodyArg.includes(id));

/** The list of all pictures: name of the file, query, size of the window. */
const jobs = [];
for (const id of bodyArg && !sheetsOnly ? bodyArg : ids) {
  if (!wantBody(id)) continue;
  const add = (views, viewport) => {
    for (const [view, query] of Object.entries(views)) {
      if (wantView(view)) jobs.push({ name: `${id}-${view}`, id, query: `body=${id}&${query}`, viewport });
    }
  };
  add(VIEWS, DESKTOP);
  if (id === 'SATURN') add(SATURN_VIEWS, DESKTOP);
  if (EXTRA_VIEWS[id]) add(EXTRA_VIEWS[id], DESKTOP);
  if (LOW_BODIES.includes(id)) add(LOW_VIEWS, DESKTOP);
  if (PHONE_BODIES.includes(id)) add(PHONE_VIEWS, PHONE);
}
if (!bodyArg || sheetsOnly) {
  for (const [name, query] of Object.entries(SHEETS)) {
    if (wantView(name)) jobs.push({ name, id: 'sheet', query, viewport: WIDE });
  }
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--hide-scrollbars'],
});
const contexts = new Map();
async function contextFor(viewport) {
  const key = `${viewport.width}x${viewport.height}`;
  if (!contexts.has(key)) contexts.set(key, await browser.newContext({ viewport, deviceScaleFactor: 1 }));
  return contexts.get(key);
}

let problems = 0;
const printed = new Set();
const line = (b) =>
  `${b.id} [${b.quality}${b.variant === 'surface' ? ', surface' : ''}]: ${b.provenance}; triangles ${b.triangles} (max ${b.trianglesMax}); ` +
  `map textures ${b.mapTextures}, code textures ${b.codeTextures}, samples per pixel ${b.samplesPerPixel}; ` +
  `build ${b.buildMs} ms, maps ready after ${b.loadMs} ms; notes: ${b.notes.join(' ') || '-'}`;

for (const job of jobs) {
  const context = await contextFor(job.viewport);
  const page = await context.newPage();
  const messages = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') messages.push(`[console ${type}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => messages.push(`[page error] ${err.message}`));
  page.on('requestfailed', (req) => messages.push(`[request failed] ${req.url()}`));
  await page.goto(`${BASE}?${job.query}`, { waitUntil: 'load' });
  try {
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
  } catch {
    messages.push('[timeout] the page did not become ready in 90 s');
  }
  const error = await page.evaluate(() => window.__error ?? null);
  if (error) messages.push(`[page] ${error}`);
  const stats = await page.evaluate(() => window.__stats ?? null);
  if (stats) {
    if (stats.mode === 'sheet') {
      console.log(`${job.name}: ${stats.bodies.length} bodies, draw calls ${stats.drawCalls}, frame ${stats.frameMs} ms, GL textures ${stats.glTextures}, programs ${stats.glPrograms}`);
      if (process.env.APSIS_SHEET_STATS) for (const b of stats.bodies) console.log(`  ${line(b)}`);
    } else {
      const b = stats.bodies[0];
      const key = `${b.id}/${b.quality}/${b.variant}`;
      if (!printed.has(key)) {
        printed.add(key);
        console.log(line(b));
      }
      if (process.env.APSIS_FRAME_STATS) console.log(`  ${job.name}: draw calls ${stats.drawCalls}, frame ${stats.frameMs} ms at ${stats.width} x ${stats.height}, triangles now ${b.triangles}`);
    }
  }
  await page.screenshot({ path: resolve(outDir, `${job.name}.png`) });
  for (const m of messages) {
    problems++;
    console.log(`${job.name}: ${m}`);
  }
  await page.close();
}

await browser.close();
console.log(`${jobs.length} pictures in ${outDir}`);
console.log(problems === 0 ? 'No browser console error or warning.' : `${problems} browser console error(s) or warning(s).`);
process.exit(problems === 0 ? 0 : 1);

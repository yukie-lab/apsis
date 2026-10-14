// Check of the structure for a second language (README, "How to add a language").
// Use: node tools/i18n/second-language.mjs [--list]
//
// The tool
//   1. makes a temporary language "zz" in src/i18n/locales/zz/ from the English files: each text gets a mark at its
//      start and at its end. The temporary language does not have the file 41-about.json. It has two texts for
//      data files: the reference of one measured value and the changes of one map;
//   2. does the automatic checks of the texts (tests/i18n.test.ts) with the two languages, and builds the application
//      into a temporary directory (vite build). The code and the checks have no change;
//   3. opens the build in Chrome, at the size of a desktop screen and at the size of a phone screen, and examines:
//        - the control for the language shows in the two modes, and it has the two languages;
//        - the selection of a language changes the texts of the screen, and the page does not load again;
//        - the application keeps the route and the mission;
//        - the browser keeps the selection for the next visit;
//        - a text that the language does not have shows in English (the About screen);
//        - the two texts for data files show in the temporary language;
//        - on each screen, each word comes from the locale files, from a data file, from the user, or is a symbol;
//   4. removes the temporary language and the temporary build.
// --list prints the lines with words that have no marks for each screen.
// The pictures of step 3 go to shots/language/. The command stops with the status 1 if a check finds a problem.
//
// Do not use this tool while a different command reads src/ (the tests, a build, the pictures of the screens):
// that command gets the temporary language too.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const EN = join(ROOT, 'src/i18n/locales/en');
const CODE = 'zz';
const ZZ = join(ROOT, 'src/i18n/locales', CODE);
const OUT = join(ROOT, '.cache/second-language');
const SHOTS = join(ROOT, 'shots/language');
const MARKER = 'TEMPORARY.txt';
const NAME = 'Zz test';
const OPEN = '⟦', CLOSE = '⟧';
const marked = (s) => OPEN + s + CLOSE;
/** The temporary language does not have this file: its texts must show in English. */
const LEFT_OUT = '41-about.json';
/** Texts of the temporary language for data files (the keys are in src/app/provenance.ts and src/app/About.tsx). */
const REFERENCE_ID = 'window.mars2020.distance', REFERENCE_TEXT = 'Reference in the temporary language';
const MAP_ID = 'mars', MAP_TEXT = 'Changes in the temporary language';
const MISSION = 'Voyager 2', MISSION_NAME = 'Check 123';
const list = process.argv.includes('--list');

const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const ROUTES = ['#/expert/mission', '#/expert/ephemeris', '#/expert/transfer', '#/expert/windows', '#/expert/tour', '#/expert/maneuvers',
  '#/expert/propagation', '#/expert/files', '#/expert/accuracy', '#/expert/glossary', '#/about', '#/explorer/flight', '#/explorer/famous', '#/explorer'];

const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
/** Puts the marks on each text of a locale object. */
const mark = (node) => {
  if (typeof node === 'string') return marked(node);
  if (Array.isArray(node)) return node.map(mark);
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mark(v)]));
  return node;
};
/** Removes each text that has the marks. A text can contain a text ("{body}" parts). */
const strip = (text) => {
  let s = text;
  const pair = new RegExp(`${OPEN}[^${OPEN}${CLOSE}]*${CLOSE}`, 'g');
  for (let k = 0; k < 20; k++) { const next = s.replace(pair, ' '); if (next === s) break; s = next; }
  return s;
};
/** All texts of an object. names: only the texts of these keys. */
const strings = (node, names, out = [], key = '') => {
  if (typeof node === 'string') { if (!names || names.includes(key)) out.push(node); }
  else if (Array.isArray(node)) for (const v of node) strings(v, names, out, key);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) strings(v, names, out, k);
  return out;
};

function makeLanguage() {
  if (existsSync(ZZ)) {
    if (!existsSync(join(ZZ, MARKER))) throw new Error(`the directory ${ZZ} is not a directory of this tool: the tool does not change it`);
    rmSync(ZZ, { recursive: true });
  }
  mkdirSync(ZZ, { recursive: true });
  writeFileSync(join(ZZ, MARKER), 'Temporary language of tools/i18n/second-language.mjs. The tool removes this directory.\n');
  let texts = 0;
  for (const file of readdirSync(EN).sort()) {
    if (file === LEFT_OUT) continue;
    const part = json(join(EN, file));
    const out = {};
    if (part.meta) out.meta = { code: CODE, name: NAME };
    if (part.text) out.text = mark(part.text);
    if (part.glossary) out.glossary = mark(part.glossary);
    texts += (JSON.stringify(out).match(new RegExp(OPEN, 'g')) ?? []).length;
    writeFileSync(join(ZZ, file), JSON.stringify(out, null, 1) + '\n');
  }
  const data = { text: {
    validation: { truth: { [REFERENCE_ID.replace(/\./g, '_')]: marked(REFERENCE_TEXT) } },
    about: { maps: { changeText: { [MAP_ID]: marked(MAP_TEXT) } } },
  } };
  writeFileSync(join(ZZ, '99-data.json'), JSON.stringify(data, null, 1) + '\n');
  return texts;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serve(dir) {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
    const file = join(dir, path.endsWith('/') ? path + 'index.html' : path);
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/**
 * All text that the user can read on the page: the text of the elements and the text of their labels.
 * The text of a file (the element pre.filetext) is not text of the user interface.
 */
const pageText = (page) => page.evaluate(() => {
  const files = [...document.querySelectorAll('pre.filetext')];
  for (const el of files) el.style.display = 'none';
  const parts = [document.body.innerText];
  for (const el of files) el.style.display = '';
  for (const el of document.querySelectorAll('svg text')) parts.push(el.textContent ?? '');
  for (const el of document.querySelectorAll('option')) parts.push(el.textContent ?? '');
  for (const el of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    for (const name of ['aria-label', 'title', 'placeholder', 'alt']) { const v = el.getAttribute(name); if (v) parts.push(v); }
  }
  return parts.join('\n');
});
const LANGUAGE = 'header.top > label.context select';
const NAME_FIELD = 'input.input[maxlength="60"]';
const busyDone = (page) => page.waitForFunction(() => !document.querySelector('.busy'), null, { timeout: 180000 });
const ready = async (page, ms = 800) => { await page.waitForSelector('.app', { timeout: 30000 }); await page.waitForTimeout(ms); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const lang = (page) => page.evaluate(() => document.documentElement.lang);

// Words that do not come from the locale files and are not a fault.
/** Symbols, units, names of the time scales and of the frames (the same parts as in tests/i18n.test.ts). */
const SYMBOL = /^(?:UTC|TDB|TT|TAI|ICRF|km|au|kg|deg|rad|min|mm|ms|GM|rp|ra|VX|VY|VZ|vx|vy|vz|px|kB|MB)$/;
/** The name of a file that the application writes: the name of the mission and the type of the file. */
const FILE_NAME = /\b[a-z0-9-]+\.(?:apsis\.json|oem|opm|e|csv|script|json|txt)\b/g;
const aboutTexts = strings(json(join(EN, LEFT_OUT)).text).flatMap((s) => s.split(/\{[A-Za-z]+\}/));
const referenceTexts = readdirSync(join(ROOT, 'src/validation/measured')).filter((f) => f.endsWith('.json'))
  .flatMap((f) => strings(json(join(ROOT, 'src/validation/measured', f)), ['truth']));
const manifest = json(join(ROOT, 'public/textures/manifest.json'));
const mapTexts = strings(manifest.textures, ['title', 'author', 'licence', 'changes']);
const libraryTexts = ['react', 'react-dom', 'scheduler', 'three', 'zustand'].flatMap((name) => {
  const p = json(join(ROOT, 'node_modules', name, 'package.json'));
  return [name, String(p.license)];
});
const KNOWN = {
  language: ['English', NAME],
  user: [MISSION_NAME],
  about: aboutTexts,
  reference: referenceTexts,
  map: mapTexts,
  library: libraryTexts,
};
/** Words of a line that are not in the given groups of known texts and are not symbols. */
function unknownWords(line, groups) {
  let s = line;
  const known = groups.flatMap((g) => KNOWN[g]).filter((k) => k.trim().length > 1).sort((a, b) => b.length - a.length);
  for (const k of known) s = s.split(k.trim()).join(' ');
  s = s.replace(FILE_NAME, ' ');
  return (s.match(/[A-Za-z][A-Za-z']+/g) ?? []).filter((w) => !SYMBOL.test(w));
}

const problems = [];
const fail = (text) => { problems.push(text); console.log('PROBLEM ' + text); };
const leftovers = new Map();
let server = null, browser = null;
const cleanup = () => {
  if (existsSync(ZZ) && existsSync(join(ZZ, MARKER))) rmSync(ZZ, { recursive: true });
  rmSync(OUT, { recursive: true, force: true });
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { cleanup(); process.exit(2); });

try {
  const texts = makeLanguage();
  console.log(`temporary language: ${texts} texts with marks, without ${LEFT_OUT}`);
  try { execFileSync('npx', ['vitest', 'run', 'tests/i18n.test.ts'], { cwd: ROOT, stdio: 'pipe' }); console.log('tests/i18n.test.ts: passed with the two languages'); }
  catch (e) { fail('the automatic checks of the texts do not pass with the two languages: ' + String(e.stdout ?? e).split('\n').filter((s) => /FAIL|Error|expected/.test(s)).slice(0, 6).join(' | ')); }
  execFileSync('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit' });
  // The temporary language is in the build: the directory in src/ is not necessary for the checks.
  rmSync(ZZ, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });
  server = await serve(OUT);
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const common = json(join(EN, '10-common.json')).text;
  const about = json(join(EN, LEFT_OUT)).text.about;
  const files = json(join(EN, '37-files.json')).text;
  const version = json(join(ROOT, 'package.json')).version;
  const scan = async (page, key, groups) => {
    const text = await pageText(page);
    if (!text.includes(OPEN)) fail(`${key}: the screen has no text of the temporary language`);
    const lines = [...new Set(strip(text).split('\n').map((s) => s.trim()).filter((s) => /[A-Za-z]{2,}/.test(s)))];
    leftovers.set(key, lines);
    const bad = lines.map((s) => ({ s, words: unknownWords(s, groups) })).filter((x) => x.words.length);
    for (const x of bad.slice(0, 12)) fail(`${key}: words that do not come from the locale files: ${[...new Set(x.words)].join(' ')} | ${x.s.slice(0, 120)}`);
    if (bad.length > 12) fail(`${key}: ${bad.length - 12} more lines with such words`);
    return text;
  };

  for (const [size, options] of Object.entries(SIZES)) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') fail(`${size}: console ${m.type()}: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => fail(`${size}: pageerror: ${e.message}`));
    let loads = 0;
    page.on('load', () => { loads += 1; });
    const openMission = async (button) => {
      await page.locator('tr', { hasText: MISSION }).first().getByRole('button', { name: button, exact: true }).click();
      await page.waitForTimeout(300);
      await busyDone(page);
      await page.waitForSelector(NAME_FIELD, { timeout: 30000 });
    };

    // 1. The control for the language.
    await page.goto(base + '#/expert/mission', { waitUntil: 'load' });
    await ready(page);
    const control = page.locator(LANGUAGE);
    if (await control.count() !== 1) { fail(`${size}: the control for the language does not show`); await context.close(); continue; }
    if (!(await control.isVisible())) fail(`${size}: the control for the language is not visible`);
    const names = await control.locator('option').allTextContents();
    if (JSON.stringify(names) !== JSON.stringify(['English', NAME])) fail(`${size}: the languages of the control are ${JSON.stringify(names)}`);
    if (await lang(page) !== 'en') fail(`${size}: the first language is not English`);
    if ((await pageText(page)).includes(OPEN)) fail(`${size}: the English screen shows a text of the temporary language`);
    if (await overflow(page) > 1) fail(`${size}: with the control for the language, the page is wider than the screen`);
    await page.screenshot({ path: join(SHOTS, `${size}-1-english.png`) });

    // 2. A mission with a new name, then the selection of the temporary language.
    await openMission(common.common.open ?? 'Open');
    await page.locator(NAME_FIELD).fill(MISSION_NAME);
    await page.locator(NAME_FIELD).blur();
    const loadsBefore = loads;
    await control.selectOption(CODE);
    await page.waitForTimeout(800);
    if (loads !== loadsBefore) fail(`${size}: the page loads again when the language changes`);
    if (!(await pageText(page)).includes(marked(common.mode.expert))) fail(`${size}: the selection of the language does not change the texts`);
    if (await lang(page) !== CODE) fail(`${size}: the attribute lang of the page is not "${CODE}"`);
    if (!(await page.evaluate(() => location.hash)).startsWith('#/expert/mission')) fail(`${size}: the route changes with the language`);
    const kept = await page.locator(NAME_FIELD).count() ? await page.locator(NAME_FIELD).inputValue() : '(no mission)';
    if (kept !== MISSION_NAME) fail(`${size}: the name of the mission is "${kept}" after the change of the language`);
    if (await overflow(page) > 1) fail(`${size}: in the temporary language, the page is wider than the screen`);
    await page.screenshot({ path: join(SHOTS, `${size}-2-temporary.png`) });

    // 3. The next visit has the selected language.
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    if (await lang(page) !== CODE) fail(`${size}: the next visit does not have the selected language`);
    if (await page.locator(LANGUAGE).inputValue() !== CODE) fail(`${size}: the control does not show the selected language after a new load`);

    // 4. Each screen in the temporary language, with a mission: where the words come from.
    if (!(await page.locator(NAME_FIELD).count())) await openMission(marked(common.common.open ?? 'Open'));
    await page.locator(NAME_FIELD).fill(MISSION_NAME);
    await page.locator(NAME_FIELD).blur();
    for (const route of ROUTES) {
      await page.evaluate((hash) => { location.hash = hash; }, route);
      await page.waitForTimeout(1500);
      await busyDone(page);
      const key = `${size} ${route}`;
      if (route === '#/expert/transfer') { await page.getByRole('button', { name: marked('Find the best dates') }).click(); await page.waitForTimeout(300); await busyDone(page); }
      if (route === '#/expert/windows') { await page.waitForSelector('canvas.map', { timeout: 60000 }); await busyDone(page); }
      if (route === '#/expert/accuracy') await page.waitForTimeout(1500);
      if (route === '#/about') await page.waitForSelector('.about-maps article', { timeout: 30000 });
      if (route.startsWith('#/explorer')) await page.waitForTimeout(2500);
      if (route === '#/explorer') { await page.locator('.xp-chips .chip').first().click(); await page.waitForSelector('.xp-card'); await page.waitForTimeout(500); }
      if (route === '#/explorer/famous') { await page.locator('.xp-chips .chip').first().click(); await page.waitForSelector('.xp-card'); await page.waitForTimeout(500); }
      const groups = ['language', 'user', ...(route === '#/expert/accuracy' ? ['reference'] : []), ...(route === '#/about' ? ['about', 'map', 'library'] : [])];
      const text = await scan(page, key, groups);
      if (route === '#/expert/files') {
        // A file for other programs has English comments, and only ASCII characters, in each language.
        const file = (await page.locator('pre.filetext').allTextContents()).join('\n');
        const comment = files.page.files.comment.replace('{app}', common.app.name).replace('{version}', version).replace('{name}', MISSION_NAME);
        if (!file.includes(comment)) fail(`${size}: the file for other programs does not have the English comment "${comment}"`);
        if (/[^\x09\x0a\x0d\x20-\x7e]/.test(file) || file.includes('?')) fail(`${size}: the file for other programs has characters that are not correct`);
      }
      if (route === '#/expert/accuracy') {
        if (!text.includes(marked(REFERENCE_TEXT))) fail(`${size}: the Accuracy screen does not show the reference text of the temporary language`);
        if (!strip(text).includes(referenceTexts[0])) fail(`${size}: the Accuracy screen does not show an English reference text`);
      }
      if (route === '#/about') {
        // The texts of the file that the temporary language does not have show in English.
        for (const s of [about.title, about.maps.changes]) if (!strip(text).split('\n').some((line) => line.trim() === s)) fail(`${size}: the About screen does not show the English text "${s}"`);
        if (!text.includes(marked(MAP_TEXT))) fail(`${size}: the About screen does not show the map text of the temporary language`);
        if (/\babout\.[a-z]+\.[A-Za-z.]+\b/.test(strip(text))) fail(`${size}: the About screen shows a text key`);
      }
      if (await overflow(page) > 1) fail(`${key}: the page is wider than the screen`);
      if (['#/expert/accuracy', '#/about', '#/explorer/flight', '#/explorer'].includes(route)) await page.screenshot({ path: join(SHOTS, `${size}-4-${route.replace(/[#/]+/g, '-').replace(/^-/, '')}.png`) });
    }

    // 5. The Explorer mode has the control, and the user selects English again.
    if (!(await page.locator(LANGUAGE).isVisible())) fail(`${size}: the control for the language is not visible in the Explorer mode`);
    await page.locator(LANGUAGE).selectOption('en');
    await page.waitForTimeout(600);
    if ((await pageText(page)).includes(OPEN)) fail(`${size}: the screen shows a text of the temporary language after the selection of English`);
    if (await lang(page) !== 'en') fail(`${size}: the attribute lang of the page is not "en" after the selection of English`);
    // The control and the About button are in the screen: the user does not have to move the top bar.
    for (const [what, target] of [['control for the language', page.locator(LANGUAGE)], ['last button of the top bar', page.locator('header.top > button').last()]]) {
      const box = await target.boundingBox();
      if (!box || box.x < 0 || box.x + box.width > options.viewport.width) fail(`${size}: in the Explorer mode, the ${what} is not fully in the screen`);
    }
    await page.screenshot({ path: join(SHOTS, `${size}-5-english-explorer.png`) });
    await context.close();
    console.log(`${size}: done`);
  }
  if (list) for (const [key, lines] of leftovers) console.log(`\n== ${key} (${lines.length} lines with words that have no marks)\n` + lines.map((s) => '   ' + s.slice(0, 160)).join('\n'));
} catch (e) {
  fail('tool: ' + String(e).split('\n')[0]);
} finally {
  if (browser) await browser.close();
  if (server) server.close();
  cleanup();
}
console.log(problems.length ? `${problems.length} problems.` : 'No problem.');
process.exit(problems.length ? 1 : 0);

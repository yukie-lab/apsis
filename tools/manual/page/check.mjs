// Check of the user manual in a browser (Google Chrome with Playwright): manual/index.html as a local file, in English
// and in Japanese, on a large screen and on a phone screen.
// The check finds: errors of the page, requests to the network, text wider than the screen, pictures that do not load,
// texts of the wrong language, links to parts that do not exist, and subtitles that do not show. It also writes
// pictures of the pages for a person to examine (tools/manual/.out/check/).
//
// Use (from the project directory, after build.mjs): node tools/manual/page/check.mjs
// Exit code: 0 = no problem, 1 = problems (the list is in the output).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = new URL('../.out/check/', import.meta.url).pathname;
const PAGE = ROOT + 'manual/index.html';
if (!existsSync(PAGE)) { console.error('No manual/index.html: do "npm run manual:build" first.'); process.exit(2); }
mkdirSync(OUT, { recursive: true });
const url = pathToFileURL(PAGE).href;

// Files of the page: each src and href must be a file in manual/.
const problems = [];
const html = readFileSync(PAGE, 'utf8');
for (const m of html.matchAll(/(?:src|href|poster)="([^"#][^"]*)"/g)) {
  const ref = m[1];
  if (/^(data:|#)/.test(ref)) continue;
  if (/^[a-z]+:/i.test(ref)) { problems.push(`The page refers to ${ref} (outside the manual).`); continue; }
  if (!existsSync(ROOT + 'manual/' + ref)) problems.push(`No file manual/${ref}.`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const sizes = [
  { name: 'desktop', viewport: { width: 1440, height: 1800 }, deviceScaleFactor: 1 },
  { name: 'phone', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
];
const report = [];
for (const size of sizes) {
  for (const lang of ['en', 'ja']) {
    const context = await browser.newContext({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor, isMobile: size.isMobile, hasTouch: size.hasTouch, colorScheme: 'dark' });
    const page = await context.newPage();
    const tag = `${size.name}/${lang}`;
    const errors = [], external = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('page error: ' + e.message));
    page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });
    await page.goto(`${url}?lang=${lang}`);
    await page.waitForLoadState('load');

    const result = await page.evaluate(async (lang) => {
      const out = { lang: document.documentElement.getAttribute('data-lang'), htmlLang: document.documentElement.lang, title: document.title };
      // Pictures: load all of them.
      const imgs = [...document.images];
      for (const img of imgs) img.loading = 'eager';
      await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
      await Promise.all(imgs.map((img) => img.decode().catch(() => null)));
      out.pictures = imgs.length;
      out.brokenPictures = imgs.filter((img) => !img.naturalWidth).map((img) => img.getAttribute('src'));
      out.altLang = imgs.filter((img) => img.alt !== img.getAttribute('data-alt-' + lang)).length;
      // Texts of the other language must not show; texts of this language must show.
      const other = lang === 'en' ? 'ja' : 'en';
      out.otherVisible = [...document.querySelectorAll('.t-' + other)].filter((el) => el.getClientRects().length > 0).length;
      out.thisHidden = [...document.querySelectorAll('.t-' + lang)].filter((el) => getComputedStyle(el).display === 'none').length;
      out.thisCount = document.querySelectorAll('.t-' + lang).length;
      // Width.
      out.scrollWidth = document.documentElement.scrollWidth;
      out.innerWidth = window.innerWidth;
      out.wide = [...document.querySelectorAll('main *')].filter((el) => {
        if (el.closest('.figwrap, .tablewrap, .cmd, .shotwrap')) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1;
      }).slice(0, 5).map((el) => el.tagName + '.' + el.className);
      // Marks of the pictures: in the picture, and not on other marks.
      out.marksOver = [];
      out.marksOut = [];
      for (const wrap of document.querySelectorAll('.shot .shotwrap')) {
        const w = wrap.getBoundingClientRect();
        if (!w.width) continue; // the copy of the picture for the other language
        const name = wrap.querySelector('img').getAttribute('src');
        const ms = [...wrap.querySelectorAll('.badge')].map((m) => { const r = m.getBoundingClientRect(); return { n: m.textContent, r, x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width }; });
        for (const m of ms) if (m.r.left < w.left - 1 || m.r.top < w.top - 1 || m.r.right > w.right + 1 || m.r.bottom > w.bottom + 1) out.marksOut.push(`${name} ${m.n}`);
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
          if (Math.hypot(ms[i].x - ms[j].x, ms[i].y - ms[j].y) < (ms[i].s + ms[j].s) / 2 - 0.5) out.marksOver.push(`${name} ${ms[i].n}/${ms[j].n}`);
        }
      }
      // Each picture of a screen shows once, in the language of the page (the files of the Japanese pictures end with -ja).
      out.shotLang = [...document.querySelectorAll('.shot')].filter((s) => {
        const shown = [...s.querySelectorAll('.shotwrap')].filter((w) => w.getClientRects().length > 0);
        return shown.length !== 1 || /-ja\.webp$/.test(shown[0].querySelector('img').getAttribute('src')) !== (lang === 'ja');
      }).map((s) => s.querySelector('img').getAttribute('src'));
      // Links in the page.
      out.badLinks = [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href').slice(1)).filter((id) => id && !document.getElementById(id));
      // Videos and subtitles.
      out.videos = [];
      for (const v of document.querySelectorAll('video[data-video]')) {
        const tracks = [...v.textTracks];
        const showing = tracks.filter((t) => t.mode === 'showing').map((t) => t.language);
        if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); v.addEventListener('error', r, { once: true }); v.load(); });
        const cue = tracks.find((t) => t.language === lang)?.cues?.[3];
        let active = null;
        if (cue) {
          await new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = (cue.startTime + cue.endTime) / 2; });
          await new Promise((r) => setTimeout(r, 150));
          const t = tracks.find((x) => x.language === lang);
          active = t.activeCues && t.activeCues.length ? t.activeCues[0].text : null;
        }
        out.videos.push({ id: v.getAttribute('data-video'), duration: v.duration, error: v.error ? v.error.code : null, tracks: tracks.map((t) => `${t.language}:${t.cues?.length}`), showing, cueText: cue?.text ?? null, active });
      }
      return out;
    }, lang);

    // Language switch.
    const otherLang = lang === 'en' ? 'ja' : 'en';
    const h1Before = await page.locator('h1 .t-' + lang).innerText();
    await page.locator(`.lang button[data-set-lang="${otherLang}"]`).click();
    const after = await page.evaluate((o) => ({
      lang: document.documentElement.getAttribute('data-lang'),
      pressed: document.querySelector(`.lang button[data-set-lang="${o}"]`).getAttribute('aria-pressed'),
      h1: document.querySelector('h1 .t-' + o).innerText,
      h1Shown: document.querySelector('h1 .t-' + o).getClientRects().length > 0,
      stored: (() => { try { return localStorage.getItem('apsis-manual-lang'); } catch (e) { return 'no storage'; } })(),
      tracks: [...document.querySelectorAll('video[data-video]')].map((v) => [...v.textTracks].filter((t) => t.mode === 'showing').map((t) => t.language).join(',')),
    }), otherLang);
    await page.locator(`.lang button[data-set-lang="${lang}"]`).click();

    // Full picture: the button below the first picture opens it, the close button closes it.
    await page.locator('button.zbtn').first().click();
    await page.waitForTimeout(200);
    const zoom = await page.evaluate(async () => {
      const d = document.getElementById('zoom');
      const img = d.querySelector('.zbody img');
      if (img) await img.decode().catch(() => null);
      return { open: d.open, picture: img ? img.naturalWidth : 0, src: img ? img.getAttribute('src') : '', title: d.querySelector('.ztitle').textContent.trim(), buttons: d.querySelectorAll('.ztitle button').length, marks: d.querySelectorAll('.zbody .badge').length };
    });
    await page.locator('#zoom .zclose').click();
    zoom.closed = await page.evaluate(() => !document.getElementById('zoom').open);

    // Pictures of the page for a person to examine.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(250); // the contents marks the section on the screen after the scroll
    await page.screenshot({ path: `${OUT}${size.name}-${lang}-top.png` });
    // The full page in parts (Chrome cannot make one picture of a very long page).
    const step = size.viewport.height - 60;
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let k = 0, y = 0; y < height; k++, y += step) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${OUT}${size.name}-${lang}-${String(k).padStart(2, '0')}.png` });
    }
    // One video with its subtitle (the fourth cue of the second video).
    const v = page.locator('video[data-video="v2"]');
    await v.scrollIntoViewIfNeeded();
    await page.evaluate(async () => {
      const el = document.querySelector('video[data-video="v2"]');
      const cue = [...el.textTracks].find((t) => t.mode === 'showing').cues[3];
      await new Promise((r) => { el.addEventListener('seeked', r, { once: true }); el.currentTime = (cue.startTime + cue.endTime) / 2; });
    });
    await page.waitForTimeout(400);
    await v.screenshot({ path: `${OUT}${size.name}-${lang}-video.png` });

    const p = [];
    if (result.lang !== lang || result.htmlLang !== lang) p.push(`language ${result.lang}/${result.htmlLang}, not ${lang}`);
    if (result.brokenPictures.length) p.push('pictures that do not load: ' + result.brokenPictures.join(', '));
    if (result.altLang) p.push(`${result.altLang} pictures with a text of the other language`);
    if (result.otherVisible) p.push(`${result.otherVisible} texts of the other language show`);
    if (result.thisHidden) p.push(`${result.thisHidden} texts of this language do not show`);
    if (result.scrollWidth > result.innerWidth + 1) p.push(`the page is wider than the screen (${result.scrollWidth} px for ${result.innerWidth} px): ${result.wide.join(', ')}`);
    if (result.badLinks.length) p.push('links to parts that do not exist: ' + result.badLinks.join(', '));
    if (result.marksOver.length) p.push('marks that cover other marks: ' + result.marksOver.join(', '));
    if (result.marksOut.length) p.push('marks that are not fully in the picture: ' + result.marksOut.join(', '));
    if (!zoom.open || !zoom.picture || !zoom.title || zoom.buttons || !zoom.marks || !zoom.closed) p.push('the full picture does not operate: ' + JSON.stringify(zoom));
    if (/-ja\.webp$/.test(zoom.src) !== (lang === 'ja')) p.push(`the full picture is not in the language of the page: ${zoom.src}`);
    if (result.shotLang.length) p.push('pictures of screens that do not show once in the language of the page: ' + result.shotLang.join(', '));
    for (const vi of result.videos) {
      if (vi.error || !(vi.duration > 0)) p.push(`video ${vi.id}: it does not load (${vi.error})`);
      if (vi.showing.join(',') !== lang) p.push(`video ${vi.id}: the subtitles that show are "${vi.showing}", not "${lang}"`);
      if (!vi.active || vi.active !== vi.cueText) p.push(`video ${vi.id}: no subtitle at the time of a cue`);
    }
    if (after.lang !== otherLang || after.pressed !== 'true' || !after.h1Shown || after.h1 === h1Before) p.push('the language switch does not operate');
    if (after.stored !== otherLang) p.push(`the page does not keep the language (${after.stored})`);
    if (after.tracks.some((t) => t !== otherLang)) p.push('the subtitles do not change with the language');
    if (errors.length) p.push('errors: ' + errors.join(' | '));
    if (external.length) p.push('requests to the network: ' + external.join(', '));
    report.push({ tag, ...result, switch: after, zoom, errors, external, problems: p });
    for (const x of p) problems.push(`${tag}: ${x}`);
    console.log(`${tag}: ${result.pictures} pictures, ${result.thisCount} texts, ${result.videos.length} videos (${result.videos.map((x) => x.tracks.join(' ')).join('; ')}), width ${result.scrollWidth}/${result.innerWidth} px, ${p.length ? p.length + ' problems' : 'no problem'}`);
    await context.close();
  }
}
await browser.close();
writeFileSync(OUT + 'result.json', JSON.stringify({ problems, report }, null, 1) + '\n');
if (problems.length) {
  console.log('\nProblems:\n' + problems.map((x) => '  ' + x).join('\n'));
  process.exit(1);
}
console.log(`No problem. Pictures of the pages: ${OUT}`);

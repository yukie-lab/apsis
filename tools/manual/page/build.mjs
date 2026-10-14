// Makes the user manual: manual/index.html with its pictures (manual/img) and videos (manual/video).
//
// Input (all in tools/manual/.out/, see docs/MANUAL.md):
//   data/*.json      results of the engine (npm run manual:data)
//   shots/*.{png,json}  pictures of the screens and the boxes of their parts (npm run manual:shots)
//   subs/*, audio/*  subtitles and the check of the narration (npm run manual:voice)
//   video/*.mp4      the videos (npm run manual:video)
// The texts are in content.mjs and the figures in figures.mjs.
//
// The script also gives each English sentence of the page and of the narration to the project tool
// tools/ste/ste-lint.mjs (one sentence for each key) and writes the part of the sentences with no finding in the page.
// Result of the check: tools/manual/.out/ste/result.json.
//
// Use (from the project directory): node tools/manual/page/build.mjs [--fast]
//   --fast  keep the pictures and the posters that exist (only for work on the texts).
// The page is one HTML file with its CSS and its script. It uses no network: open manual/index.html in a browser.
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import * as F from './figures.mjs';
import { esc, BODY } from './svg.mjs';
import { content, UI, CREDITS } from './content.mjs';
import { makeValues, fill, date } from '../values.mjs';

const MANUAL = new URL('..', import.meta.url).pathname;
const ROOT = new URL('../../../', import.meta.url).pathname;
const OUT = MANUAL + '.out/';
const DEST = ROOT + 'manual/';
const FAST = process.argv.includes('--fast');
const LANGS = ['en', 'ja'];
const VIDEOS = ['v1', 'v2', 'v3', 'v4'];
/** Time of the frame that is the poster of each video (seconds): a typical picture of the video. */
const POSTER_AT = { v1: 76, v2: 40, v3: 88, v4: 14 };
/** Width of the pictures of the screens in the page (pixels). The pictures have 2 pixels for each CSS pixel. */
const PICTURE_WIDTH = 1600;

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
function need(file, how) {
  if (!existsSync(file)) throw new Error(`No file ${file}: do "${how}" first.`);
  return file;
}

// ---- Data and values ---------------------------------------------------------------------------------------------------
const D = {};
for (const n of ['planets', 'orbits', 'mars', 'quick-mars', 'voyager2', 'missions', 'accuracy']) D[n] = readJson(need(`${OUT}data/${n}.json`, 'npm run manual:data'));
const V = makeValues(D);
V.version = readJson(ROOT + 'package.json').version;
const appText = (file) => readJson(`${ROOT}src/i18n/locales/en/${file}`);
V.glossaryCount = String(Object.keys(appText('90-glossary.json').glossary).length);

// Colors of the bodies: the colors of the engine (src/engine/bodies.ts).
const bodyColor = {};
for (const m of readFileSync(ROOT + 'src/engine/bodies.ts', 'utf8').matchAll(/make\('(\w+)',\s*\d+,\s*'\w+',\s*[^,]+,\s*'(#[0-9a-fA-F]{6})'/g)) bodyColor[m[1]] = m[2];

// Texts of the application that the manual shows (the same English text, no copy in content.mjs).
const explorer = appText('39-explorer.json').text.explorer;
function findKey(node, key) {
  for (const [k, v] of Object.entries(node)) {
    if (k === key && typeof v === 'string') return v;
    if (v && typeof v === 'object') { const r = findKey(v, key); if (r) return r; }
  }
  return null;
}
const howTo = findKey(appText('38-scene.json'), 'howTo');
if (howTo !== `${UI.turn.en} ${UI.zoomView.en}`) throw new Error(`The text "howTo" of the application changed: change UI.turn and UI.zoomView in content.mjs.\n  application: ${howTo}`);

// All texts of the application in the two languages of the manual (the same merge as src/i18n/index.ts).
function appTexts(code) {
  const dir = `${ROOT}src/i18n/locales/${code}/`;
  const tree = {};
  const put = (into, from) => {
    for (const [key, v] of Object.entries(from)) {
      const path = key.split('.');
      let node = into;
      for (const part of path.slice(0, -1)) node = node[part] && typeof node[part] === 'object' ? node[part] : (node[part] = {});
      const k = path[path.length - 1];
      if (v && typeof v === 'object' && !Array.isArray(v)) { if (!node[k] || typeof node[k] !== 'object') node[k] = {}; put(node[k], v); } else node[k] = v;
    }
  };
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) put(tree, readJson(dir + f).text ?? {});
  const flat = new Map();
  const walk = (node, prefix) => { for (const [k, v] of Object.entries(node)) { const key = prefix ? `${prefix}.${k}` : k; if (typeof v === 'string') flat.set(key, v); else walk(v, key); } };
  walk(tree, '');
  return flat;
}
const APP = { en: appTexts('en'), ja: appTexts('ja') };
const howToJa = APP.ja.get('scene.howTo');
if (howToJa !== `${UI.turn.ja}${UI.zoomView.ja}`) throw new Error(`The Japanese text "scene.howTo" of the application changed: change UI.turn and UI.zoomView in content.mjs.\n  application: ${howToJa}`);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * The Japanese forms of an English text of the application: the Japanese texts of all keys with this English text.
 * A key with parts in braces ("Launch to {body}") also gives a form: the parts are the Japanese forms of their texts.
 */
function appJa(en) {
  const forms = new Set();
  for (const [key, v] of APP.en) {
    if (v === en) { if (APP.ja.has(key)) forms.add(APP.ja.get(key)); continue; }
    if (!v.includes('{') || !APP.ja.has(key)) continue;
    const names = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const m = new RegExp('^' + v.split(/\{\w+\}/).map(escRe).join('(.+?)') + '$').exec(en);
    if (!m) continue;
    let ja = APP.ja.get(key);
    names.forEach((n, i) => { ja = ja.split(`{${n}}`).join([...appJa(m[i + 1])][0] ?? m[i + 1]); });
    forms.add(ja);
  }
  return forms;
}
/** The Japanese name of a screen of the Expert mode (the texts "nav"). */
function screenJa(en) {
  for (const [key, v] of APP.en) if (key.startsWith('nav.') && v === en) return APP.ja.get(key);
  throw new Error(`"${en}" is not the name of a screen of the application (texts "nav").`);
}
const favicon = /<link rel="icon" href="([^"]+)"/.exec(readFileSync(ROOT + 'index.html', 'utf8'))?.[1];
if (!favicon) throw new Error('No icon in index.html.');

// Videos, subtitles and the check of the narration.
const subs = {};
const videoInfo = {};
let werErrors = 0, werWords = 0;
for (const v of VIDEOS) {
  subs[v] = readJson(need(`${OUT}subs/${v}.json`, 'npm run manual:voice'));
  const file = need(`${OUT}video/${v}.mp4`, 'npm run manual:video');
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], { encoding: 'utf8' });
  const p = JSON.parse(probe);
  const duration = Number(p.format.duration);
  if (Math.abs(duration - subs[v].total) > 0.2) throw new Error(`${v}.mp4 has ${duration} s, the subtitles ${subs[v].total} s: make the video again.`);
  if (p.streams.some((s) => s.codec_type === 'subtitle')) throw new Error(`${v}.mp4 has subtitle streams: the page adds the subtitles (a second copy is not necessary).`);
  videoInfo[v] = { duration, bytes: statSync(file).size };
  const check = readJson(need(`${OUT}audio/${v}/check.json`, 'node tools/manual/narration/check.mjs'));
  werErrors += Math.round(check.wordErrorRate * check.words);
  werWords += check.words;
}
V.werPct = (100 * werErrors / werWords).toFixed(1);

// ---- Text --------------------------------------------------------------------------------------------------------------
/** Placeholders and file names of a text: the English and the Japanese text must have the same. */
const marks = (s) => [...s.matchAll(/\{\w+\}|`[^`]+`/g)].map((m) => m[0]).sort().join(' ');
const labels = (s) => [...s.matchAll(/\[\[(.+?)\]\]/g)].map((m) => m[1]);
function checkPair(T, where) {
  if (!T || typeof T.en !== 'string' || typeof T.ja !== 'string' || !T.en.trim() || !T.ja.trim()) throw new Error(`${where}: a text needs "en" and "ja".`);
  if (marks(T.en) !== marks(T.ja)) throw new Error(`${where}: the English and the Japanese text have different values or file names.\n  en: ${T.en}\n  ja: ${T.ja}`);
  // A label is a text of the application: the Japanese text quotes the Japanese text of the same label.
  const en = labels(T.en), ja = labels(T.ja);
  if (en.length !== ja.length) throw new Error(`${where}: the English and the Japanese text have a different number of labels.\n  en: ${T.en}\n  ja: ${T.ja}`);
  for (const l of en) {
    const forms = appJa(l);
    if (!forms.size) throw new Error(`${where}: the label [[${l}]] is not a text of the application.`);
    if (!ja.some((x) => forms.has(x))) throw new Error(`${where}: the Japanese text does not have the label of the application for [[${l}]]: ${[...forms].map((f) => `[[${f}]]`).join(' or ')}.\n  ja: ${T.ja}`);
  }
}
/** Markup of a text: [[label]] is a control of the application, `text` is a file name or a command. */
const markup = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, '<b class="ui">$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');

// English sentences of the page for the check (filled in by bi()).
let steSentences = null;
/** Sentences of an English text: a full stop, a question mark or an exclamation mark, then a space and a capital letter or a number. */
const splitSentences = (s) => s.split(/(?<=[.!?])\s+(?=[A-Z0-9"(])/).map((x) => x.trim()).filter(Boolean);
/** The English text as the check reads it: a label is a quotation, a file name is a name. */
const steForm = (s) => s.replace(/\[\[(.+?)\]\]/g, '"$1"').replace(/`([^`]+)`/g, '$1');

let where = '';
/** A text in the two languages: two elements, the page shows one. */
function bi(T, tag = 'span', cls = '') {
  checkPair(T, where);
  const en = fill(T.en, V, 'en');
  if (steSentences) for (const s of splitSentences(steForm(en))) steSentences.add(s);
  return LANGS.map((l) => `<${tag} class="t-${l}${cls ? ' ' + cls : ''}" lang="${l}">${markup(l === 'en' ? en : fill(T.ja, V, 'ja'))}</${tag}>`).join('');
}
/** A value (a string, or a date with an English and a Japanese form) as a text in the two languages. */
const biValue = (v) => (typeof v === 'string' ? esc(v) : LANGS.map((l) => `<span class="t-${l}" lang="${l}">${esc(v[l])}</span>`).join(''));
const plain = (T, lang) => fill(T[lang], V, lang).replace(/\[\[(.+?)\]\]/g, '$1').replace(/`([^`]+)`/g, '$1');

// ---- Pictures -------------------------------------------------------------------------------------------------------------
mkdirSync(DEST + 'img', { recursive: true });
mkdirSync(DEST + 'video', { recursive: true });
const made = new Set(); // files of manual/ that this run makes
const shots = {};
const pictures = {};
/** A picture of a screen in a language of the application: English pictures are in .out/shots/, the others in .out/shots/<lang>/. */
function picture(name, crop, lang = 'en') {
  const key = `${lang}:${name}` + (crop ? ':' + crop.join(',') : '');
  if (pictures[key]) return pictures[key];
  const dir = `${OUT}shots/${lang === 'en' ? '' : lang + '/'}`;
  const s = (shots[`${lang}:${name}`] ??= readJson(need(`${dir}${name}.json`, lang === 'en' ? 'npm run manual:shots' : `node tools/manual/shots/capture.mjs --lang ${lang}`)));
  const [x, y, w, h] = crop ?? [0, 0, s.width, s.height];
  if (x < 0 || y < 0 || x + w > s.width || y + h > s.height) throw new Error(`${name} (${lang}): the crop ${crop} is not in the picture (${s.width} x ${s.height}).`);
  const outW = Math.min(PICTURE_WIDTH, w), outH = Math.round((h * outW) / w);
  const file = `img/${name}${crop ? `-${x}-${y}` : ''}${lang === 'en' ? '' : '-' + lang}.webp`;
  if (!(FAST && existsSync(DEST + file))) {
    execFileSync('cwebp', ['-quiet', '-q', '86', '-m', '6', '-sharp_yuv', '-metadata', 'none', '-crop', x, y, w, h, '-resize', outW, outH, `${dir}${s.file}`, '-o', DEST + file].map(String));
  }
  made.add(file);
  return (pictures[key] = { file, w: outW, h: outH, crop: [x, y, w, h], shot: s });
}

// ---- Figures -------------------------------------------------------------------------------------------------------------
const pork = F.porkchop(D.mars, V);
writeFileSync(DEST + 'img/porkchop-mars.png', pork.png);
made.add('img/porkchop-mars.png');
const FIGURES = {
  solar: () => F.solarSystem(D.planets),
  browser: () => F.browser(),
  search: () => F.search(D['quick-mars'], V),
  flight: () => F.quickFlight(D['quick-mars'], D.planets),
  conics: () => F.conics(D.orbits),
  ellipse: () => F.ellipse(D.orbits, V),
  elements: () => F.elements(D.orbits),
  porkchop: () => pork.svg,
  series: () => F.series(D.mars, V),
  voyager: () => F.voyagerPath(D.voyager2, D.planets),
  turn: () => F.turn(D.voyager2, V),
  speed: () => F.speed(D.voyager2, V),
  accuracy: () => F.accuracy(D.accuracy, D.missions),
  vnb: () => F.vnb(D.orbits),
};

// ---- Videos ---------------------------------------------------------------------------------------------------------------
for (const v of VIDEOS) {
  const files = [`${v}.mp4`, ...LANGS.flatMap((l) => [`${v}.${l}.vtt`, `${v}.${l}.srt`])];
  for (const f of files) {
    const src = f.endsWith('.mp4') ? `${OUT}video/${f}` : need(`${OUT}subs/${f}`, 'npm run manual:voice');
    const dst = `${DEST}video/${f}`;
    if (!existsSync(dst) || statSync(dst).size !== statSync(src).size || statSync(dst).mtimeMs < statSync(src).mtimeMs) copyFileSync(src, dst);
    made.add(`video/${f}`);
  }
  const poster = `video/${v}-poster.webp`;
  if (!(FAST && existsSync(DEST + poster))) {
    const png = `${OUT}video/${v}-poster.png`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(POSTER_AT[v]), '-i', `${OUT}video/${v}.mp4`, '-frames:v', '1', png]);
    execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-resize', '1280', '720', png, '-o', DEST + poster]);
    rmSync(png);
  }
  made.add(poster);
}

// ---- Icons ------------------------------------------------------------------------------------------------------------------
const icon = (body, color) => `<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  plan: icon('<circle cx="8" cy="24" r="3"/><circle cx="24.5" cy="8" r="3.5"/><path d="M10.6 22.2C14 15 17.5 11.5 21.2 9.6" stroke-dasharray="2.2 3.4"/>', '#ffb454'),
  view: icon('<path d="M16 4l11 6v12l-11 6-11-6V10z"/><path d="M5 10l11 6 11-6M16 16v12"/>', '#78b7ff'),
  actual: icon('<rect x="12" y="12" width="8" height="8" rx="1.2"/><path d="M3.5 13h6v6h-6zM22.5 13h6v6h-6zM9.5 16H12M20 16h2.5M16 12V7.5M13.5 7.5h5"/>', '#f78fb3'),
  data: icon('<circle cx="16" cy="16" r="3.2"/><ellipse cx="16" cy="16" rx="12.5" ry="5.6" transform="rotate(-25 16 16)"/>', '#ffd166'),
  check: icon('<circle cx="16" cy="16" r="11.5"/><path d="M10.8 16.4l3.6 3.6 7-7.6"/>', '#7bd88f'),
  lock: icon('<rect x="7" y="14" width="18" height="13" rx="2.5"/><path d="M11 14v-3.6a5 5 0 0 1 10 0V14"/>', '#5fd7c7'),
  turn: icon('<path d="M26 16a10 10 0 1 1-3-7.1"/><path d="M26 4.8v6.4h-6.4"/>', '#78b7ff'),
  zoom: icon('<path d="M6 6l7 7M6 6h5.5M6 6v5.5M26 26l-7-7M26 26h-5.5M26 26v-5.5"/>', '#78b7ff'),
};
const BRAND = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#05070c"/><ellipse cx="16" cy="16" rx="12" ry="6.5" fill="none" stroke="#ffb454" stroke-width="2" transform="rotate(-28 16 16)"/><circle cx="11" cy="18" r="3" fill="#78b7ff"/></svg>`;

// ---- Blocks -----------------------------------------------------------------------------------------------------------------
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// Lengths of the videos: whole seconds without rounding up, as the video player shows them.
const length = (t) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return { en: UI.minutes.en.replace('{m}', m).replace('{s}', s), ja: UI.minutes.ja.replace('{m}', m).replace('{s}', s) };
};
const mb = (bytes) => (bytes / 1e6).toFixed(1) + ' MB';

function videoBlock(v) {
  const n = VIDEOS.indexOf(v) + 1;
  const s = subs[v];
  where = `video ${v}`;
  const transcript = s.cues.en.map((c, k) => {
    const ja = s.cues.ja[k];
    if (Math.abs(ja.start - c.start) > 0.01) throw new Error(`${v}: the English and the Japanese subtitles do not agree (cue ${k + 1}).`);
    return `<li><button type="button" class="ts" data-v="${v}" data-t="${c.start}">${clock(c.start)}</button><span class="t-en" lang="en">${esc(c.text.replace(/\n/g, ' '))}</span><span class="t-ja" lang="ja">${esc(ja.text.replace(/\n/g, ''))}</span></li>`;
  }).join('');
  return `<figure class="video" id="video-${v}">
<div class="vframe"><video controls preload="metadata" playsinline poster="video/${v}-poster.webp" data-video="${v}" aria-labelledby="video-${v}-title"><source src="video/${v}.mp4" type="video/mp4"></video></div>
<figcaption><span class="vtag">${bi(UI.video)} ${n}</span><span class="vtitle" id="video-${v}-title">${biValue(s.title)}</span><span class="vlen">${biValue(length(videoInfo[v].duration))}</span></figcaption>
<details class="transcript"><summary>${bi(UI.transcript)}</summary><ol>${transcript}</ol></details>
</figure>`;
}

const ZOOM_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6"/></svg>';
function shotBlock(b) {
  const pct = (v, d) => +((100 * v) / d).toFixed(3) + '%';
  const alt = { en: plain(b.title, 'en'), ja: plain(b.title, 'ja') };
  // One picture for each language: the screens show the texts of the language of the page.
  const wraps = LANGS.map((lang) => {
    const pic = picture(b.shot, b.crop, lang);
    const [cx, cy, cw, ch] = pic.crop;
    let overlay = '';
    (b.marks ?? []).forEach(([name, , at], k) => {
      const box = pic.shot.boxes?.[name];
      if (!box) throw new Error(`${b.shot} (${lang}): no box "${name}" in the picture data.`);
      const [bx, by, bw, bh] = box;
      const x0 = Math.max(bx, cx), y0 = Math.max(by, cy), x1 = Math.min(bx + bw, cx + cw), y1 = Math.min(by + bh, cy + ch);
      if (x1 <= x0 || y1 <= y0 || (x1 - x0) * (y1 - y0) < 0.5 * bw * bh) throw new Error(`${b.shot} (${lang}): the box "${name}" is not in the crop.`);
      const n = k + 1;
      overlay += `<span class="box" data-mark="${n}" style="left:${pct(x0 - cx, cw)};top:${pct(y0 - cy, ch)};width:${pct(x1 - x0, cw)};height:${pct(y1 - y0, ch)}"></span>`;
      if (at && !['bl', 'tr', 'br'].includes(at)) throw new Error(`${b.shot}: unknown position "${at}" of a number.`);
      const ax = at === 'tr' || at === 'br' ? x1 : x0, ay = at === 'bl' || at === 'br' ? y1 : y0;
      overlay += `<span class="badge" data-mark="${n}" style="--x:${pct(ax - cx, cw)};--y:${pct(ay - cy, ch)}" aria-hidden="true">${n}</span>`;
    });
    return `<div class="shotwrap t-${lang}" lang="${lang}"><button type="button" class="pic" data-label-en="${esc(UI.zoom.en)}" data-label-ja="${esc(UI.zoom.ja)}" aria-label="${esc(UI.zoom.en)}"><img src="${pic.file}" width="${pic.w}" height="${pic.h}" loading="lazy" decoding="async" alt="${esc(alt.en)}" data-alt-en="${esc(alt.en)}" data-alt-ja="${esc(alt.ja)}"></button>${overlay}</div>`;
  }).join('');
  const legend = (b.marks ?? []).map(([, T], k) => `<li data-mark="${k + 1}"><span class="num" aria-hidden="true">${k + 1}</span><span>${bi(T)}</span></li>`).join('');
  return `<figure class="shot">
${wraps}
<figcaption><span class="ptag">${bi(UI.picture)}</span> ${bi(b.title, 'b')}<button type="button" class="zbtn" data-label-en="${esc(UI.zoom.en)}" data-label-ja="${esc(UI.zoom.ja)}" aria-label="${esc(UI.zoom.en)}">${ZOOM_ICON}</button></figcaption>
${legend ? `<ol class="legend">${legend}</ol>` : ''}${b.note ? bi(b.note, 'p', 'note') : ''}
</figure>`;
}

function figBlock(b) {
  const make = FIGURES[b.fig];
  if (!make) throw new Error(`No figure "${b.fig}".`);
  return `<figure class="figure" id="figure-${b.fig}"><div class="figwrap">${make()}</div><figcaption><span class="ptag">${bi(UI.figure)}</span> ${bi(b.cap)}</figcaption></figure>`;
}

function missionsBlock() {
  return `<div class="missions">${D.missions.map((m) => {
    const story = explorer.famous.story[m.id];
    const storyJa = APP.ja.get(`explorer.famous.story.${m.id}`), nameJa = APP.ja.get(`spacecraft.${m.id}`);
    if (!story || !storyJa || !nameJa) throw new Error(`Mission ${m.id}: no story or no Japanese name in the texts of the application.`);
    const route = m.route.map((id, k) => {
      if (!BODY[id] || !bodyColor[id]) throw new Error(`Mission ${m.id}: no name or no color for ${id}.`);
      return (k ? '<li class="arr" aria-hidden="true">›</li>' : '') + `<li style="--c:${bodyColor[id]}">${biValue(BODY[id])}</li>`;
    }).join('');
    return `<article class="mission"><h3>${biValue({ en: m.name, ja: nameJa })}</h3>
<p class="mdate">${bi(UI.launchCol)}: ${biValue(date(m.startUtc))}</p>
<ol class="route" aria-label="${esc(UI.routeCol.en)}" data-label-en="${esc(UI.routeCol.en)}" data-label-ja="${esc(UI.routeCol.ja)}">${route}</ol>
${bi({ en: story, ja: storyJa }, 'p')}</article>`;
  }).join('')}</div>`;
}

function downloadsBlock() {
  const rows = VIDEOS.map((v, k) => {
    const link = (f, label) => `<a href="video/${f}" download>${label}</a>`;
    return `<tr><td>${k + 1}. ${biValue(subs[v].title)}</td><td class="num">${clock(videoInfo[v].duration)}</td>
<td>${link(`${v}.mp4`, `MP4 (${mb(videoInfo[v].bytes)})`)}</td>
<td>${bi(UI.subsJa)}: ${link(`${v}.ja.vtt`, 'VTT')} · ${link(`${v}.ja.srt`, 'SRT')}<br>${bi(UI.subsEn)}: ${link(`${v}.en.vtt`, 'VTT')} · ${link(`${v}.en.srt`, 'SRT')}</td></tr>`;
  }).join('');
  return `<h3>${bi(UI.download)}</h3><div class="tablewrap"><table class="dl"><thead><tr><th>${bi(UI.dlVideo)}</th><th>${bi(UI.dlLength)}</th><th colspan="2">${bi(UI.dlFiles)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function block(b) {
  if (b.lead) return bi(b.lead, 'p', 'lead');
  if (b.p) return bi(b.p, 'p');
  if (b.video) return videoBlock(b.video);
  if (b.facts) return `<ul class="facts">${b.facts.map((f) => `<li>${ICONS[f.icon] ?? (() => { throw new Error('No icon ' + f.icon); })()}<span>${bi(f.t)}</span></li>`).join('')}</ul>`;
  if (b.fig) return figBlock(b);
  if (b.cmd) return `<pre class="cmd"><code>${b.cmd.map((c) => `<span class="ln">${esc(c)}</span>`).join('\n')}</code></pre>`;
  if (b.shot) return shotBlock(b);
  if (b.steps) return `<ol class="steps">${b.steps.map((t) => `<li>${bi(t)}</li>`).join('')}</ol>`;
  if (b.controls) return `<h3>${bi(UI.controlsTitle)}</h3><ul class="controls"><li>${ICONS.turn}<span>${bi(UI.turn)}</span></li><li>${ICONS.zoom}<span>${bi(UI.zoomView)}</span></li></ul>`;
  if (b.missions) return missionsBlock();
  if (b.screens) return `<h3>${bi(UI.screensTitle)}</h3><dl class="screens">${b.screens.map(([name, t]) => `<div><dt><b class="ui">${biValue({ en: name, ja: screenJa(name) })}</b></dt><dd>${bi(t)}</dd></div>`).join('')}</dl>`;
  if (b.list) return (b.title ? `<h3>${bi(b.title)}</h3>` : '') + `<ul class="bul">${b.list.map((t) => `<li>${bi(t)}</li>`).join('')}</ul>`;
  if (b.downloads) return downloadsBlock();
  if (b.credits) return `<h3>${bi(UI.credits)}</h3><ul class="bul credits">${CREDITS.map((t) => `<li>${bi(t)}</li>`).join('')}</ul>`;
  throw new Error('Unknown block: ' + JSON.stringify(b).slice(0, 80));
}

// ---- Page -------------------------------------------------------------------------------------------------------------------
const CSS = readFileSync(new URL('page.css', import.meta.url), 'utf8');
const JS = readFileSync(new URL('page.js', import.meta.url), 'utf8');

function render() {
  const sections = content();
  const ids = new Set();
  for (const s of sections) { if (ids.has(s.id)) throw new Error('Two sections ' + s.id); ids.add(s.id); }
  const body = sections.map((s) => {
    where = `section ${s.id}`;
    const head = s.hero
      ? `<p class="kicker">${bi(UI.meta)}</p><h1>${bi(s.title)}</h1>`
      : `<h2>${bi(s.title)}</h2>`;
    return `<section id="${s.id}"${s.hero ? ' class="hero"' : ''}>${head}\n${s.blocks.map((b, k) => { where = `section ${s.id}, block ${k + 1}`; return block(b); }).join('\n')}\n</section>`;
  }).join('\n');
  where = 'contents';
  const toc = sections.filter((s) => !s.hero).map((s) => `<li><a href="#${s.id}">${bi(s.title)}</a></li>`).join('');
  where = 'page';
  const top = sections.find((s) => s.hero);
  const title = { en: plain(top.title, 'en'), ja: plain(top.title, 'ja') };
  const cues = Object.fromEntries(VIDEOS.map((v) => [v, Object.fromEntries(LANGS.map((l) => [l, subs[v].cues[l].map((c) => [c.start, c.end, c.text])]))]));
  const subsJson = JSON.stringify(cues).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en" data-lang="en" data-title-en="${esc(title.en)}" data-title-ja="${esc(title.ja)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${esc(title.en)}</title>
<link rel="icon" href="${favicon}">
<script>(function(){var l='en';try{var q=new URLSearchParams(location.search).get('lang');var s=null;try{s=localStorage.getItem('apsis-manual-lang')}catch(e){}if(q==='en'||q==='ja')l=q;else if(s==='en'||s==='ja')l=s}catch(e){}var r=document.documentElement;r.setAttribute('data-lang',l);r.lang=l;document.title=r.getAttribute('data-title-'+l)})();</script>
<style>
${CSS}
</style>
</head>
<body>
<header class="bar">
<a class="brand" href="#top">${BRAND}<span>${bi(top.title)}</span></a>
<div class="lang" role="group" aria-label="Language / 言語"><button type="button" data-set-lang="en" aria-pressed="true" lang="en">English</button><button type="button" data-set-lang="ja" aria-pressed="false" lang="ja">日本語</button></div>
</header>
<div class="layout">
<nav class="toc" aria-label="${esc(UI.contents.en)}" data-label-en="${esc(UI.contents.en)}" data-label-ja="${esc(UI.contents.ja)}"><details open><summary><h2>${bi(UI.contents)}</h2></summary><ol>${toc}</ol></details></nav>
<main>
${body}
<footer class="foot"><p>${bi(UI.footer)} <a href="#top">${bi(UI.top)}</a></p></footer>
</main>
</div>
<dialog id="zoom"><div class="zhead"><span class="ztitle"></span><button type="button" class="zclose">${bi(UI.close)}</button></div><div class="zbody"></div></dialog>
<script type="application/json" id="subs">${subsJson}</script>
<script>
${JS}
</script>
</body>
</html>
`;
}

// ---- Check of the English text (ASD-STE100 with the project tool) ------------------------------------------------------------
/**
 * Other results of the check (docs/MANUAL.md gives all results):
 * - "without the names of the manual": tools/ste/technical-names.json has groups of names for the manual (the groups
 *   with "user manual" in the name and the names of licenses). This result counts a sentence with such a name as a
 *   sentence with a finding.
 * - "with the units": ASD-STE100 lets a text use the names of units of measurement. The narration says units in words
 *   ("kilometers per second"); this result does not count the word "per" (not approved) of these names.
 */
const LISTS = readJson(ROOT + 'tools/ste/technical-names.json');
const manualNames = LISTS.names.filter((g) => /user manual/.test(g.group) || g.group === 'Names of licenses').flatMap((g) =>
  g.items.map((i) => {
    const name = typeof i === 'string' ? i : i.name;
    const re = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + (g.plural === false ? '' : '(?:s|es)?');
    return { name, re: new RegExp(`(?<![\\w-])${re}(?![\\w-])`, g.case ? '' : 'i') };
  }));
const UNIT_WORDS = /\b(?:square )?(?:kilo)?meters per second(?: squared)?\b/;
const isUnit = (f, sentence) => UNIT_WORDS.test(sentence) && ((f.rule === 'not-approved' && f.word?.toLowerCase() === 'per') || (f.rule === 'unknown-word' && f.word?.toLowerCase() === 'squared'));

function lint(name, sentences) {
  mkdirSync(OUT + 'ste', { recursive: true });
  const keys = sentences.map((_, k) => `s${String(k + 1).padStart(3, '0')}`);
  const input = `tools/manual/.out/ste/${name}.json`, report = `tools/manual/.out/ste/${name}-report.json`;
  writeFileSync(ROOT + input, JSON.stringify({ text: Object.fromEntries(keys.map((k, i) => [k, sentences[i]])) }, null, 1) + '\n');
  const r = spawnSync(process.execPath, ['tools/ste/ste-lint.mjs', '--only', input, '--report', report], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0 && r.status !== 1) throw new Error('ste-lint did not operate:\n' + r.stdout + r.stderr);
  const findings = readJson(ROOT + report).files[0].findings;
  const bad = new Set(findings.map((f) => f.key));
  const sentenceOf = Object.fromEntries(keys.map((k, i) => [k, sentences[i]]));
  const badUnits = new Set(findings.filter((f) => !isUnit(f, sentenceOf[f.key])).map((f) => f.key));
  const named = new Set(keys.filter((k) => manualNames.some((n) => n.re.test(sentenceOf[k]))));
  const badStrict = new Set([...bad, ...named]);
  const all = sentences.length;
  return {
    all, ok: all - bad.size, pct: (100 * (all - bad.size) / all).toFixed(0),
    okWithoutManualNames: all - badStrict.size, pctWithoutManualNames: (100 * (all - badStrict.size) / all).toFixed(0),
    okWithUnits: all - badUnits.size, pctWithUnits: (100 * (all - badUnits.size) / all).toFixed(0),
    sentencesWithManualNames: [...named].map((k) => sentenceOf[k]),
    rules: findings.reduce((t, f) => ({ ...t, [f.rule]: (t[f.rule] ?? 0) + 1 }), {}),
    findings: keys.filter((k) => bad.has(k)).map((k) => ({ sentence: sentenceOf[k], findings: findings.filter((f) => f.key === k).map((f) => f.rule + (f.word ? ': ' + f.word : '')) })),
  };
}

// First pass: the texts with temporary numbers (a number does not change a finding), then the check, then the page.
Object.assign(V, { steOk: '0', steAll: '0', stePct: '0', steNarrOk: '0', steNarrAll: '0', steNarrPct: '0' });
steSentences = new Set();
render();
const pageResult = lint('manual-en', [...steSentences]);
steSentences = null;
const narration = new Set();
for (const v of VIDEOS) for (const c of subs[v].cues.en) for (const s of splitSentences(c.text.replace(/\n/g, ' '))) narration.add(s);
const narrResult = lint('narration-en', [...narration]);
Object.assign(V, {
  steOk: String(pageResult.ok), steAll: String(pageResult.all), stePct: pageResult.pct,
  steNarrOk: String(narrResult.ok), steNarrAll: String(narrResult.all), steNarrPct: narrResult.pct,
});
const html = render();
for (const bad of [/\bTODO\b/, /coming soon/i, /lorem ipsum/i, /\{\w+\}/, /\[\[|\]\]/, /\bundefined\b/, /\bNaN\b/]) {
  const m = bad.exec(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/, ''));
  if (m) throw new Error(`The page has "${m[0]}" near: ${html.slice(Math.max(0, m.index - 80), m.index + 80)}`);
}
writeFileSync(DEST + 'index.html', html);
made.add('index.html');
writeFileSync(OUT + 'ste/result.json', JSON.stringify({ page: pageResult, narration: narrResult, manualNames: manualNames.map((n) => n.name), unitWords: String(UNIT_WORDS) }, null, 1) + '\n');

// Files of an earlier run that this run did not make.
for (const dir of ['img', 'video']) for (const f of readdirSync(DEST + dir)) if (!made.has(`${dir}/${f}`)) rmSync(`${DEST}${dir}/${f}`);

const size = (f) => statSync(DEST + f).size;
const total = [...made].reduce((t, f) => t + size(f), 0);
console.log(`manual/index.html: ${(size('index.html') / 1e3).toFixed(0)} kB, ${made.size} files, ${(total / 1e6).toFixed(1)} MB in all.`);
for (const [name, r] of [['English text of the page', pageResult], ['Narration', narrResult]]) {
  console.log(`${name}: ${r.ok} of ${r.all} sentences with no finding (${r.pct} %); without the names of the manual: ${r.okWithoutManualNames} (${r.pctWithoutManualNames} %); with the units: ${r.okWithUnits} (${r.pctWithUnits} %).`);
}
console.log('Findings for each rule (page):', JSON.stringify(pageResult.rules));
console.log(`Word error rate of the narration: ${V.werPct} % (${werErrors} of ${werWords} words).`);

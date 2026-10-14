/**
 * Text of the user interface: all text is in the locale files, and each key that the code uses has a text.
 *
 * These checks read the source files. They do not check the language of the texts (see tools/ste).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BODIES } from '../src/engine/bodies';
import { FRAMES } from '../src/engine/frames';
import { FAMOUS } from '../src/engine/mission';
import { NOTE_CODES } from '../src/render/bodies';
import { EXPERT_PAGES } from '../src/app/router';
import { SPACECRAFT_KINDS } from '../src/app/spacecraftKinds';
import { MEASUREMENTS, describeMeasurement, measuredText } from '../src/app/provenance';
import { UNVERIFIED, LIMITS } from '../src/validation/lists';
import { hasText, t, tEnglish, craftName, LOCALES } from '../src/i18n';

const ROOT = new URL('..', import.meta.url).pathname;
const LOCALE_DIR = join(ROOT, 'src/i18n/locales/en');

function files(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...files(path, ext));
    else if (ext.some((e) => name.endsWith(e))) out.push(path);
  }
  return out.sort();
}

/** Keys of a locale object, with points. A key that has points in the file counts as nested objects. */
function flat(node: unknown, prefix: string, out: string[]): string[] {
  if (typeof node === 'string') { out.push(prefix); return out; }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) flat(v, prefix ? `${prefix}.${k}` : k, out);
    return out;
  }
  out.push(`${prefix} (not a text)`);
  return out;
}

const localeFiles = files(LOCALE_DIR, ['.json']).map((path) => ({ path, json: JSON.parse(readFileSync(path, 'utf8')) as { meta?: unknown; text?: unknown; glossary?: Record<string, { term?: unknown; definition?: unknown }> } }));
const keys = new Set<string>();
const prefixes = new Set<string>();
for (const f of localeFiles) for (const k of flat(f.json.text ?? {}, '', [])) {
  keys.add(k);
  const parts = k.split('.');
  for (let n = 1; n < parts.length; n++) prefixes.add(parts.slice(0, n).join('.'));
}
const namespaces = new Set([...keys].map((k) => k.split('.')[0]));
const sources = files(join(ROOT, 'src'), ['.ts', '.tsx']).filter((p) => !p.includes('/i18n/locales/'));
const rel = (path: string): string => path.slice(ROOT.length);

/** Directories of the other languages (this version: Japanese, "ja"). */
const LOCALES_DIR = join(ROOT, 'src/i18n/locales');
const otherLanguages = readdirSync(LOCALES_DIR).filter((d) => d !== 'en' && statSync(join(LOCALES_DIR, d)).isDirectory()).sort();
/** Keys that a language can have when the English files do not have them: its texts for data files and for names. */
const OWN_KEYS = /^(?:validation\.truth\.|validation\.item\.|about\.maps\.changeText\.|bodyIn\.|spacecraft\.)/;
/** Texts of a locale object by key. */
function texts(node: unknown, prefix: string, out: Map<string, string>): Map<string, string> {
  if (typeof node === 'string') out.set(prefix, node);
  else if (node && typeof node === 'object' && !Array.isArray(node)) for (const [k, v] of Object.entries(node)) texts(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}
/** Parts in braces of a text ("{name}"), which the code replaces. */
const braces = (s: string): string => [...new Set(s.match(/\{[A-Za-z0-9_]+\}/g) ?? [])].sort().join(' ');

describe('locale files', () => {
  it('has English, each language has a name, and each entry is a text', () => {
    expect(LOCALES.map((l) => l.code).sort()).toEqual(['en', ...otherLanguages].sort());
    expect(LOCALES.filter((l) => !l.name.trim() || l.name === l.code).map((l) => l.code)).toEqual([]);
    expect([...keys].filter((k) => k.endsWith('(not a text)'))).toEqual([]);
    expect(keys.size).toBeGreaterThan(1000);
  });

  it('has, in each other language, only keys of the English files, with the same parts in braces', () => {
    // A language does not have to give each text: a text that it does not have shows in English.
    const english = new Map<string, string>();
    for (const f of localeFiles) texts(f.json.text ?? {}, '', english);
    const bad: string[] = [];
    for (const code of otherLanguages) {
      for (const path of files(join(LOCALES_DIR, code), ['.json'])) {
        const part = JSON.parse(readFileSync(path, 'utf8')) as { text?: unknown };
        for (const [key, text] of texts(part.text ?? {}, '', new Map())) {
          const source = english.get(key);
          if (source === undefined) { if (!OWN_KEYS.test(key)) bad.push(`${rel(path)}: ${key} is not a key of the English files`); }
          else if (braces(text) !== braces(source)) bad.push(`${rel(path)}: ${key} has the parts "${braces(text)}", the English text has "${braces(source)}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('has, in Japanese, each English text and each glossary entry, in a file of the same name', () => {
    // The Japanese user interface is complete: a text that is only in English is an error of this version.
    // The English text stays in two keys only: the comments that the application writes into ASCII files (tEnglish).
    const JA = join(LOCALES_DIR, 'ja');
    expect(otherLanguages).toContain('ja');
    const missing: string[] = [];
    for (const f of localeFiles) {
      const name = f.path.slice(LOCALE_DIR.length + 1);
      const ja = JSON.parse(readFileSync(join(JA, name), 'utf8')) as { text?: unknown; glossary?: Record<string, { term?: unknown; definition?: unknown; sort?: unknown }> };
      const jaTexts = texts(ja.text ?? {}, '', new Map());
      for (const [key, english] of texts(f.json.text ?? {}, '', new Map())) {
        const text = jaTexts.get(key);
        if (text === undefined || !text.trim()) missing.push(`${name}: ${key}`);
        else if (text === english && !/^page\.files\.comment/.test(key) && /[a-z]{3,} [a-z]{3,}/.test(english)) missing.push(`${name}: ${key} is the English text`);
      }
      for (const id of Object.keys(f.json.glossary ?? {})) {
        const g = ja.glossary?.[id];
        if (!g || typeof g.term !== 'string' || typeof g.definition !== 'string' || typeof g.sort !== 'string' || !g.sort.trim()) missing.push(`${name}: glossary ${id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has, in Japanese, the reference of each measured value and the changes of each map', () => {
    // These English texts are in data files (the test files and public/textures/manifest.json). A language gives them
    // with its own keys (validation.truth.<id>, about.maps.changeText.<id>).
    const ja = new Map<string, string>();
    for (const path of files(join(LOCALES_DIR, 'ja'), ['.json'])) texts((JSON.parse(readFileSync(path, 'utf8')) as { text?: unknown }).text ?? {}, '', ja);
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/textures/manifest.json'), 'utf8')) as { textures: { id: string; changes?: string }[] };
    const missing = [
      ...MEASUREMENTS.filter((m) => !ja.get('validation.truth.' + m.id.replace(/\./g, '_'))?.trim()).map((m) => `measured value ${m.id}`),
      ...manifest.textures.filter((m) => m.changes && !ja.get('about.maps.changeText.' + m.id)?.trim()).map((m) => `map ${m.id}`),
    ];
    expect(missing).toEqual([]);
  });

  it('has no key in two files', () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const f of localeFiles) for (const k of flat(f.json.text ?? {}, '', [])) {
      if (seen.has(k)) twice.push(`${k}: ${rel(seen.get(k)!)} and ${rel(f.path)}`);
      seen.set(k, f.path);
    }
    const terms = new Map<string, string>();
    for (const f of localeFiles) for (const id of Object.keys(f.json.glossary ?? {})) {
      if (terms.has(id)) twice.push(`glossary ${id}: ${rel(terms.get(id)!)} and ${rel(f.path)}`);
      terms.set(id, f.path);
    }
    expect(twice).toEqual([]);
  });

  it('has a term and a definition for each glossary entry', () => {
    const bad: string[] = [];
    let n = 0;
    for (const f of localeFiles) for (const [id, g] of Object.entries(f.json.glossary ?? {})) {
      n += 1;
      if (typeof g.term !== 'string' || !g.term.trim() || typeof g.definition !== 'string' || !g.definition.trim()) bad.push(id);
    }
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThan(100);
  });
});

describe('keys that the code uses', () => {
  it('has a text for each key that is a fixed string in a call of t() or hasText()', () => {
    const missing: string[] = [];
    let n = 0;
    for (const path of sources) {
      const code = readFileSync(path, 'utf8');
      for (const m of code.matchAll(/\b(?:t|tEnglish|hasText)\(\s*(['"])([A-Za-z0-9_.-]+)\1\s*([,)+])/g)) {
        const [, , key, after] = m;
        n += 1;
        // "a.b." + x: the fixed part is a group of texts.
        if (after === '+' || key.endsWith('.')) { if (!prefixes.has(key.replace(/\.$/, ''))) missing.push(`${rel(path)}: ${key}*`); }
        else if (!keys.has(key)) missing.push(`${rel(path)}: ${key}`);
      }
      for (const m of code.matchAll(/\b(?:t|tEnglish|hasText)\(\s*`([A-Za-z0-9_.-]*)\$\{/g)) {
        n += 1;
        const group = m[1].replace(/\.[^.]*$/, '');
        if (m[1] && !prefixes.has(group) && !prefixes.has(m[1].replace(/\.$/, ''))) missing.push(`${rel(path)}: ${m[1]}*`);
      }
    }
    expect(missing).toEqual([]);
    expect(n).toBeGreaterThan(800);
  });

  it('has a text for each string in the code that has the form of a key', () => {
    // A key in a table (for example { label: 'page.transfer.title' }) goes to t() through a variable.
    const missing: string[] = [];
    for (const path of sources) {
      const code = readFileSync(path, 'utf8');
      for (const m of code.matchAll(/(['"])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_-]+)+)\1/g)) {
        const key = m[2];
        if (!namespaces.has(key.split('.')[0])) continue;
        // The type of the basis of a number ("plan.dv") is not a key: its texts are in the group "basis".
        if (prefixes.has('basis.' + key)) continue;
        if (!keys.has(key) && !prefixes.has(key)) missing.push(`${rel(path)}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has a name for each body', () => {
    // The form of a name in a sentence ("bodyIn") is only necessary for a name that gets an article.
    const ids = Object.keys(BODIES);
    expect(ids.length).toBeGreaterThan(40);
    expect(ids.filter((id) => !hasText(`body.${id}`))).toEqual([]);
    for (const id of ['SUN', 'EARTH', 'MOON']) expect(t(`bodyIn.${id}`)).toMatch(/^the /);
  });

  it('has a text for each note about the picture of a body', () => {
    expect(NOTE_CODES.length).toBeGreaterThan(20);
    expect(NOTE_CODES.filter((code) => !hasText(`picture.note.${code}`))).toEqual([]);
    expect(t('picture.note.' + NOTE_CODES[0])).not.toContain('picture.note.');
  });

  it('has a text for each role of a map in the list of the maps', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/textures/manifest.json'), 'utf8')) as { textures: { role: string }[] };
    const roles = [...new Set(manifest.textures.map((m) => m.role))];
    expect(roles.length).toBeGreaterThan(3);
    expect(roles.filter((r) => !hasText(`about.maps.role.${r}`))).toEqual([]);
  });
});

describe('keys that the code makes at run time', () => {
  it('has a text for each value of the lists of the engine and of the screens', () => {
    const need = [
      ...FRAMES.flatMap((f) => [`frame.${f}`, `frameLong.${f}`]),
      ...EXPERT_PAGES.flatMap((p) => [`nav.${p}`, `page.${p}.title`, `page.${p}.intro`]),
      ...SPACECRAFT_KINDS.map((k) => `spacecraftKind.${k}`),
      ...FAMOUS.flatMap((f) => [`explorer.famous.story.${f.id}`, `spacecraft.${f.id}`]),
      // The reasons of Trajectory.failure (src/engine/propagate.ts).
      ...['inside-body', 'not-finite', 'step-limit'].map((r) => `page.mission.failure.${r}`),
      ...[...new Set(MEASUREMENTS.map((m) => m.group))].map((g) => `validation.group.${g}`),
    ];
    expect(need.length).toBeGreaterThan(60);
    expect(need.filter((k) => !hasText(k))).toEqual([]);
  });

  it('gives the English text for the files for other programs', () => {
    expect(tEnglish('page.files.comment', { app: tEnglish('app.name'), version: '1', name: 'A' })).toBe('File of Apsis 1. Mission: A.');
    expect(tEnglish('not.a.key')).toBe('not.a.key');
    // The comments of a file must have only ASCII characters.
    for (const key of ['page.files.comment', 'page.files.commentModel', 'app.name']) expect(tEnglish(key)).toMatch(/^[\x20-\x7e]+$/);
  });

  it('shows the name of an actual spacecraft from the texts of the language', () => {
    for (const f of FAMOUS) expect(craftName(f.id, '?')).toBe(t(`spacecraft.${f.id}`));
    expect(craftName('not-a-spacecraft', 'Name')).toBe('Name');
  });

  it('has a description and a unit for each measured value of the Accuracy screen', () => {
    expect(MEASUREMENTS.length).toBeGreaterThan(200);
    expect(MEASUREMENTS.filter((m) => { const s = describeMeasurement(m); return s === m.id || s.includes('validation.item.') || /\{[a-z]+\}/i.test(s); }).map((m) => m.id)).toEqual([]);
    expect(MEASUREMENTS.filter((m) => m.unit && !hasText('validation.unit.' + m.unit) && !/^(km|km\/s|m\/s|mm\/s|m|s|ms|%|deg|d|h|rad|au)$/.test(measuredText(m).unit)).map((m) => `${m.id}: ${m.unit}`)).toEqual([]);
    expect(MEASUREMENTS.filter((m) => !m.truth || m.truth.length < 12).map((m) => m.id)).toEqual([]);
  });

  it('has a title and a text for each item with no check and for each limit of the Accuracy screen', () => {
    const unverified: string[] = [...UNVERIFIED], limits: string[] = [...LIMITS];
    expect(unverified.length).toBeGreaterThan(5);
    expect(limits.length).toBeGreaterThan(5);
    const need = [...unverified.flatMap((id) => [`validation.unverified.${id}.title`, `validation.unverified.${id}.text`]), ...limits.flatMap((id) => [`validation.limits.${id}.title`, `validation.limits.${id}.text`])];
    expect(need.filter((k) => !hasText(k))).toEqual([]);
    // Each item of the locale files is on the screen.
    const inLocale = (group: string): string[] => [...new Set([...keys].filter((k) => k.startsWith(`validation.${group}.`)).map((k) => k.split('.')[2]))];
    expect(inLocale('unverified').filter((id) => !unverified.includes(id))).toEqual([]);
    expect(inLocale('limits').filter((id) => !limits.includes(id))).toEqual([]);
  });
});

describe('text in the code', () => {
  // Parts of a screen that are not words of a language: symbols, units, names of the time scales and of the frames.
  const SYMBOLS = /^(?:UTC|TDB|TT|TAI|ICRF|km|km\/s|m\/s|km²|s²|km³|au|kg|deg|rad|B·T|B·R|Δv|C3|v∞|×|·|→|°|%|s|d|h|min|N|m|x|y|z|vx|vy|vz|a|e|i|Ω|ω|ν|M|GM|J2|px)$/;
  const isText = (s: string): boolean => {
    const words = s.replace(/&[a-z]+;/g, ' ').split(/[\s,;:()[\]/|+=<>-]+/).filter(Boolean);
    return words.some((w) => /[A-Za-z]{2,}/.test(w) && !SYMBOLS.test(w));
  };

  /** Words in the text of the elements of a line: after the ">" of a tag, before the next "<" or "{". */
  const elementText = (line: string): string[] => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return [];
    const out: string[] = [];
    for (const m of line.matchAll(/(?<=[A-Za-z0-9"'}\s/])>([^<>{}]+)(?=<|\{|$)/g)) {
      const s = m[1].trim();
      // "a > b" in an expression is code, not text: text has no operators and is not only a number.
      if (!s || /[=;()&|?:]/.test(s) || /^[\d.\s-]+$/.test(s)) continue;
      if (isText(s)) out.push(s);
    }
    return out;
  };
  /** Words in the attributes of a line that a user reads or hears. */
  const attributeText = (line: string): string[] => {
    const out: string[] = [];
    for (const m of line.matchAll(/\b(aria-label|title|placeholder|alt|label|aria-description)=(["'])([^"']*)\2/g)) if (isText(m[3])) out.push(`${m[1]}="${m[3]}"`);
    return out;
  };
  const scan = (find: (line: string) => string[]): string[] => {
    const found: string[] = [];
    for (const path of sources.filter((p) => p.endsWith('.tsx'))) {
      readFileSync(path, 'utf8').split('\n').forEach((line, k) => { for (const s of find(line)) found.push(`${rel(path)}:${k + 1}: ${s}`); });
    }
    return found;
  };

  it('finds words in example lines (a check of the two checks below)', () => {
    expect(elementText('      <b>Start the flight</b>')).toEqual(['Start the flight']);
    expect(elementText('      <dd>{value}<span className="unit">Speed now</span></dd>')).toEqual(['Speed now']);
    expect(elementText('      <span className="unit">km/s</span><span>UTC</span><b>{t(\'a.b\')}</b>')).toEqual([]);
    expect(elementText('      {a > b ? x : y}')).toEqual([]);
    expect(attributeText('      <button aria-label="Close the page" title={t(\'a.b\')}>')).toEqual(['aria-label="Close the page"']);
    expect(attributeText('      <input placeholder="km" />')).toEqual([]);
  });

  it('has no words between the tags of the screens', () => {
    expect(scan(elementText)).toEqual([]);
    // Text of an element that is alone on a line.
    expect(scan((line) => (/^\s+[A-Z][A-Za-z]*(?: [A-Za-z,.'-]+)+[.!?:]?\s*$/.test(line) ? [line.trim()] : []))).toEqual([]);
  });

  it('has no words in the text attributes of the screens', () => {
    expect(scan(attributeText)).toEqual([]);
  });
});

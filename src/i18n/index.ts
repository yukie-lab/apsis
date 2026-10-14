/**
 * Text of the user interface.
 *
 * Each language is one directory in ./locales (for example ./locales/en). The JSON files of the directory are
 * merged: one file has the "meta" entry (code and name of the language), each file can have "text" and "glossary"
 * entries. The application finds the files at build time: a new language is a new directory, with no change to
 * the code. The language switch shows when there is more than one language.
 * A text can contain {name} parts that the caller replaces.
 */
import { useSyncExternalStore } from 'react';

export interface LocaleFile {
  meta: { code: string; name: string };
  text: Record<string, unknown>;
  /**
   * Technical names and their definitions (also the glossary screen). "sort" is the text for the alphabetical order
   * when the term does not give it (for example the reading of a Japanese term in hiragana).
   */
  glossary: Record<string, { term: string; definition: string; sort?: string }>;
}
type Part = Partial<LocaleFile>;

/** Deep merge. A key with points ("plan.c3") is the same as nested objects ({ plan: { c3 } }). */
function merge(into: Record<string, unknown>, from: Record<string, unknown>): void {
  for (const [key, v] of Object.entries(from)) {
    const path = key.split('.');
    let node = into;
    for (const part of path.slice(0, -1)) {
      const next = node[part];
      if (next && typeof next === 'object') node = next as Record<string, unknown>;
      else { const made: Record<string, unknown> = {}; node[part] = made; node = made; }
    }
    const k = path[path.length - 1];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const old = node[k];
      const target: Record<string, unknown> = old && typeof old === 'object' ? (old as Record<string, unknown>) : {};
      node[k] = target;
      merge(target, v as Record<string, unknown>);
    } else node[k] = v;
  }
}

const modules = import.meta.glob('./locales/*/*.json', { eager: true }) as Record<string, { default: Part }>;
const table = new Map<string, LocaleFile>();
for (const path of Object.keys(modules).sort()) {
  const dir = path.split('/')[2];
  const part = modules[path].default;
  let file = table.get(dir);
  if (!file) { file = { meta: { code: dir, name: dir }, text: {}, glossary: {} }; table.set(dir, file); }
  if (part.meta) file.meta = { ...part.meta, code: dir };
  if (part.text) merge(file.text, part.text);
  if (part.glossary) Object.assign(file.glossary, part.glossary);
}

export const LOCALES: { code: string; name: string }[] = [...table.values()].map((f) => f.meta).sort((a, b) => a.code.localeCompare(b.code));
const FALLBACK = table.has('en') ? 'en' : LOCALES[0].code;

const STORAGE_KEY = 'apsis.locale';
/**
 * The language at the start: the language that the user selected before; else the first language of the browser
 * that the application has; else English.
 */
function initial(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && table.has(saved)) return saved;
  } catch { /* storage is not available: use the language of the browser */ }
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const tag of tags) {
      const code = (tag ?? '').toLowerCase().split('-')[0];
      if (table.has(code)) return code;
    }
  }
  return FALLBACK;
}
let current = initial();
const listeners = new Set<() => void>();

export function getLocale(): string { return current; }
export function setLocale(code: string): void {
  if (!table.has(code) || code === current) return;
  current = code;
  try { localStorage.setItem(STORAGE_KEY, code); } catch { /* not saved */ }
  document.documentElement.lang = code;
  listeners.forEach((f) => f());
}
/** Makes a component draw again when the language changes. Returns the language code. */
export function useLocale(): string {
  return useSyncExternalStore((f) => { listeners.add(f); return () => listeners.delete(f); }, getLocale);
}

function lookup(file: LocaleFile | undefined, key: string): string | undefined {
  let node: unknown = file?.text;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  let s = text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
/** Text for a key. Missing in the current language: the fallback language. Missing in the two: the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  return fill(lookup(table.get(current), key) ?? lookup(table.get(FALLBACK), key) ?? key, vars);
}
/**
 * Text for a key in English (the fallback language), for all languages of the user interface.
 * Use: the comments in the files for other programs. These files contain only ASCII characters.
 */
export function tEnglish(key: string, vars?: Record<string, string | number>): string {
  return fill(lookup(table.get(FALLBACK), key) ?? key, vars);
}
/**
 * Sentences in one paragraph. A space comes after a sentence that ends with a Latin character ("."), and no space
 * after a sentence that ends with a Japanese character ("。"). Empty parts and false are not in the result.
 */
export function sentences(...parts: (string | false | null | undefined)[]): string {
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    out += out && /[\x21-\x7e]$/.test(out) ? ' ' + part : part;
  }
  return out;
}
/** True if a key has a text. */
export function hasText(key: string): boolean {
  return lookup(table.get(current), key) !== undefined || lookup(table.get(FALLBACK), key) !== undefined;
}
const customNames = new Map<string, string>();
/** Give the name of a body that the user made (null: remove the name). */
export function registerBodyName(id: string, name: string | null): void {
  if (name === null) customNames.delete(id); else customNames.set(id, name);
}
/** Name of a body. A body of the user has the name that the user gave. */
export function bodyName(id: string): string {
  return hasText(`body.${id}`) ? t(`body.${id}`) : customNames.get(id) ?? id;
}
/** Name of a body in a sentence. A language with articles gives the article in the "bodyIn" texts ("the Sun"). */
export function bodyIn(id: string): string {
  return hasText(`bodyIn.${id}`) ? t(`bodyIn.${id}`) : bodyName(id);
}
/** Name of an actual spacecraft or mission. A language can give its own form of the name ("spacecraft" texts). */
export function craftName(id: string, fallback: string = id): string {
  return hasText(`spacecraft.${id}`) ? t(`spacecraft.${id}`) : fallback;
}
/** Glossary of the current language, in the alphabetical order of that language. */
export function glossary(): { id: string; term: string; definition: string; sort?: string }[] {
  const g = (table.get(current) ?? table.get(FALLBACK))!.glossary;
  const code = table.has(current) ? current : FALLBACK;
  return Object.entries(g).map(([id, v]) => ({ id, ...v })).sort((a, b) => (a.sort ?? a.term).localeCompare(b.sort ?? b.term, code));
}

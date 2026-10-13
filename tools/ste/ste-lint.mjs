#!/usr/bin/env node
// ste-lint: a check of the English text of Apsis for the rules of ASD-STE100 (Simplified Technical English).
//
// IMPORTANT: the official ASD-STE100 dictionary was not available. The word lists in this directory are
// project lists. The tool makes sure that each word of a text is in one of these lists (a closed vocabulary)
// and it does the checks of the writing rules that a script can do. docs/STE_CHECK.md gives the checks and
// their limits. A result with no findings does not show that a text obeys ASD-STE100.
//
// Use (from the project directory):
//   node tools/ste/ste-lint.mjs                  the locale files, the files of measured values and docs/*.md
//   node tools/ste/ste-lint.mjs docs/A.md ...    the locale files and the given Markdown documents
//   node tools/ste/ste-lint.mjs --locales        only the locale files
//   node tools/ste/ste-lint.mjs --only <files>   only the given files (Markdown documents or locale JSON files)
// A file of measured values (src/validation/measured/*.json) has the reference text "truth" of each row. The
// application shows these texts on the Accuracy screen. The full check examines them.
// Options:
//   --all          show also the findings that have an exception
//   --summary      show only the table of counts
//   --words        show the distinct words with their class (no check of the rules)
//   --unused       show the entries of the lists that the texts of this check do not use
//   --report <f>   write the JSON report to the file <f>
//   --no-report    write no JSON report
// The full check (no --locales, no --only, no document names) writes tools/ste/report.json.
// Exit code: 0 = no open finding. 1 = open findings or stale exceptions. 2 = the tool cannot read its lists.
//
// Lists (all in tools/ste/):
//   approved-words.txt     general words that the project approves, with their part of speech
//   not-approved.json      words that are not approved, with the alternative; American spelling
//   technical-names.json   technical names and technical verbs that are not glossary entries, with a category
//   exceptions.json        findings that stay, each with a written reason
// The tool also reads the glossary of the locale files: each glossary term is a technical name. A glossary
// entry with a definition that starts with "To " is a technical verb.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative, dirname, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const LOCALE_DIR = 'src/i18n/locales/en';
const DOCS_DIR = 'docs';
const MEASURED_DIR = 'src/validation/measured';
const DEFAULT_REPORT = 'tools/ste/report.json';

// Limits of the writing rules.
const MAX_WORDS_PROCEDURE = 20;
const MAX_WORDS_DESCRIPTION = 25;
const MAX_SENTENCES_PARAGRAPH = 6;
const MAX_NOUN_CLUSTER = 3;

// ---------------------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------------------
const opt = { locales: false, only: false, all: false, summary: false, words: false, unused: false, report: undefined, noReport: false, files: [] };
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--locales') opt.locales = true;
    else if (a === '--only') opt.only = true;
    else if (a === '--all') opt.all = true;
    else if (a === '--summary') opt.summary = true;
    else if (a === '--words') opt.words = true;
    else if (a === '--unused') opt.unused = true;
    else if (a === '--no-report') opt.noReport = true;
    else if (a === '--report') opt.report = argv[++i];
    else if (a === '--help' || a === '-h') { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 32).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
    else if (a.startsWith('--')) stop(`Unknown option: ${a}`);
    else opt.files.push(a);
  }
  if (opt.only && !opt.files.length) stop('--only: give one or more files.');
  if (opt.locales && (opt.only || opt.files.length)) stop('--locales: do not give files with this option.');
}

function stop(message) { console.error('ste-lint: ' + message); process.exit(2); }
const toRel = (p) => relative(ROOT, isAbsolute(p) ? p : resolve(process.cwd(), p)).split(sep).join('/');
const readJson = (relPath) => {
  let text;
  try { text = readFileSync(join(ROOT, relPath), 'utf8'); } catch { stop(`Cannot read ${relPath}.`); }
  try { return JSON.parse(text); } catch (e) { stop(`${relPath} is not correct JSON: ${e.message}`); }
};

// ---------------------------------------------------------------------------------------------------------
// Word forms
// ---------------------------------------------------------------------------------------------------------
const pluralOf = (w) => (/(s|x|z|ch|sh)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
const pastOf = (w) => (/e$/.test(w) ? w + 'd' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ied' : w + 'ed');
const ingOf = (w) => (/ie$/.test(w) ? w.slice(0, -2) + 'ying' : /[^e]e$/.test(w) ? w.slice(0, -1) + 'ing' : w + 'ing');
const IRREGULAR_SINGULAR = new Map(Object.entries({ axes: 'axis', radii: 'radius', matrices: 'matrix', indices: 'index', analyses: 'analysis', apsides: 'apsis', ephemerides: 'ephemeris', hyperbolae: 'hyperbola', formulae: 'formula', periapses: 'periapsis', apoapses: 'apoapsis' }));
/** Singular of a plural (used to compare the last word of a technical name). */
const singularOf = (w) => {
  if (IRREGULAR_SINGULAR.has(w)) return IRREGULAR_SINGULAR.get(w);
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
  if (/(ches|shes|xes|sses|zes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w) && w.length > 2) return w.slice(0, -1);
  return w;
};

const BE = new Set(['be', 'am', 'is', 'are', 'was', 'were', 'been', 'being']);
const HAVE = new Set(['have', 'has', 'had', 'having']);
const DO = new Set(['do', 'does', 'did']);
const MODAL_OK = new Set(['can', 'cannot', 'must', 'will']);
// Modal verbs that STE does not approve (the alternative comes from not-approved.json).
const MODAL_BAD = new Set(['should', 'may', 'might', 'could', 'would', 'shall', 'ought']);
const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'all', 'no', 'some', 'its', 'their', 'your', 'our', 'one', 'other', 'more', 'most', 'many']);
const OBJECT_PRONOUNS = new Set(['it', 'them', 'you']);
const SUBJECT_PLURAL = new Set(['you', 'we', 'they']);
const SUBJECT_SINGULAR = new Set(['it', 'he', 'she']);
const CLAUSE_STARTS = new Set(['if', 'when', 'to', 'before', 'after', 'for', 'then', 'with', 'until', 'where', 'while', 'in', 'on', 'at']);
// Irregular past participles: for the checks of the passive voice and of the perfect tenses in all texts.
const IRREGULAR_PP = new Set(('been done gone given taken made shown known seen written found kept held sent read set put cut let got gotten become '
  + 'come run begun broken chosen driven fallen flown grown hidden risen spoken thought told understood lost left meant met paid said sold built '
  + 'bought brought caught felt heard led lit shut hit hurt worn won drawn thrown withdrawn bound stuck struck sunk swept torn spent split spread '
  + 'frozen forgotten proven beaten bent dealt fed fought hung laid lent rewritten overwritten undone fit').split(' '));
// Participles that cannot be a base form or a simple past: they are always participles.
const ALWAYS_PP = new Set('been done gone given taken shown known seen written begun broken chosen driven fallen flown grown hidden risen spoken drawn thrown torn frozen forgotten proven beaten worn'.split(' '));
const NOT_PARTICIPLE = new Set(['need', 'speed', 'feed', 'seed', 'red', 'bed', 'hundred', 'indeed', 'exceed', 'proceed', 'embed', 'shed', 'succeed', 'bleed']);
const NOT_ING = new Set(['thing', 'nothing', 'something', 'anything', 'everything', 'bring', 'ring', 'king', 'sing', 'wing', 'sling', 'swing', 'string', 'spring', 'sting', 'cling', 'fling', 'wring']);
const CONTRACTION = /(n['’]t|['’](re|ve|ll|d|m))$|^(it|that|there|here|what|who|let|he|she|how|where)['’]s$/i;
// Latin abbreviations (the scanner cannot read them as words).
const LATIN = [
  [/(^|[\s(])e\.\s?g\.(?=[\s,:)]|$)/i, 'e.g.', '"for example"'],
  [/(^|[\s(])i\.\s?e\.(?=[\s,:)]|$)/i, 'i.e.', '"that is", or write a second sentence'],
  [/(^|[\s(,])etc\.?(?=[\s,:)]|$)/i, 'etc.', 'give all the items, or write "and other ..."'],
  [/(^|[\s(])(vs\.?|cf\.|viz\.|ca\.)(?=[\s,:)]|$)/i, 'vs., cf., viz., ca.', 'full English words'],
];
// Prefixes: a prefix with a hyphen is not a word of its own in the word count.
const PREFIXES = new Set(['semi', 'non', 'pre', 'post', 're', 'co', 'sub', 'anti', 'multi', 'mid', 'micro', 'self', 'un', 'inter', 'intra', 'quasi', 'pseudo']);

// ---------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------
const POS = new Set(['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'art']);

function loadApproved() {
  const relPath = 'tools/ste/approved-words.txt';
  let text;
  try { text = readFileSync(join(ROOT, relPath), 'utf8'); } catch { stop(`Cannot read ${relPath}.`); }
  const forms = new Map(); // lower-case form -> [{ entry, role }]
  const entries = [];
  const addForm = (form, entry, role) => {
    const list = forms.get(form) ?? [];
    if (!list.some((x) => x.entry === entry && x.role === role)) list.push({ entry, role });
    forms.set(form, list);
  };
  text.split('\n').forEach((raw, k) => {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    if (!line) return;
    const f = line.split(/\s+/);
    let word = f[0].toLowerCase();
    const uncertain = word.startsWith('?');
    if (uncertain) word = word.slice(1);
    const pos = (f[1] ?? '').split(',').filter(Boolean);
    if (!word || !pos.length || pos.some((p) => !POS.has(p))) stop(`${relPath}, line ${k + 1}: the line must have a word and its parts of speech (${[...POS].join(', ')}).`);
    if (entries.some((e) => e.word === word)) stop(`${relPath}, line ${k + 1}: "${word}" is in the list two times.`);
    const extra = f.slice(2).map((x) => x.toLowerCase());
    const entry = { word, pos, uncertain, line: k + 1 };
    entries.push(entry);
    addForm(word, entry, 'base');
    const has = (p) => pos.includes(p);
    if (extra.length === 1 && extra[0] === '-') return; // no other forms
    if (word === 'be') { for (const x of extra) addForm(x, entry, 'be'); return; }
    if (extra.length) {
      if (has('v')) {
        const [third, past, pp, ...rest] = extra;
        addForm(third, entry, 'third');
        if (has('n')) addForm(third, entry, 'plural');
        if (past) { addForm(past, entry, 'past'); addForm(pp ?? past, entry, 'pp'); }
        for (const x of rest) addForm(x, entry, 'other');
      } else if (has('n')) { for (const x of extra) addForm(x, entry, 'plural'); }
      else if (has('adj') || has('adv')) { addForm(extra[0], entry, 'comp'); if (extra[1]) addForm(extra[1], entry, 'sup'); for (const x of extra.slice(2)) addForm(x, entry, 'other'); }
      else for (const x of extra) addForm(x, entry, 'other');
    } else {
      if (has('n')) addForm(pluralOf(word), entry, 'plural');
      if (has('v')) { addForm(pluralOf(word), entry, 'third'); addForm(pastOf(word), entry, 'past'); addForm(pastOf(word), entry, 'pp'); }
    }
  });
  return { forms, entries };
}

function loadNotApproved() {
  const relPath = 'tools/ste/not-approved.json';
  const data = readJson(relPath);
  const forms = new Map(); // lower-case form -> { word, use, pos, role }
  const add = (form, word, v, role) => { if (!forms.has(form)) forms.set(form, { word, use: v.use, pos: v.pos, role }); };
  for (const [word, v] of Object.entries(data.words ?? {})) {
    if (!v || typeof v.use !== 'string') stop(`${relPath}: "${word}" has no "use" text.`);
    const w = word.toLowerCase();
    add(w, w, v, 'base');
    if (Array.isArray(v.forms)) { for (const x of v.forms) add(x.toLowerCase(), w, v, 'form'); }
    else if (v.forms !== false && /^[a-z]+$/.test(w)) {
      add(pluralOf(w), w, v, 's');
      if (v.kind !== 'n' && v.kind !== 'other') { add(pastOf(w), w, v, 'ed'); add(ingOf(w), w, v, 'ing'); }
    }
  }
  const phrases = Object.entries(data.phrases ?? {}).map(([phrase, v]) => ({ words: phrase.toLowerCase().split(/\s+/), phrase, use: v.use }));
  const spelling = new Map(Object.entries(data.spelling ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return { forms, phrases, spelling, count: Object.keys(data.words ?? {}).length + phrases.length, spellingCount: spelling.size };
}

/** Glossary entries of the locale files: { id, term, definition, file }. */
function loadGlossary() {
  const out = [];
  for (const name of readdirSync(join(ROOT, LOCALE_DIR)).filter((f) => f.endsWith('.json')).sort()) {
    const data = readJson(`${LOCALE_DIR}/${name}`);
    for (const [id, v] of Object.entries(data.glossary ?? {})) {
      if (!v || typeof v.term !== 'string' || typeof v.definition !== 'string') stop(`${LOCALE_DIR}/${name}: the glossary entry "${id}" must have a term and a definition.`);
      out.push({ id, term: v.term, definition: v.definition, file: `${LOCALE_DIR}/${name}` });
    }
  }
  return out;
}

function loadTechnical(glossary) {
  const relPath = 'tools/ste/technical-names.json';
  const data = readJson(relPath);
  const categories = data.categories ?? {};
  const tn = {
    exact: new Map(),    // case-sensitive single names
    lower: new Map(),    // single names, lower case
    phrases: new Map(),  // first word (lower case) -> [{ words, info }]
    literals: new Set(), // names with characters that are not letters, digits or hyphens: one text chunk
    verbs: new Map(),    // lower-case form -> { verb, role, info }
    symbols: new Set(),
    extensions: new Set(),
    patterns: [],        // identifiers with a constant form: { re, info }
    count: 0, verbCount: 0, glossaryCount: glossary.length, pending: [],
    all: [],             // one info object for each entry of the lists (for the option --unused)
  };
  const plain = /^[\p{L}\p{N}]+(?:[-‑][\p{L}\p{N}]+)*$/u;
  const addName = (name, info, options) => {
    tn.count++;
    if (/\s/.test(name)) { tn.pending.push({ name, info, options }); return; }
    if (!plain.test(name)) { tn.literals.add(name); tn.exact.set(name, info); return; }
    if (options.case) tn.exact.set(name, info);
    else {
      const low = name.toLowerCase();
      if (!tn.lower.has(low)) tn.lower.set(low, { ...info, plural: options.plural });
      if (options.pluralForm) tn.lower.set(options.pluralForm.toLowerCase(), { ...info, plural: false });
    }
  };
  const addVerb = (verb, info, forms) => {
    tn.verbCount++;
    const v = verb.toLowerCase();
    const [third, past, pp] = forms ?? [pluralOf(v), pastOf(v), pastOf(v)];
    tn.verbs.set(v, { verb: v, role: 'base', info });
    tn.verbs.set(third, { verb: v, role: 'third', info });
    // The simple past and the past participle can have the same form: the tool keeps the two roles.
    if (past) tn.verbs.set(past, { verb: v, role: (pp ?? past) === past ? 'past-pp' : 'past', info });
    if (pp && pp !== past) tn.verbs.set(pp, { verb: v, role: 'pp', info });
  };
  for (const group of data.names ?? []) {
    if (!categories[group.category]) stop(`${relPath}: the group "${group.group}" has the category "${group.category}", which is not in "categories".`);
    for (const item of group.items ?? []) {
      const name = typeof item === 'string' ? item : item.name;
      const info = { name, category: group.category, group: group.group, pos: (typeof item === 'object' && item.pos) || group.pos || 'n', source: 'technical-names.json', see: typeof item === 'object' ? item.see : undefined, unit: group.unit === true };
      if (info.see && !glossary.some((g) => g.id === info.see)) stop(`${relPath}: "${name}" refers to the glossary entry "${info.see}", which is not in the glossary.`);
      if (group.kind === 'symbol') { tn.symbols.add(name); tn.count++; tn.all.push({ ...info, symbol: true }); continue; }
      if (group.kind === 'extension') { tn.extensions.add(name.replace(/^\./, '').toLowerCase()); tn.count++; if (name.startsWith('.')) { tn.literals.add(name); tn.exact.set(name, info); } continue; }
      tn.all.push(info);
      addName(name, info, { case: group.case === true, plural: group.plural !== false && info.pos === 'n', pluralForm: typeof item === 'object' ? item.plural : undefined });
    }
  }
  for (const group of data.verbs ?? []) {
    if (!categories[group.category]) stop(`${relPath}: the verb group "${group.group}" has the category "${group.category}", which is not in "categories".`);
    for (const item of group.items ?? []) {
      const verb = typeof item === 'string' ? item : item.verb;
      const info = { name: verb, category: group.category, group: group.group, pos: 'v', source: 'technical-names.json', alsoNoun: typeof item === 'object' && item.noun === true };
      tn.all.push(info);
      addVerb(verb, info, typeof item === 'object' ? item.forms : undefined);
    }
  }
  for (const p of data.patterns ?? []) {
    if (!categories[p.category]) stop(`${relPath}: the pattern "${p.pattern}" has the category "${p.category}", which is not in "categories".`);
    let re;
    try { re = new RegExp(p.pattern); } catch (e) { stop(`${relPath}: the pattern "${p.pattern}" is not a correct regular expression: ${e.message}`); }
    if (p.example && !re.test(p.example)) stop(`${relPath}: the pattern "${p.pattern}" does not agree with its example "${p.example}".`);
    const info = { name: p.pattern, category: p.category, group: p.group, pos: 'n', source: 'technical-names.json' };
    tn.all.push(info);
    tn.patterns.push({ re, info });
    tn.count++;
  }
  // Glossary terms. "Name (ABBR)" gives two names. A definition that starts with "To " is the definition of a verb.
  for (const g of glossary) {
    const info = { name: g.term, category: 'glossary', group: 'Glossary', pos: 'n', source: g.file, id: g.id };
    tn.all.push(info);
    const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(g.term);
    const names = m ? [m[1], m[2]] : [g.term];
    if (/^To\s/.test(g.definition) && names.length === 1 && plain.test(names[0])) { addVerb(names[0], { ...info, pos: 'v' }); continue; }
    names.forEach((name, k) => {
      const isShort = k === 1 || (plain.test(name) && name === name.toUpperCase() && /[A-Z]/.test(name));
      addName(name, info, { case: isShort && !plain.test(name), plural: true });
    });
  }
  return tn;
}

function loadExceptions() {
  const relPath = 'tools/ste/exceptions.json';
  if (!existsSync(join(ROOT, relPath))) return [];
  const data = readJson(relPath);
  return (data.exceptions ?? []).map((e, k) => {
    if (!e.file || !e.rule || !e.reason || (!e.key && !e.text)) stop(`${relPath}: exception ${k + 1} must have "file", "rule", "reason" and "key" or "text".`);
    return { ...e, used: 0 };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Scanner: text -> tokens
//   w    word (a hyphenated word is one word)       num   number, date or identifier
//   ph   placeholder {name}                          code  inline code, file name, path or address
//   name technical name with special characters     sym   symbol
//   p    punctuation
// ---------------------------------------------------------------------------------------------------------
const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺';
const RE_PH_ONLY = /^\{[A-Za-z_][A-Za-z0-9_]*\}$/;
const RE_SENTINEL_ONLY = /^\uE000\d+\uE001$/;
const RE_SPLIT_ATOMS = /(\{[A-Za-z_][A-Za-z0-9_]*\}|\uE000\d+\uE001)/;
const RE_NUM = new RegExp(`^[+\\-−±]?\\d[\\d.]*(?:[eE][+\\-−]?\\d+)?[${SUPERSCRIPT}]*$`);
const RE_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?$/;
const RE_TIME = /^\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const RE_NUM_ID = /^\d+(?:[.\-]\d+)+[a-z]?$/;
const RE_WORD = /^[\p{L}\p{N}_'’‑-]+$/u;
const LEAD = new Set(['(', '[', '"', '“', '‘', "'"]);
const TRAIL = new Set([')', ']', '"', '”', '’', "'", ',', '.', ':', ';', '!', '?', '…']);
const DASHES = new Set(['–', '—']);

function scan(text, L) {
  const toks = [];
  const push = (t, s, at, extra) => { const tok = { t, s, at, ...extra }; toks.push(tok); return tok; };
  // A name of the lists has priority over a pattern (J2 is a glossary term, not an identifier).
  const isPattern = (s) => !L.tn.exact.has(s) && !L.tn.lower.has(s.toLowerCase()) && L.tn.patterns.some((p) => p.re.test(s));
  const isAtom = (s) => L.tn.literals.has(s) || RE_PH_ONLY.test(s) || RE_SENTINEL_ONLY.test(s) || isPattern(s);
  const isFileName = (s) => { const m = /^[\w.\-*]{1,80}\.([A-Za-z0-9]{1,5})$/.exec(s); return !!m && L.tn.extensions.has(m[1].toLowerCase()) && /[A-Za-z0-9]/.test(s[0]); };
  const isPath = (s) => /^(?:~|\.{1,2})?\/?(?:[\w.\-*]+\/)+[\w.\-*]*$/.test(s) && (/^[~.]/.test(s) || s.endsWith('/') || isFileName(s.split('/').pop()) || /^(src|docs|tools|tests|public|truth|data-src|shots|scratch|dev)\//.test(s));
  const isUrl = (s) => /^(?:https?:\/\/|www\.)\S+$/.test(s);

  const core = (s, a) => {
    if (!s) return;
    if (L.tn.literals.has(s) || isPattern(s)) { push('name', s, a); return; }
    if (RE_PH_ONLY.test(s)) { push('ph', s, a); return; }
    if (RE_SENTINEL_ONLY.test(s)) { push('code', s, a); return; }
    if (RE_SPLIT_ATOMS.test(s)) { let p = a; for (const piece of s.split(RE_SPLIT_ATOMS)) { core(piece, p); p += piece.length; } return; }
    if (isUrl(s) || isPath(s) || isFileName(s)) { push('code', s, a, { ref: true }); return; }
    if (RE_DATE.test(s) || RE_TIME.test(s) || RE_NUM.test(s) || RE_NUM_ID.test(s)) { push('num', s, a); return; }
    let m;
    // Brackets in a chunk: 7(8)
    if ((m = /^([^()[\]]*)([()[\]])(.*)$/.exec(s))) { core(m[1], a); push('p', m[2], a + m[1].length); core(m[3], a + m[1].length + 1); return; }
    // Number with letters after a hyphen: 64-bit, 1-day
    if ((m = /^(\d[\d.]*)[-‑]([\p{L}][\p{L}\p{N}‑-]*)$/u.exec(s))) { push('w', s, a, { lower: s.toLowerCase(), parts: [m[1], ...m[2].split(/[-‑]/)] }); return; }
    // Number with a unit or a symbol after it: 360°, 20%
    if ((m = new RegExp(`^([+\\-−±]?\\d[\\d.]*[${SUPERSCRIPT}]*)([^\\d.].*)$`).exec(s)) && !RE_WORD.test(s)) { push('num', m[1], a); core(m[2], a + m[1].length); return; }
    // Punctuation in a chunk: a,b  a:b  a;b
    if ((m = /^([^,;:]+)([,;:])(.+)$/.exec(s))) { core(m[1], a); push('p', m[2], a + m[1].length); core(m[3], a + m[1].length + 1); return; }
    if (s.includes('/') && s.length > 1) { let p = a; s.split('/').forEach((piece, k) => { if (k) { push('sym', '/', p); p++; } core(piece, p); p += piece.length; }); return; }
    // A sign before a word or after a word: -d2, x-
    if ((m = /^([-+−±])(.+)$/.exec(s)) && !/^[-+−±]/.test(m[2])) { push('sym', m[1], a); core(m[2], a + 1); return; }
    if ((m = /^(.*[^-+−±])([-+−±])$/.exec(s))) { core(m[1], a); push('sym', m[2], a + m[1].length); return; }
    if (RE_WORD.test(s) && /[\p{L}]/u.test(s)) {
      const tok = push('w', s, a, { lower: s.toLowerCase().replace(/’/g, "'").replace(/‑/g, '-') });
      if (/[-‑]/.test(s)) tok.parts = s.split(/[-‑]/).filter(Boolean);
      return;
    }
    // Symbols: one token for each character that is not a letter or a digit, words between them.
    if ((m = /^([\p{L}\p{N}_'’‑-]*)([^\p{L}\p{N}_'’‑-]+)(.*)$/u.exec(s))) {
      core(m[1], a);
      if (L.tn.symbols.has(m[2]) || DASHES.has(m[2])) push(DASHES.has(m[2]) ? 'p' : 'sym', m[2], a + m[1].length);
      else [...m[2]].forEach((ch, k) => push(DASHES.has(ch) ? 'p' : 'sym', ch, a + m[1].length + k));
      core(m[3], a + m[1].length + m[2].length);
      return;
    }
    push('sym', s, a);
  };

  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) {
    let s = m[0], a = m.index;
    while (s.length && !isAtom(s) && LEAD.has(s[0])) { push('p', s[0], a); s = s.slice(1); a++; }
    const tail = [];
    while (s.length && !isAtom(s) && TRAIL.has(s[s.length - 1])) { tail.unshift({ t: 'p', s: s[s.length - 1], at: a + s.length - 1 }); s = s.slice(0, -1); }
    core(s, a);
    for (const x of tail) toks.push(x);
  }

  // One number: digits in groups of three (149 597 870.7) and powers of ten (4 × 10⁻⁹).
  for (let i = 0; i < toks.length - 1; i++) {
    const cur = toks[i];
    if (cur.t !== 'num') continue;
    for (;;) {
      const nx = toks[i + 1];
      if (nx && nx.t === 'num' && /^\d{1,3}(?:[  ]\d{3})*$/.test(cur.s) && /^\d{3}(?:\.\d+)?$/.test(nx.s) && nx.at === cur.at + cur.s.length + 1) { cur.s += ' ' + nx.s; toks.splice(i + 1, 1); continue; }
      const nn = toks[i + 2];
      if (nx && nn && nx.t === 'sym' && nx.s === '×' && nn.t === 'num' && new RegExp(`^10[${SUPERSCRIPT}]+$`).test(nn.s)) { cur.s += ' × ' + nn.s; toks.splice(i + 1, 2); continue; }
      break;
    }
  }

  // One number: a section number with the letter of a list item (4.3.5 c).
  for (let i = 0; i < toks.length - 1; i++) {
    const cur = toks[i], nx = toks[i + 1], after = toks[i + 2];
    if (cur.t === 'num' && /^\d+(?:\.\d+){2,}$/.test(cur.s) && nx.t === 'w' && /^[a-z]$/.test(nx.s) && nx.at === cur.at + cur.s.length + 1 && (!after || after.t === 'p')) {
      cur.s += ' ' + nx.s;
      toks.splice(i + 1, 1);
    }
  }

  // Quoted text: the words between double quotation marks.
  let open = false;
  for (const tok of toks) {
    if (tok.t === 'p' && (tok.s === '"' || tok.s === '“' || tok.s === '”')) { open = tok.s === '“' ? true : tok.s === '”' ? false : !open; tok.quoteMark = true; continue; }
    if (open) tok.q = true;
  }
  return toks;
}

// ---------------------------------------------------------------------------------------------------------
// Technical-name phrases
// ---------------------------------------------------------------------------------------------------------
const tokKey = (tok) => (tok.t === 'w' ? tok.lower : tok.s);
const isWordLike = (tok) => tok.t === 'w' || tok.t === 'num' || tok.t === 'name';

function buildPhrases(L) {
  for (const { name, info } of L.tn.pending) {
    const words = scan(name, L).filter(isWordLike).map(tokKey);
    if (words.length < 2) { L.tn.lower.set(words[0] ?? name.toLowerCase(), { ...info, plural: true }); continue; }
    const list = L.tn.phrases.get(words[0]) ?? [];
    list.push({ words, info, name });
    list.sort((x, y) => y.words.length - x.words.length);
    L.tn.phrases.set(words[0], list);
  }
}

function markPhrases(toks, L) {
  for (let i = 0; i < toks.length; i++) {
    if (!isWordLike(toks[i]) || toks[i].q) continue;
    const list = L.tn.phrases.get(tokKey(toks[i]));
    if (!list) continue;
    for (const ph of list) {
      const n = ph.words.length;
      let ok = i + n <= toks.length;
      for (let k = 0; ok && k < n; k++) {
        const tok = toks[i + k];
        if (!isWordLike(tok) || tok.q) { ok = false; break; }
        const key = tokKey(tok);
        ok = key === ph.words[k] || (k === n - 1 && singularOf(key) === singularOf(ph.words[k]));
      }
      if (ok) { for (let k = 0; k < n; k++) { toks[i + k].phrase = ph; toks[i + k].phraseIndex = k; } i += n - 1; break; }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Class of a word
// ---------------------------------------------------------------------------------------------------------
function lookupSimple(s, L) {
  const lower = s.toLowerCase().replace(/’/g, "'");
  let x;
  if ((x = L.tn.exact.get(s))) return { cls: 'tn', info: x, pos: [x.pos] };
  if ((x = L.tn.lower.get(lower))) {
    // A technical name can also be an approved word in a different part of speech (constant: noun and adjective).
    const also = (L.approved.forms.get(lower) ?? []).filter((f) => f.role === 'base');
    return { cls: 'tn', info: x, pos: [...new Set([x.pos, ...also.flatMap((f) => f.entry.pos)])], also };
  }
  const single = singularOf(lower);
  if (single !== lower && (x = L.tn.lower.get(single)) && x.plural) return { cls: 'tn', info: x, pos: [x.pos], plural: true };
  if ((x = L.tn.verbs.get(lower))) return { cls: 'tv', info: x.info, pos: ['v'], role: x.role };
  const bad = L.bad.forms.get(lower);
  if (bad && !bad.pos) return { cls: 'bad', bad };
  if (bad && bad.pos && (bad.role === 'ed' || bad.role === 'ing' || bad.role === 'form')) return { cls: 'bad', bad };
  if ((x = L.approved.forms.get(lower))) return { cls: 'ok', forms: x, pos: [...new Set(x.flatMap((f) => f.entry.pos))], uncertain: x.some((f) => f.entry.uncertain) };
  if (bad) return { cls: 'bad', bad };
  if ((x = L.bad.spelling.get(lower))) return { cls: 'spelling', use: x };
  if (/ing$/.test(lower) && lower.length > 4 && !NOT_ING.has(lower)) return { cls: 'ing' };
  return null;
}

function classify(tok, L) {
  if (tok.q) return { cls: 'quoted' };
  if (tok.phrase) return { cls: 'tn', info: tok.phrase.info, pos: [tok.phrase.info.pos], inPhrase: true };
  let s = tok.s;
  let r = lookupSimple(s, L);
  if (r) return r;
  // Possessive: the word before 's
  const poss = /^(.*)['’]s$/.exec(s);
  if (poss && (r = lookupSimple(poss[1], L))) return { ...r, possessive: true };
  if (tok.parts && tok.parts.length > 1) {
    const parts = tok.parts.map((p) => (RE_NUM.test(p) ? { cls: 'num' } : lookupSimple(p, L) ?? { cls: 'unknown', part: p }));
    const badPart = parts.find((p) => p.cls !== 'ok' && p.cls !== 'tn' && p.cls !== 'tv' && p.cls !== 'num');
    if (!badPart) return { cls: 'compound', parts, pos: ['n', 'adj'], uncertain: parts.some((p) => p.uncertain) };
    return { cls: 'compound-bad', parts, partWords: tok.parts };
  }
  return { cls: 'unknown' };
}

// ---------------------------------------------------------------------------------------------------------
// Sentences and segments
// ---------------------------------------------------------------------------------------------------------
/** Tokens -> sentences. A full stop, a question mark or an exclamation mark ends a sentence. */
function splitSentences(toks) {
  const out = [];
  let cur = [];
  for (const tok of toks) {
    if (tok.t === 'p' && (tok.s === '.' || tok.s === '?' || tok.s === '!') && !tok.q) { if (cur.length) out.push({ toks: cur, end: tok.s }); cur = []; continue; }
    cur.push(tok);
  }
  if (cur.some((t) => t.t !== 'p')) out.push({ toks: cur, end: '' });
  return out;
}

/**
 * Sentence -> segments for the word count. The count obeys these rules:
 *  - a colon or a dash is the end of a segment (STE counts them as a full stop);
 *  - text in parentheses is a segment of its own (STE counts it as a new sentence);
 *  - quoted text is one word.
 */
function splitSegments(sentToks) {
  const segs = [];
  const stack = [[]];
  const close = (seg) => { if (seg.some((t) => t.t !== 'p')) segs.push(seg); };
  for (const tok of sentToks) {
    if (tok.t === 'p' && !tok.q) {
      if (tok.s === '(' || tok.s === '[') { stack.push([]); continue; }
      if ((tok.s === ')' || tok.s === ']')) { if (stack.length > 1) close(stack.pop()); continue; }
      if (tok.s === ':' || DASHES.has(tok.s)) { close(stack[stack.length - 1]); stack[stack.length - 1] = []; continue; }
    }
    stack[stack.length - 1].push(tok);
  }
  while (stack.length) close(stack.pop());
  return segs;
}

/**
 * Number of words of a segment. A number, a placeholder, a code text, a name with symbols and a quoted text are
 * one word each. Each part of a hyphenated word is one word, but a prefix (semi-, non-) is not a word of its own.
 */
function countWords(seg) {
  let n = 0, inQuote = false;
  for (const tok of seg) {
    if (tok.q) { if (!inQuote) { n++; inQuote = true; } continue; }
    inQuote = false;
    if (tok.t === 'w') n += tok.parts && tok.parts.length > 1 ? Math.max(1, tok.parts.filter((p) => !PREFIXES.has(p.toLowerCase())).length) : 1;
    else if (tok.t === 'num' || tok.t === 'ph' || tok.t === 'code' || tok.t === 'name') n++;
  }
  return n;
}

// Entries of the lists that the texts use (for the option --unused).
const used = { words: new Set(), names: new Set(), symbols: new Set() };
const nameKey = (info) => info.group + '|' + (info.id ?? info.name);
function markUsed(c) {
  if (!c) return;
  if (c.cls === 'ok') for (const f of c.forms) used.words.add(f.entry.word);
  else if (c.cls === 'tn' || c.cls === 'tv') { used.names.add(nameKey(c.info)); for (const f of c.also ?? []) used.words.add(f.entry.word); }
  else if (c.cls === 'compound' || c.cls === 'compound-bad') c.parts.forEach(markUsed);
}

// Code texts of the document of the text in work: the messages show them in the place of their markers.
let codeTexts = null;
const restoreCode = (s) => (codeTexts ? s.replace(/\uE000(\d+)\uE001/g, (m, n) => codeTexts[Number(n)] ?? m) : s);
const excerpt = (text, max = 160) => { const t = restoreCode(text); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
const segText = (seg, unitText) => (seg.length ? unitText.slice(seg[0].at, seg[seg.length - 1].at + seg[seg.length - 1].s.length) : '');

// ---------------------------------------------------------------------------------------------------------
// Checks of one text
// ---------------------------------------------------------------------------------------------------------
function checkUnit(unit, L, stats) {
  const findings = [];
  const seen = new Set();
  const add = (rule, message, extra = {}) => {
    const key = rule + '|' + (extra.word ?? '') + '|' + (extra.context ?? '');
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ rule, message, ...extra });
  };
  const text = unit.text;

  // Placeholders, brackets, quotation marks, spaces.
  const noPh = text.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, '');
  if (/[{}]/.test(noPh)) add('placeholder', 'A brace is not part of a correct {name} placeholder.');
  if (unit.kind !== 'cell') {
    const plainText = text.replace(/\uE000\d+\uE001/g, '');
    const count = (re) => (plainText.match(re) ?? []).length;
    if (count(/\(/g) !== count(/\)/g)) add('balance', 'The parentheses are not balanced.');
    if (count(/\[/g) !== count(/\]/g)) add('balance', 'The square brackets are not balanced.');
    if (count(/"/g) % 2) add('balance', 'The quotation marks are not balanced.');
    if (count(/“/g) !== count(/”/g)) add('balance', 'The quotation marks are not balanced.');
  }
  if (/^\s|\s$/.test(text)) add('spacing', 'The text starts or ends with a space.');
  if (/ {2,}/.test(text)) add('spacing', 'The text has two spaces together.');
  if (/\s[,.;:!?](\s|$)/.test(text)) add('spacing', 'A space is before a punctuation mark.');
  if (/;/.test(text.replace(/\uE000\d+\uE001/g, ''))) add('semicolon', 'STE does not use the semicolon. Make two sentences.');
  for (const [re, abbr, use] of LATIN) if (re.test(text)) add('not-approved', `"${abbr}" is not approved. Use: ${use}.`, { word: abbr });

  const toks = scan(text, L);
  markPhrases(toks, L);

  // Vocabulary.
  for (const tok of toks) {
    if (tok.t === 'sym') { used.symbols.add(tok.s); if (!tok.q && !L.tn.symbols.has(tok.s)) add('unknown-symbol', `The symbol "${tok.s}" is not in the list of symbols.`, { word: tok.s }); continue; }
    if (tok.t === 'name') { const info = L.tn.exact.get(tok.s) ?? L.tn.patterns.find((p) => p.re.test(tok.s))?.info; if (info) used.names.add(nameKey(info)); continue; }
    if (tok.t !== 'w') continue;
    stats.words++;
    const c = classify(tok, L);
    tok.c = c;
    markUsed(c);
    stats.note(tok, c, unit);
    const w = tok.s;
    if (!tok.q && CONTRACTION.test(w)) add('contraction', `"${w}" is a contraction. Write the full words.`, { word: w.toLowerCase() });
    if (c.cls === 'unknown') add('unknown-word', `"${w}" is not in the approved list and is not a technical name.`, { word: tok.lower });
    else if (c.cls === 'compound-bad') {
      for (let k = 0; k < c.parts.length; k++) {
        const p = c.parts[k];
        const pw = c.partWords[k];
        if (p.cls === 'unknown') add('unknown-word', `"${pw}" (in "${w}") is not in the approved list and is not a technical name.`, { word: pw.toLowerCase() });
        else if (p.cls === 'bad') add(MODAL_BAD.has(p.bad.word) ? 'modal' : 'not-approved', `"${pw}" (in "${w}") is not approved. Use: ${p.bad.use}.`, { word: pw.toLowerCase() });
        else if (p.cls === 'spelling') add('spelling', `"${pw}" (in "${w}"): the American spelling is "${p.use}".`, { word: pw.toLowerCase() });
        else if (p.cls === 'ing') add('ing-form', `"${pw}" (in "${w}") is an -ing form that is not a technical name.`, { word: pw.toLowerCase() });
      }
    } else if (c.cls === 'bad') add(MODAL_BAD.has(c.bad.word) ? 'modal' : 'not-approved', `"${w}" is not approved${c.bad.pos === 'v' ? ' as a verb' : ''}. Use: ${c.bad.use}.`, { word: tok.lower });
    else if (c.cls === 'spelling') add('spelling', `"${w}": the American spelling is "${c.use}".`, { word: tok.lower });
    else if (c.cls === 'ing') add('ing-form', `"${w}" is an -ing form that is not a technical name.`, { word: tok.lower });
  }
  // Phrases that are not approved.
  const words = toks.filter((t) => t.t === 'w' && !t.q);
  for (const ph of L.bad.phrases) {
    for (let i = 0; i + ph.words.length <= words.length; i++) {
      if (ph.words.every((x, k) => words[i + k].lower === x) && words[i + ph.words.length - 1].at - words[i].at < ph.phrase.length + 4) add('not-approved', `"${ph.phrase}" is not approved. Use: ${ph.use}.`, { word: ph.phrase });
    }
  }

  // Sentences.
  const sentences = splitSentences(toks);
  stats.sentences += sentences.length;
  for (const sent of sentences) {
    for (const seg of splitSegments(sent.toks)) {
      const n = countWords(seg);
      const procedure = isProcedure(seg, L);
      const limit = procedure ? MAX_WORDS_PROCEDURE : MAX_WORDS_DESCRIPTION;
      const context = excerpt(segText(seg, text));
      if (n > limit) add('sentence-length', `${n} words in ${procedure ? 'an instruction (maximum ' + MAX_WORDS_PROCEDURE : 'a description (maximum ' + MAX_WORDS_DESCRIPTION}).`, { context });
      checkGrammar(seg, L, (rule, message, word) => add(rule, message, { word, context }));
    }
  }
  if (sentences.length > MAX_SENTENCES_PARAGRAPH && (unit.kind === 'text' || unit.kind === 'definition' || unit.kind === 'para' || unit.kind === 'item')) add('paragraph-length', `${sentences.length} sentences in one paragraph (maximum ${MAX_SENTENCES_PARAGRAPH}).`);

  // End of the text.
  checkEnd(unit, toks, sentences, L, add);
  return findings;
}

const lowerOf = (tok) => (tok && tok.t === 'w' ? tok.lower : undefined);
const hasPos = (tok, p) => !!(tok && tok.c && tok.c.pos && tok.c.pos.includes(p));
const isAdverb = (tok) => !!tok && tok.t === 'w' && (hasPos(tok, 'adv') || tok.lower === 'not') && !BE.has(tok.lower);
const roleOf = (tok, role) => !!(tok && tok.c && ((tok.c.forms && tok.c.forms.some((f) => f.role === role)) || tok.c.role === role || (tok.c.role === 'past-pp' && (role === 'past' || role === 'pp'))));
/** Base form of an approved verb or of a technical verb. */
const isBaseVerb = (tok) => !!tok && tok.t === 'w' && !!tok.c && ((tok.c.cls === 'ok' && tok.c.forms.some((f) => f.role === 'base' && f.entry.pos.includes('v'))) || (tok.c.cls === 'tv' && tok.c.role === 'base'));
const isVerbOnly = (tok) => isBaseVerb(tok) && (tok.c.cls === 'tv' ? !tok.c.info.alsoNoun : tok.c.forms.every((f) => f.entry.pos.every((p) => p === 'v')));
/** A word that the lists have as a noun only (approved noun or technical name). A name with a capital letter after the first letter is not examined. */
const isNounOnly = (tok) => !!tok && tok.t === 'w' && !!tok.c && !tok.c.inPhrase && ((tok.c.cls === 'ok' && tok.c.pos.length === 1 && tok.c.pos[0] === 'n') || (tok.c.cls === 'tn' && tok.c.pos.every((p) => p === 'n') && !/[A-Z]/.test(tok.s.slice(1))));
const isApprovedAdjective = (tok) => !!tok && !!tok.c && ((tok.c.cls === 'ok' && tok.c.forms.some((f) => f.entry.pos.includes('adj') && f.role === 'base')) || (tok.c.cls === 'tn' && tok.c.info.pos === 'adj'));
function isParticiple(tok) {
  if (!tok || tok.t !== 'w') return false;
  const w = tok.lower;
  if (roleOf(tok, 'pp')) return true;
  if (IRREGULAR_PP.has(w)) return true;
  return /ed$/.test(w) && w.length > 3 && !NOT_PARTICIPLE.has(w) && !(tok.c && (tok.c.cls === 'tn'));
}

function isProcedure(seg, L) {
  const w = seg.filter((t) => t.t !== 'p' || t.s === ',');
  const startsInstruction = (i) => {
    const a = w[i], b = w[i + 1];
    if (!a || a.t !== 'w' || a.q) return false;
    if (a.lower === 'do' && lowerOf(b) === 'not') return true;
    if (a.lower === 'make' && lowerOf(b) === 'sure') return true;
    if (!isBaseVerb(a) || !b) return false;
    if (isVerbOnly(a)) return !(b.t === 'p');
    return b.t === 'ph' || b.t === 'code' || (b.t === 'w' && (DETERMINERS.has(b.lower) || OBJECT_PRONOUNS.has(b.lower)));
  };
  if (startsInstruction(0)) return true;
  if (w[0] && w[0].t === 'w' && CLAUSE_STARTS.has(w[0].lower)) {
    for (let i = 1; i < w.length - 1; i++) if (w[i].t === 'p' && w[i].s === ',' && startsInstruction(i + 1)) return true;
  }
  return false;
}

function checkGrammar(seg, L, add) {
  const w = seg.filter((t) => !t.q);
  for (let i = 0; i < w.length; i++) {
    const tok = w[i];
    if (tok.t !== 'w') continue;
    const low = tok.lower;
    const prev = w[i - 1], next = w[i + 1];
    // Passive voice and perfect tenses: be / have + adverbs + past participle.
    if (BE.has(low) || HAVE.has(low)) {
      let j = i + 1;
      while (j < w.length && j < i + 4 && isAdverb(w[j])) j++;
      const p = w[j];
      if (isParticiple(p) && !(BE.has(low) && isApprovedAdjective(p) && !roleOf(p, 'pp'))) {
        const phrase = w.slice(i, j + 1).map((t) => t.s).join(' ');
        if (BE.has(low)) add('passive', `"${phrase}": passive voice (be + past participle). Use the active voice, or give an exception.`, phrase.toLowerCase());
        else if (!(isApprovedAdjective(p) && w[j + 1] && w[j + 1].t === 'w' && hasPos(w[j + 1], 'n') && !roleOf(p, 'pp'))) add('perfect', `"${phrase}": perfect tense (have + past participle). Use the simple past or the simple present.`, phrase.toLowerCase());
      }
    }
    // A past participle that is not an adjective before a noun and not after "be".
    if (ALWAYS_PP.has(low) && low !== 'been') {
      let k = i - 1;
      while (k >= 0 && isAdverb(w[k])) k--;
      const before = w[k];
      const afterBe = before && before.t === 'w' && (BE.has(before.lower) || HAVE.has(before.lower));
      const nounNext = next && (next.t === 'w' ? !(hasPos(next, 'prep') || hasPos(next, 'conj') || hasPos(next, 'adv') || hasPos(next, 'art') || DETERMINERS.has(next.lower)) || hasPos(next, 'n') : next.t !== 'p');
      if (!afterBe && !nounNext) add('participle', `"${tok.s}": a past participle must be an adjective (before a noun, or after "be" for a state). Use an active verb.`, low);
    }
    if (i === 0 && /ed$/.test(low) && isParticiple(tok) && !isApprovedAdjective(tok) && next && next.t === 'w' && (hasPos(next, 'prep') || next.lower === 'only') && !hasPos(next, 'n')) {
      add('participle', `"${tok.s} ${next.s}": a past participle with no subject (a short passive). Use an active sentence.`, low);
    }
    // A past participle + "by" that does not follow "be": a short passive after a noun (the value calculated by the engine).
    if (i > 0 && next && next.t === 'w' && next.lower === 'by' && isParticiple(tok) && !isApprovedAdjective(tok) && !roleOf(tok, 'third')) {
      let k = i - 1;
      while (k >= 0 && isAdverb(w[k])) k--;
      const before = w[k];
      const afterAux = before && before.t === 'w' && (BE.has(before.lower) || HAVE.has(before.lower));
      const afterSubject = before && before.t === 'w' && (SUBJECT_PLURAL.has(before.lower) || SUBJECT_SINGULAR.has(before.lower));
      const numberNext = w[i + 2] && (w[i + 2].t === 'num' || w[i + 2].t === 'ph');
      if (!afterAux && !afterSubject && !numberNext) add('participle', `"${tok.s} by": a past participle after a noun (a short passive). Use an active verb.`, low);
    }
    // "about" + number
    const isUnit = (x) => !!x && ((x.t === 'name' && !!L.tn.exact.get(x.s)?.unit) || (x.t === 'w' && !!x.c?.info?.unit));
    if (low === 'about' && next && (next.t === 'num' || (next.t === 'ph' && isUnit(w[i + 2])))) add('not-approved', '"about" + number is not approved. Use: approximately.', 'about');
    // "sure" only in "make sure"
    if (low === 'sure' && !(prev && ['make', 'makes', 'made'].includes(lowerOf(prev)))) add('not-approved', '"sure" is approved only in "make sure".', 'sure');
    // A noun (approved noun or technical name) that is a verb here. A word for a number is not examined (do one of these steps).
    if (isNounOnly(tok) && tok.c.info?.category !== 'number') {
      const base = !roleOf(tok, 'plural') && !tok.c.plural;
      const prevLow = lowerOf(prev), prev2 = lowerOf(w[i - 2]);
      const nextIsObject = next && next.t === 'w' && (DETERMINERS.has(next.lower) || OBJECT_PRONOUNS.has(next.lower));
      let verb = false;
      if (prevLow && (MODAL_OK.has(prevLow) || MODAL_BAD.has(prevLow) || (DO.has(prevLow) && base && !isBaseVerb(tok)))) verb = base;
      else if (prevLow === 'not' && prev2 && (MODAL_OK.has(prev2) || DO.has(prev2) || MODAL_BAD.has(prev2))) verb = base;
      else if (prevLow === 'to' && base && nextIsObject && !(next.lower === 'that' || next.lower === 'this') ) verb = true;
      else if (i === 0 && base && next && next.t === 'w' && next.s === next.lower && (['the', 'a', 'an', 'these', 'those', 'your', 'its', 'their', 'it', 'them'].includes(next.lower))) verb = true;
      else if (prevLow && SUBJECT_PLURAL.has(prevLow) && base) verb = true;
      else if (prevLow && SUBJECT_SINGULAR.has(prevLow) && !base) verb = true;
      else if (!base && nextIsObject && prev && prev.t === 'w' && !DETERMINERS.has(prev.lower) && hasPos(prev, 'n') && !hasPos(prev, 'adj') && ['the', 'a', 'an', 'its', 'their', 'it', 'them'].includes(next.lower)) verb = true;
      if (verb) {
        const bad = L.bad.forms.get(singularOf(low)) ?? L.bad.forms.get(low);
        add('part-of-speech', `"${tok.s}" is a noun in the lists (${tok.c.cls === 'tn' ? 'technical name' : 'approved noun'}). It is a verb here.${bad && bad.pos === 'v' ? ' Use: ' + bad.use + '.' : ''}`, low);
      }
    }
  }
  // Noun clusters of more than three nouns.
  {
    let run = [];
    const flush = () => { if (run.length > MAX_NOUN_CLUSTER) add('noun-cluster', `"${run.map((t) => t.s).join(' ')}": a group of more than ${MAX_NOUN_CLUSTER} nouns. Use "of" or other words between the nouns.`, run.map((t) => t.lower).join(' ')); run = []; };
    for (let i = 0; i < w.length; i++) {
      const tok = w[i];
      const nounLike = tok.t === 'w' && tok.c && ((tok.c.cls === 'ok' && tok.c.pos.length === 1 && tok.c.pos[0] === 'n') || (tok.c.cls === 'tn' && tok.c.pos.every((p) => p === 'n') && !tok.c.info.unit));
      if (!nounLike) { flush(); continue; }
      // A name of more than one word (a proper name or a technical name in the lists) counts as one noun.
      if (tok.phrase && tok.phraseIndex > 0) { run[run.length - 1] = { s: run[run.length - 1].s + ' ' + tok.s, lower: run[run.length - 1].lower + ' ' + tok.lower }; continue; }
      run.push({ s: tok.s, lower: tok.lower });
    }
    flush();
  }
}

/** The end of a text: a text with a sentence in it ends with a full stop, a colon or a question mark. */
function checkEnd(unit, toks, sentences, L, add) {
  if (!toks.length) { add('text-end', 'The text is empty.'); return; }
  const last = toks[toks.length - 1];
  const ended = last.t === 'p' && ['.', '?', ':', ')', '"', '”', '!'].includes(last.s);
  const closedEnd = last.t === 'p' && [')', '"', '”'].includes(last.s);
  if (sentences.length > 1 && !ended) add('text-end', 'The text has two or more sentences, but the last sentence has no full stop.');
  if (last.t === 'p' && last.s === '!') add('text-end', 'Do not use an exclamation mark.');
  if (last.t === 'p' && (last.s === ',' || last.s === ';')) add('text-end', `The text ends with "${last.s}".`);
  if (sentences.length === 1 && !ended && unit.kind !== 'term' && unit.kind !== 'heading' && unit.kind !== 'cell') {
    // One statement with a subject and a verb, but no full stop.
    const w = toks.filter((t) => t.t !== 'p');
    if (w.length >= 4 && isStatement(toks, L)) add('text-end', 'The text is a full sentence, but it has no full stop.');
  }
  if (sentences.length === 1 && ended && !closedEnd && last.s === '.' && unit.kind === 'term') add('text-end', 'A term has no full stop.');
  const first = toks.find((t) => t.t === 'w');
  if (first && ended && last.s === '.' && toks[0] === first && /^[a-z]/.test(first.s) && !(first.c && (first.c.cls === 'tn')) && sentences.length >= 1 && unit.kind !== 'cell' && !(toks[1] && toks[1].t === 'p' && toks[1].s === ':')) add('text-end', 'The text ends with a full stop, but it does not start with a capital letter.');
}

/** True if the tokens start with a noun phrase and then have a finite verb (a full statement). */
function isStatement(toks, L) {
  const w = toks.filter((t) => t.t === 'w' || t.t === 'ph' || t.t === 'num' || t.t === 'name' || t.t === 'code' || (t.t === 'p' && (t.s === ':' || t.s === '(')));
  if (!w.length || w[0].t !== 'w') return false;
  const first = w[0].lower;
  if (!(DETERMINERS.has(first) || first === 'you' || first === 'it' || first === 'they' || first === 'there')) return false;
  for (let i = 1; i < w.length && i < 9; i++) {
    const tok = w[i];
    if (tok.t === 'p') return false;
    if (tok.t !== 'w') continue;
    const low = tok.lower;
    if (low === 'that' || low === 'which' || low === 'who' || low === 'where') return false;
    if (['is', 'are', 'was', 'were', 'has', 'have', 'had', 'does', 'do', 'did', 'can', 'cannot', 'must', 'will'].includes(low)) return true;
    if (tok.c && tok.c.cls !== 'tn' && (roleOf(tok, 'third') || roleOf(tok, 'past')) && !roleOf(tok, 'plural') && !isApprovedAdjective(tok)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------
// Inputs: locale files and Markdown documents
// ---------------------------------------------------------------------------------------------------------
function unitsOfLocale(relPath) {
  const data = readJson(relPath);
  const units = [];
  // A file of measured values (src/validation/measured/*.json) is a list of rows. The application shows the text
  // "truth" of each row. Two rows with the same text are one text.
  if (Array.isArray(data)) {
    const seen = new Set();
    for (const row of data) {
      if (!row || typeof row.truth !== 'string' || seen.has(row.truth)) continue;
      seen.add(row.truth);
      units.push({ file: relPath, key: `${row.id ?? units.length} (truth)`, kind: 'text', text: row.truth });
    }
    return units;
  }
  const walk = (node, path) => {
    for (const [key, v] of Object.entries(node)) {
      const p = path ? path + '.' + key : key;
      if (typeof v === 'string') units.push({ file: relPath, key: p, kind: 'text', text: v });
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p);
      else units.push({ file: relPath, key: p, kind: 'text', text: '', broken: 'The value is not a text.' });
    }
  };
  if (data.text) walk(data.text, '');
  for (const [id, v] of Object.entries(data.glossary ?? {})) {
    units.push({ file: relPath, key: `glossary.${id}.term`, kind: 'term', text: v.term });
    units.push({ file: relPath, key: `glossary.${id}.definition`, kind: 'definition', text: v.definition });
  }
  return units;
}

/** Markdown inline text -> plain text. Code, addresses and paths become one code token each. */
function plainMarkdown(text, codes) {
  const hide = (s) => { codes.push(s); return `\uE000${codes.length - 1}\uE001`; };
  let s = text;
  s = s.replace(/<!--.*?-->/g, ' ');
  s = s.replace(/(`+)(.+?)\1/g, (m) => hide(m));
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  s = s.replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1');
  s = s.replace(/<(?:https?:\/\/|mailto:)[^>\s]+>/g, (m) => hide(m));
  s = s.replace(/\bhttps?:\/\/[^\s)]+/g, (m) => hide(m));
  s = s.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2');
  s = s.replace(/(^|[\s(“"])\*(?=\S)([^*]+?)(?<=\S)\*(?=[\s).,:;!?”"]|$)/g, '$1$2');
  s = s.replace(/(^|[\s(“"])_(?=\S)([^_]+?)(?<=\S)_(?=[\s).,:;!?”"]|$)/g, '$1$2');
  return s.replace(/\s+/g, ' ').trim();
}

function unitsOfMarkdown(relPath) {
  let source;
  try { source = readFileSync(join(ROOT, relPath), 'utf8'); } catch { stop(`Cannot read ${relPath}.`); }
  const lines = source.split('\n');
  const units = [];
  const codes = [];
  const push = (kind, text, line) => { const t = plainMarkdown(text, codes); if (t) units.push({ file: relPath, line, kind, text: t, raw: text.trim(), codes }); };
  let para = null; // { kind, text, line }
  const flush = () => { if (para) push(para.kind, para.text, para.line); para = null; };
  let fence = null;
  lines.forEach((raw, k) => {
    const line = k + 1;
    const fm = /^\s*(```+|~~~+)/.exec(raw);
    if (fence) { if (fm && fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null; return; }
    if (fm) { flush(); fence = fm[1]; return; }
    if (!raw.trim()) { flush(); return; }
    let m;
    if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(raw))) { flush(); push('heading', m[2].replace(/^\d+(?:\.\d+)*\.?\s+/, ''), line); return; }
    if (/^\s*\|/.test(raw)) {
      flush();
      if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(raw)) return; // separator row
      // Cells: split at "|" that is not in inline code.
      const cells = []; let cur = '', inCode = false;
      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '`') inCode = !inCode;
        if (ch === '\\' && raw[i + 1] === '|') { cur += '|'; i++; continue; }
        if (ch === '|' && !inCode) { cells.push(cur); cur = ''; continue; }
        cur += ch;
      }
      cells.push(cur);
      for (const cell of cells) if (cell.trim()) push('cell', cell, line);
      return;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) { flush(); return; } // horizontal rule
    if ((m = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(raw))) { flush(); para = { kind: 'item', text: m[2].replace(/^\[[ xX]\]\s+/, ''), line }; return; }
    if ((m = /^\s*>\s?(.*)$/.exec(raw))) { if (para && para.kind === 'para') para.text += ' ' + m[1]; else { flush(); para = { kind: 'para', text: m[1], line }; } return; }
    if (para) para.text += ' ' + raw.trim(); else para = { kind: 'para', text: raw.trim(), line };
  });
  flush();
  return units;
}

// ---------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------
const glossary = loadGlossary();
const L = { approved: loadApproved(), bad: loadNotApproved(), tn: loadTechnical(glossary) };
buildPhrases(L);
// A word must not be approved and not approved at the same time.
for (const [form, bad] of L.bad.forms) {
  if (!bad.pos && bad.role === 'base' && L.approved.forms.has(form) && L.approved.forms.get(form).some((f) => f.role === 'base')) stop(`"${form}" is in approved-words.txt and in not-approved.json. Give a part of speech ("pos") in not-approved.json, or remove one entry.`);
}
const exceptions = loadExceptions();

const localeFiles = () => readdirSync(join(ROOT, LOCALE_DIR)).filter((f) => f.endsWith('.json')).sort().map((f) => `${LOCALE_DIR}/${f}`);
// The English documents: README.md and docs/*.md. A document in a different language has its language code before
// the extension (for example FINAL_REPORT_ja.md). This tool does not read such a file.
const docFiles = () => [
  ...(existsSync(join(ROOT, 'README.md')) ? ['README.md'] : []),
  ...(existsSync(join(ROOT, DOCS_DIR)) ? readdirSync(join(ROOT, DOCS_DIR)).filter((f) => f.endsWith('.md') && !/_[a-z]{2}\.md$/.test(f)).sort().map((f) => `${DOCS_DIR}/${f}`) : []),
];
const measuredFiles = () => (existsSync(join(ROOT, MEASURED_DIR)) ? readdirSync(join(ROOT, MEASURED_DIR)).filter((f) => f.endsWith('.json')).sort().map((f) => `${MEASURED_DIR}/${f}`) : []);
const given = opt.files.map(toRel);
const fullCheck = !opt.only && !opt.locales && !given.length;
const files = opt.only ? given : opt.locales ? localeFiles() : given.length ? [...localeFiles(), ...given] : [...localeFiles(), ...measuredFiles(), ...docFiles()];
for (const f of files) if (!existsSync(join(ROOT, f))) stop(`Cannot find ${f}.`);

const vocabulary = new Map(); // lower-case word -> { count, cls, where }
const stats = {
  words: 0, sentences: 0, quoted: 0,
  note(tok, c, unit) {
    const key = tok.lower;
    const cur = vocabulary.get(key) ?? { word: tok.s, count: 0, cls: c.cls, uncertain: !!c.uncertain, detail: c.cls === 'tn' || c.cls === 'tv' ? (c.info.category + (c.info.id ? ':' + c.info.id : '')) : c.cls === 'ok' ? c.pos.join(',') : '', where: unit.file.split('/').pop() + ' ' + (unit.key ?? 'line ' + unit.line) };
    cur.count++;
    vocabulary.set(key, cur);
  },
};

const results = [];
for (const file of files) {
  const isLocale = file.endsWith('.json');
  if (!isLocale && !file.endsWith('.md')) stop(`${file}: the tool reads .json locale files and .md documents.`);
  const units = isLocale ? unitsOfLocale(file) : unitsOfMarkdown(file);
  const before = { words: stats.words, sentences: stats.sentences };
  const findings = [];
  for (const unit of units) {
    codeTexts = unit.codes ?? null;
    const list = unit.broken ? [{ rule: 'text-end', message: unit.broken }] : checkUnit(unit, L, stats);
    for (const f of list) {
      const ex = exceptions.find((e) => (e.file === file || file.endsWith('/' + e.file)) && e.rule === f.rule
        && (e.key ? e.key === unit.key : true) && (e.text ? unit.text.includes(e.text) || (unit.raw ?? '').includes(e.text) : true) && (e.word ? e.word === f.word : true));
      if (ex) ex.used++;
      findings.push({ ...(unit.key ? { key: unit.key } : { line: unit.line }), rule: f.rule, message: f.message, ...(f.word ? { word: f.word } : {}), text: f.context ?? excerpt(unit.text, 200), ...(ex ? { exception: ex.reason } : {}) });
    }
  }
  results.push({ file, texts: units.length, sentences: stats.sentences - before.sentences, words: stats.words - before.words, open: findings.filter((f) => !f.exception).length, excepted: findings.filter((f) => f.exception).length, findings });
}

// Stale exceptions: an exception for a file of this check that agrees with no finding.
const stale = exceptions.filter((e) => !e.used && files.some((f) => f === e.file || f.endsWith('/' + e.file)));

if (opt.words) {
  const rows = [...vocabulary.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [word, v] of rows) console.log([word, v.cls + (v.uncertain ? '?' : ''), v.detail, v.count, v.where].join('\t'));
  process.exit(0);
}

if (opt.unused) {
  const words = L.approved.entries.filter((e) => !used.words.has(e.word)).map((e) => (e.uncertain ? '?' : '') + e.word);
  console.log(`Approved words that the texts of this check do not use (${words.length} of ${L.approved.entries.length}):`);
  console.log('  ' + (words.join(', ') || '-'));
  const groups = new Map();
  for (const info of L.tn.all) {
    if (info.symbol ? used.symbols.has(info.name) : used.names.has(nameKey(info))) continue;
    groups.set(info.group, [...(groups.get(info.group) ?? []), info.name]);
  }
  const n = [...groups.values()].reduce((t, x) => t + x.length, 0);
  console.log(`Technical names, technical verbs and patterns that the texts of this check do not use (${n} of ${L.tn.all.length}):`);
  for (const [group, names] of groups) console.log(`  ${group}: ${names.join(', ')}`);
  if (!n) console.log('  -');
  process.exit(0);
}

const totals = results.reduce((t, r) => ({ texts: t.texts + r.texts, sentences: t.sentences + r.sentences, words: t.words + r.words, open: t.open + r.open, excepted: t.excepted + r.excepted }), { texts: 0, sentences: 0, words: 0, open: 0, excepted: 0 });
const byRule = {};
for (const r of results) for (const f of r.findings) { const x = (byRule[f.rule] ??= { open: 0, excepted: 0 }); if (f.exception) x.excepted++; else x.open++; }
const uncertainUsed = [...vocabulary.values()].filter((v) => v.uncertain).length;
const lists = {
  approvedWords: L.approved.entries.length,
  approvedWordsNotCertain: L.approved.entries.filter((e) => e.uncertain).length,
  notApprovedWords: L.bad.count,
  spellingPairs: L.bad.spellingCount,
  technicalNames: L.tn.count,
  technicalVerbs: L.tn.verbCount,
  glossaryEntries: glossary.length,
  exceptions: exceptions.length,
};

// Console report.
const out = [];
out.push('ste-lint: check for ASD-STE100 with project word lists. The official dictionary was not available.');
out.push(`Lists: ${lists.approvedWords} approved words (${lists.approvedWordsNotCertain} not certain), ${lists.notApprovedWords} words that are not approved, ${lists.spellingPairs} spelling pairs, ${lists.technicalNames} technical names (${lists.glossaryEntries} glossary entries), ${lists.technicalVerbs} technical verbs, ${lists.exceptions} exceptions.`);
if (!opt.summary) {
  for (const r of results) {
    const shown = r.findings.filter((f) => opt.all || !f.exception);
    if (!shown.length) continue;
    out.push('');
    out.push(`${r.file}: ${r.open} open, ${r.excepted} with an exception`);
    let where = null;
    for (const f of shown) {
      const loc = f.key ?? 'line ' + f.line;
      if (loc !== where) { out.push(`  ${loc}`); where = loc; }
      out.push(`    [${f.rule}]${f.exception ? ' (exception)' : ''} ${f.message}`);
      out.push(`      > ${f.text}`);
      if (f.exception) out.push(`      reason: ${f.exception}`);
    }
  }
}
out.push('');
out.push('File                                               texts  sentences   words   open  exceptions');
for (const r of results) out.push(`${r.file.padEnd(50)} ${String(r.texts).padStart(5)} ${String(r.sentences).padStart(10)} ${String(r.words).padStart(7)} ${String(r.open).padStart(6)} ${String(r.excepted).padStart(11)}`);
out.push(`${'Total'.padEnd(50)} ${String(totals.texts).padStart(5)} ${String(totals.sentences).padStart(10)} ${String(totals.words).padStart(7)} ${String(totals.open).padStart(6)} ${String(totals.excepted).padStart(11)}`);
out.push(`Distinct words: ${vocabulary.size} (${uncertainUsed} with an approval that is not certain).`);
if (Object.keys(byRule).length) out.push('Findings for each rule: ' + Object.entries(byRule).sort().map(([k, v]) => `${k} ${v.open}${v.excepted ? ' (+' + v.excepted + ' exceptions)' : ''}`).join(', ') + '.');
for (const e of stale) out.push(`STALE EXCEPTION: ${e.file} ${e.key ?? JSON.stringify(e.text)} [${e.rule}] agrees with no finding. Remove it from exceptions.json.`);
out.push(totals.open || stale.length ? `Result: ${totals.open} open findings, ${stale.length} stale exceptions.` : `Result: no open findings (${totals.excepted} findings have an exception).`);
console.log(out.join('\n'));

// JSON report (no dates and no other data that changes from one run to the next).
const reportPath = opt.noReport ? null : opt.report ?? (fullCheck ? DEFAULT_REPORT : null);
if (reportPath) {
  const report = {
    tool: 'tools/ste/ste-lint.mjs',
    note: 'Check for ASD-STE100 with project word lists. The official ASD-STE100 dictionary was not available.',
    limits: { wordsInInstruction: MAX_WORDS_PROCEDURE, wordsInDescription: MAX_WORDS_DESCRIPTION, sentencesInParagraph: MAX_SENTENCES_PARAGRAPH, nounsInCluster: MAX_NOUN_CLUSTER },
    lists,
    totals: { files: results.length, ...totals, distinctWords: vocabulary.size, distinctWordsNotCertain: uncertainUsed, staleExceptions: stale.length },
    rules: Object.fromEntries(Object.entries(byRule).sort()),
    files: results,
    staleExceptions: stale.map((e) => ({ file: e.file, ...(e.key ? { key: e.key } : { text: e.text }), rule: e.rule })),
  };
  writeFileSync(isAbsolute(reportPath) ? reportPath : join(ROOT, toRel(reportPath)), JSON.stringify(report, null, 1) + '\n');
}
process.exit(totals.open || stale.length ? 1 : 0);

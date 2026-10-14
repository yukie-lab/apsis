// Types of tools/manual/values.mjs (for the scenes of the videos, which are TypeScript).
export type Value = string | { en: string; ja: string };
export function makeValues(D: Record<string, unknown>): Record<string, Value>;
export function fill(text: string, V: Record<string, Value>, lang: 'en' | 'ja' | 'say'): string;
export function date(text: string): { en: string; ja: string };
export function monthYear(text: string): { en: string; ja: string };

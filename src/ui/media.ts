/** Hooks for the size of the screen. */
import { useEffect, useState } from 'react';

/** True while the media query agrees with the screen. */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = (): void => setMatch(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [query]);
  return match;
}
/** A screen with a small width (a phone that the user holds with the short side down). */
export function useNarrow(): boolean { return useMedia('(max-width: 720px)'); }
/** A screen with a small height (a phone that the user holds with the long side down). */
export function useShort(): boolean { return useMedia('(max-height: 520px)'); }

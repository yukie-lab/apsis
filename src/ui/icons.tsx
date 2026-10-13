/** Icons: drawn for this application (no external assets). */
import type { ReactNode } from 'react';

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <ellipse cx="16" cy="16" rx="13" ry="7" fill="none" stroke="#ffb454" strokeWidth="2" transform="rotate(-28 16 16)" />
      <circle cx="10.5" cy="18.5" r="3.4" fill="#78b7ff" />
      <circle cx="26.2" cy="8.6" r="1.7" fill="#ffb454" />
    </svg>
  );
}

function I({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
export const IconPlay = () => <I><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></I>;
export const IconPause = () => <I><path d="M7 5v14M17 5v14" strokeWidth="3" /></I>;
export const IconBack = () => <I><path d="M15 5l-7 7 7 7" /></I>;
export const IconNext = () => <I><path d="M9 5l7 7-7 7" /></I>;
export const IconSkipStart = () => <I><path d="M6 5v14M19 5l-9 7 9 7z" /></I>;
export const IconSkipEnd = () => <I><path d="M18 5v14M5 5l9 7-9 7z" /></I>;
export const IconPlus = () => <I><path d="M12 5v14M5 12h14" /></I>;
export const IconMinus = () => <I><path d="M5 12h14" /></I>;
export const IconClose = () => <I><path d="M6 6l12 12M18 6L6 18" /></I>;
export const IconTarget = () => <I><circle cx="12" cy="12" r="7" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></I>;
export const IconCamera = () => <I><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></I>;
export const IconNumbers = () => <I><path d="M4 19V9M10 19V5M16 19v-7M21 19H3" /></I>;
export const IconRocket = () => <I><path d="M12 3c3 2 5 5.5 5 9.5l-2 3H9l-2-3C7 8.500 9 5 12 3z" /><circle cx="12" cy="10" r="1.6" /><path d="M9 15.5l-2.500 4 3.500-1.200M15 15.500l2.500 4-3.500-1.200M12 18v3" /></I>;
export const IconInfo = () => <I><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.500v.500" /></I>;
export const IconRuler = () => <I><path d="M3 17L17 3l4 4L7 21z" /><path d="M7.500 12.500l2 2M10.500 9.500l2 2M13.500 6.500l2 2" /></I>;

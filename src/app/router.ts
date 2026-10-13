/** Hash routes: the application works from a file server with no rewrite rules. */
export type Mode = 'explorer' | 'expert';
export type ExplorerPage = 'home' | 'famous' | 'make' | 'flight';
export type ExpertPage = 'mission' | 'ephemeris' | 'transfer' | 'windows' | 'tour' | 'maneuvers' | 'propagation' | 'files' | 'accuracy' | 'glossary';
export const EXPERT_PAGES: ExpertPage[] = ['mission', 'ephemeris', 'transfer', 'windows', 'tour', 'maneuvers', 'propagation', 'files', 'accuracy', 'glossary'];
const EXPLORER_PAGES: ExplorerPage[] = ['home', 'famous', 'make', 'flight'];

export type Route =
  | { mode: 'explorer'; page: ExplorerPage }
  | { mode: 'expert'; page: ExpertPage }
  | { mode: 'explorer' | 'expert'; page: 'about' };

export function parseRoute(hash: string, lastMode: Mode = 'explorer'): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'about') return { mode: lastMode, page: 'about' };
  if (parts[0] === 'expert') {
    const page = EXPERT_PAGES.find((p) => p === parts[1]) ?? 'mission';
    return { mode: 'expert', page };
  }
  const page = EXPLORER_PAGES.find((p) => p === parts[1]) ?? 'home';
  return { mode: 'explorer', page };
}
export function routeHash(r: Route): string {
  if (r.page === 'about') return '#/about';
  return r.page === 'home' ? '#/explorer' : `#/${r.mode}/${r.page}`;
}

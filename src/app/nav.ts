/** Navigation between the two modes: each mode keeps its last page. */
import { useApp } from './store';
import type { Mode, ExpertPage, ExplorerPage, Route } from './router';

/** Last page of each mode: a change of the mode goes back to it. */
const last: { expert: ExpertPage; explorer: ExplorerPage } = { expert: 'mission', explorer: 'home' };

/** Call this for each route that the application shows. */
export function rememberPage(route: Route): void {
  if (route.page === 'about') return;
  if (route.mode === 'expert') last.expert = route.page as ExpertPage; else last.explorer = route.page as ExplorerPage;
}

/** Go to the last page of a mode. */
export function switchMode(mode: Mode): void {
  const s = useApp.getState();
  if (mode === 'expert') s.go({ mode: 'expert', page: last.expert });
  else s.go({ mode: 'explorer', page: last.explorer === 'flight' && !s.trajectory ? 'home' : last.explorer });
}

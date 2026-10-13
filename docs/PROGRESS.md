# Progress log

Read this file first when the work starts again after an interruption.
Decisions and their reasons: `docs/DECISIONS.md`. Assets: `docs/ASSETS.md`.

## State (2026-10-14)

- [x] Project created (`package.json`, Python tools in `tools/.venv`).
- [x] Kernels and truth data downloaded (`data-src/`, `truth/`), ephemeris files built (`public/data/`).
- [x] Engine: time, frames, ephemeris, Kepler, Lambert, flybys, plans, optimisers, N-body propagation,
      plan-to-flight conversion, real missions, quick missions. `npx vitest run tests`: 155 tests pass.
- [x] Spacecraft models (9), test page `dev/spacecraft/`.
- [ ] Body textures: the files from Solar System Scope are being replaced (D28).
- [ ] Import and export (`src/engine/io`): in work.
- [ ] Engine additions: Tisserand graph, provenance of numbers, worker, self check in the browser.
- [ ] Application frame: store, i18n, routing, shared components, 3D scene.
- [ ] Expert mode screens.
- [ ] Explorer mode screens.
- [ ] STE check (`npm run lint:ste`) and its record.
- [ ] Screenshots of all screens (desktop and phone) checked by eye.
- [ ] Production build.
- [ ] Final report (Japanese): `docs/FINAL_REPORT_ja.md`.

## Items that are not verified (list for the final report)

- Planet centres of Uranus and Neptune (two JPL sources disagree).
- Rotation angles of the bodies (no truth data was compared).
- Import of the exported files by GMAT and STK themselves (the programs are not available here).
- STE: no licensed dictionary check; the check is a script with the rules and a word list.
- Spacecraft masses (example values).
- Published velocity changes of the Cassini and Juno insertion burns (D25).

## How to continue

1. `cd ~/Desktop/test/apsis`
2. `npx vitest run tests` shows the state of the engine (about 2 minutes).
3. Do the first item above that has no check mark.

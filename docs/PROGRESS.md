# Progress log

Read this file first when the work starts again after an interruption.
Decisions and their reasons: `docs/DECISIONS.md`. Assets: `docs/ASSETS.md`.

## State (2026-10-14)

- [x] Project created (`package.json`, Python tools in `tools/.venv`).
- [x] Kernels and truth data downloaded (`data-src/`, `truth/`), ephemeris files built (`public/data/`).
- [x] Engine: time, frames, ephemeris, Kepler, Lambert, flybys, plans, optimisers, N-body propagation,
      plan-to-flight conversion, real missions, quick missions. `npx vitest run tests`: 155 tests pass.
- [x] Spacecraft models (9), test page `dev/spacecraft/`.
- [x] Body textures: 38 files from mission data (D28, D39, D40). The list is in `docs/ASSETS.md`.
- [x] Body rendering module (`src/render/bodies`), test page `dev/bodies/`.
- [x] File formats (`src/engine/io`): OEM, OPM, STK, GMAT script, CSV, JPL Horizons table, mission file.
- [x] Engine additions: Tisserand graph, maneuver search in a table, targeter, provenance of numbers, worker.
- [x] Application frame: store, i18n, routing, shared components.
- [x] Expert mode screens: Mission, Ephemeris, Transfer, Windows, Tour, Maneuvers, Propagation, Files, Accuracy, Glossary.
- [ ] 3D scene (`src/render/scene`) and its use in the two modes.
- [ ] Explorer mode screens (`src/explorer`): Home, Famous, Make, Flight.
- [ ] About screen (`src/app/About.tsx`): sources, licenses, scale rules of the view.
- [ ] STE check (`npm run lint:ste`) and its record (`docs/STE_CHECK.md`).
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
- Cause of the difference between JPL Horizons spacecraft tables relative to the barycenter and relative to a planet (D36).
- Dates and sizes of the Cassini maneuvers that the maneuver search finds: no primary document was compared.
- Other browsers and graphics cards than Chrome on this computer.
- Some sizes of the spacecraft models (`docs/ASSETS.md`).

## Known limits (list for the final report)

- No plan with a planet as the central body (tours of moons).
- No engine burn with a duration: all maneuvers are impulses.
- UTC before 1972 uses the fixed offset of 1972.

## How to continue

1. `cd ~/Desktop/test/apsis`
2. `npx vitest run tests` shows the state of the engine (about 2 minutes).
3. `npx vite --port 5310 --strictPort` starts the application. `node tools/shots/shots.mjs` then makes a picture
   of each screen in `shots/app/` and a list of the console errors.
4. Do the first item above that has no check mark.

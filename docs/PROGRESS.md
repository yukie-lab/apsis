# Progress log

Read this file first when the work starts again after an interruption.

## State (update at each step)

- [x] Project created (`package.json`, Python tools in `tools/.venv`).
- [x] Kernels downloaded to `data-src/kernels/` (not in git; checksums in `docs/SOURCES.md`).
- [x] `tools/ephem/build_ephem.py` -> `public/data/ephem.bin`.
- [ ] `tools/truth/fetch_truth.py` -> `truth/horizons/*.json` (in progress).
- [ ] Engine and tests.
- [ ] Expert mode screens.
- [ ] Explorer mode screens.
- [ ] Import and export.
- [ ] STE check.
- [ ] Screenshots checked.
- [ ] Production build.
- [ ] Final report (Japanese): `docs/FINAL_REPORT_ja.md`.

## How to continue

1. `cd ~/Desktop/test/apsis`
2. `npm test` shows the state of the engine.
3. Do the first item above that has no check mark.

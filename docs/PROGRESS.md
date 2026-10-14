# State of the work

Read this file first when the work starts again after a stop.

- Decisions and their reasons: `docs/DECISIONS.md`.
- Measured accuracy, items with no check and limits of the models: `docs/VALIDATION.md`.
- Sources and licenses: `docs/ASSETS.md`.
- Report of the completed work (in Japanese): `docs/FINAL_REPORT_ja.md`.

## State on 2026-10-14

### Completed parts

| Part | Files |
|------|----------|
| Engine: time scales, frames, ephemeris, two-body orbits, Lambert solver, flybys, plans, optimizers, propagation, targeter, Tisserand graph, maneuver search | `src/engine` |
| Data of the engine: positions of the bodies, constants, leap seconds | `public/data`, tools in `tools/ephem` |
| Reference data: JPL Horizons tables and published values with their sources | `truth` |
| Automatic tests of the engine and of the texts | `tests` |
| File formats: CCSDS OEM and OPM, STK ephemeris, GMAT script, CSV, JPL Horizons table, mission file | `src/engine/io`, `docs/IO_FORMATS.md` |
| Expert mode: Mission, Ephemeris, Transfer, Windows, Tour, Maneuvers, Propagation, Files, Accuracy and Glossary screens | `src/expert` |
| Explorer mode: start screen, actual missions, flight screen | `src/explorer` |
| 3D view: bodies, rings, spacecraft models, flight path, automatic camera | `src/render` |
| About screen: data of the user, rules of the 3D view, sources and licenses | `src/app/About.tsx` |
| Texts: one directory for each language, glossary, check of the English texts | `src/i18n`, `tools/ste`, `docs/STE_CHECK.md` |
| Record of the accuracy checks (the command `npm run report` writes it) | `docs/VALIDATION.md` |
| Comparison with other tools | `docs/COMPARISON.md` |
| Pictures of all screens with automatic checks | `tools/shots` |

### Parts in work

The file `docs/FINAL_REPORT_ja.md` gives the state of each condition of the specification at the end of the work.

## How to do the checks again

Do these commands in the project directory.

| Command | Result |
|---------|--------|
| `npm install` | Puts the libraries into `node_modules/`. |
| `npm test` | Does all automatic tests and writes the measured values to `src/validation/measured/`. |
| `npm run report` | Writes `docs/VALIDATION.md` from the measured values. |
| `npm run lint:ste` | Does the check of the English texts. |
| `npm run check:language` | Does a check of the application with a second language. Do not do it at the same time as a different command of this table. |
| `npm run build` | Does the type check and writes the application to `dist/`. |
| `npm run preview` | Starts a local web server for `dist/`. |
| `npm run shots` | Makes a picture of each screen in `shots/app/` and writes the list of the problems. |

The command `npm run shots` uses the address `http://localhost:5310/`. Start the application at that address first, or give a different address with the option `--base`.

## Files that are not in `git`

The directory of the project has these files, but `git` does not have them.

| Directory | Files | How to get the files again |
|-----------|----------|----------------------------|
| `data-src/kernels/` | The four NAIF kernels (the data of the scripts in `tools/ephem`). | `data-src/reference-copies.json` gives the address and the SHA-256 of each kernel. |
| `data-src/textures/original/` | The source files of the maps. | Do `python3 -I tools/textures/build_textures.py --fetch-missing`. The script compares the SHA-256 of each file with `data-src/textures/sources.json`. |
| `data-src/evidence/`, `data-src/textures/evidence/`, `data-src/factsheets/`, `truth/published/*.html`, and the directories `ccsds`, `gmat`, `sana` and `stk` in `data-src/specs/` | Local copies of documents and pages of other sources (decision D79). | `data-src/reference-copies.json` gives the address, the size and the SHA-256 of each copy. |

The application and the automatic tests do not use these files.
Only the scripts in `tools/` use them.

## How to continue the work

1. Read `docs/FINAL_REPORT_ja.md`: it gives the items that the work did not complete.
2. Do `npm test`. All tests must give a good result before a change.
3. Make the change. Record each new design decision in `docs/DECISIONS.md`.
4. Do the checks of the table above again.

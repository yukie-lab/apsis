# State of the work

Read this file first when the work starts again after a stop.

- Decisions and their reasons: `docs/DECISIONS.md`.
- Measured accuracy, items with no check and limits of the models: `docs/VALIDATION.md`.
- Sources and licenses: `docs/ASSETS.md`.
- Report of the completed work (in Japanese): `docs/FINAL_REPORT_ja.md`.
- User manual, how to make it again and the results of its checks: `docs/MANUAL.md`.

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
| Japanese texts of all screens and of the glossary, with a test that each English text has a Japanese text | `src/i18n/locales/ja`, `tests/i18n.test.ts` |
| Music that the code makes, with a button in the top bar | `src/app/music.ts`, `tests/music.test.ts` |
| Button on the About page that opens the user manual, and a copy of the manual in `dist/manual/` | `src/app/About.tsx`, `vite.config.ts` |
| Record of the accuracy checks (the command `npm run report` writes it) | `docs/VALIDATION.md` |
| Comparison with other tools | `docs/COMPARISON.md` |
| Pictures of all screens with automatic checks | `tools/shots` |
| User manual: a page in English and in Japanese with figures, pictures of the screens in the two languages and four videos with narration and subtitles | `manual`, `tools/manual`, `docs/MANUAL.md` |

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
| `npm run check:language` | Does a check of the application with a test language. Do not do it at the same time as a different command of this table. |
| `npm run build` | Does the type check and writes the application to `dist/`. |
| `npm run preview` | Starts a local web server for `dist/`. |
| `npm run shots` | Makes a picture of each screen in `shots/app/` and writes the list of the problems. |
| `npm run manual:check` | Opens the user manual in Google Chrome and does the checks of the page (`docs/MANUAL.md`, section 4.3). |

The command `npm run shots` uses the address `http://localhost:5310/`. Start the application at that address first, or give a different address with the option `--base`.

## Files that are not in `git`

The directory of the project has these files, but `git` does not have them.

| Directory | Files | How to get the files again |
|-----------|----------|----------------------------|
| `data-src/kernels/` | The four NAIF kernels (the data of the scripts in `tools/ephem`). | `data-src/reference-copies.json` gives the address and the SHA-256 of each kernel. |
| `data-src/textures/original/` | The source files of the maps. | Do `python3 -I tools/textures/build_textures.py --fetch-missing`. The script compares the SHA-256 of each file with `data-src/textures/sources.json`. |
| `data-src/evidence/`, `data-src/textures/evidence/`, `data-src/factsheets/`, `truth/published/*.html`, and the directories `ccsds`, `gmat`, `sana` and `stk` in `data-src/specs/` | Local copies of documents and pages of other sources (decision D79). | `data-src/reference-copies.json` gives the address, the size and the SHA-256 of each copy. |
| `tools/manual/node_modules/` | The packages of the manual tools. | Do `npm ci --prefix tools/manual`. |
| `tools/manual/.cache/hf/` | The voice model and the speech recognition model (1.2 GB). | Do the first commands of `docs/MANUAL.md`, section 3. |
| `tools/manual/.out/` | The data, the pictures, the narration and the videos that the manual tools made. | Do `npm run manual` (`docs/MANUAL.md`, section 3). |

The application and the automatic tests do not use these files.
Only the scripts in `tools/` use them.

## How to continue the work

1. Read `docs/FINAL_REPORT_ja.md`: it gives the items that the work did not complete.
2. Do `npm test`. All tests must give a good result before a change.
3. Make the change. Record each new design decision in `docs/DECISIONS.md`.
4. Do the checks of the table above again.

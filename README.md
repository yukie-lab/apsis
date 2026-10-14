# Apsis

Apsis is a tool for the design of trajectories in the solar system. It is a web application that has only files:
a web server sends the files, and the browser does all calculations. The application uses no server program,
no service of a different computer and no user account.

## The two modes

- **Explorer mode.** You select a destination, and the application calculates a flight and shows it in a 3D view.
  You can also fly the mission of an actual spacecraft again. The view has the actual sizes and the actual distances.
- **Expert mode.** You make the first design of a mission: positions of the bodies, transfers, launch windows,
  tours with flybys, maneuvers, propagation in a force model with many bodies, and files for other programs.
  The Accuracy screen shows the measured error of each type of number.

The two modes use one engine and one mission. A change of the mode keeps the mission.

## User manual

Open `manual/index.html` in a web browser. A web server is not necessary.
The manual has text in English and in Japanese, figures, pictures of the screens and four videos with subtitles.
The document `docs/MANUAL.md` tells how the project makes the manual, and gives the results of its checks.

## Necessary software

- Node.js and npm. The project did all its checks with Node.js 26.4 on macOS. Other versions have no check.
- Google Chrome, only for the tool that makes pictures of the screens.
- Python 3, only if you make the data files again (`tools/ephem`, `tools/textures`, `tools/truth`).

## Commands

Do these commands in the project directory.

| Command | Result |
|---------|--------|
| `npm install` | Puts the libraries into `node_modules/`. |
| `npm run dev` | Starts a local web server for the work on the code. |
| `npm test` | Does all automatic checks. On the computer of the project, the time is approximately 1 minute. |
| `npm run report` | Writes `docs/VALIDATION.md` from the values that the automatic checks measured. |
| `npm run lint:ste` | Does the check of the English texts (see `docs/STE_CHECK.md`). |
| `npm run check:language` | Does a check of the application with a second language (Google Chrome is necessary). |
| `npm run build` | Does the type check and writes the application to `dist/`. |
| `npm run preview` | Starts a local web server for `dist/`. |
| `npm run shots` | Makes a picture of each screen (start the application first). |

## How to put the application on a web server

1. Do `npm run build`.
2. Put a copy of all files and directories of `dist/` into a directory of a web server.

All paths in the application are relative. Thus the application also works in a directory below the root of the server.
A browser cannot open `dist/index.html` as a local file: use a web server (for example `npm run preview`).
The application gets only its files from the web server. It sends no data.

## Directories

| Directory | Description |
|-----------|-------------|
| `src/engine` | Time scales, frames, ephemeris, two-body orbits, Lambert solver, flybys, plans, propagation, file formats. |
| `src/app` | State of the application, routes, long calculations, method and limit of each number. |
| `src/expert` | Screens of the Expert mode. |
| `src/explorer` | Screens of the Explorer mode. |
| `src/render` | 3D view, bodies, spacecraft models. |
| `src/i18n/locales` | All texts of the user interface. One directory for each language. |
| `src/validation/measured` | Values that the automatic checks measured. The Accuracy screen shows these files. |
| `tests` | Automatic checks. |
| `truth` | Reference data: JPL Horizons, published values and their sources. |
| `data-src` | Source data and the record of each file that the project got from a server. |
| `tools` | Tools that make the data files, the checks of the texts, the pictures of the screens and the user manual. |
| `manual` | The user manual (`manual/index.html`) with its pictures and videos. |
| `public` | Data files and maps that the application loads. |
| `docs` | Documents. |

## Documents

| File | Description |
|------|-------------|
| `docs/FINAL_REPORT_ja.md` | Report of the completed work (in the Japanese language). |
| `docs/VALIDATION.md` | Each check, its reference, the measured value and the items that have no check. |
| `docs/DECISIONS.md` | Each design decision and its reason. |
| `docs/COMPARISON.md` | Limits of other tools and the points where Apsis is better. |
| `docs/ASSETS.md` | Source and license of each data file, each map and each library. |
| `docs/IO_FORMATS.md` | File formats that the application reads and writes. |
| `docs/STE_CHECK.md` | Method and result of the check of the English texts. |
| `docs/PROGRESS.md` | State of the work and how to continue it. |
| `docs/MANUAL.md` | How the project makes the user manual, and the results of its checks. |

## How to add a language

1. Make a directory `src/i18n/locales/<code>/`, where `<code>` is the code of the language (for example `ja`).
2. Put a copy of the JSON files of `src/i18n/locales/en/` into it.
3. In `00-meta.json`, write the code and the name of the language.
4. Write each text in the new language. Do not change the keys and the parts in braces (for example `{name}`).

No change to the code is necessary. The control for the language shows in the application when there are two languages.
A text that a language does not have shows in English.

Two groups of texts are in data files, in English: the reference of each measured value (Accuracy screen) and the
changes of each map (About screen). A language can give these texts with the keys `validation.truth.<id>` and
`about.maps.changeText.<id>`. In the `<id>` of a measured value, write `_` for each point.
The titles, the credits and the licenses of the maps are names from the sources: the application shows them with no change.
The files that the application writes for other programs have English comments in all languages.

The command `npm run check:language` does a check of these rules (`tools/i18n/second-language.mjs`). The tool makes
a test language, operates the application with the two languages, and then removes the test language.
The automatic checks (`tests/i18n.test.ts`) examine the keys of each language.

## Licenses

- Data, maps and libraries: `docs/ASSETS.md`. The About screen of the application shows the same list.
- The command `npm run build` writes the license texts of the libraries to `dist/licenses.txt`.
- The owner of the project did not select a license for the code of the project.

# User manual

The user manual of Apsis is the page `manual/index.html`. It has these parts:

- Text in English and in Japanese. A control at the top right of the page changes the language.
- 14 figures. The engine of Apsis calculated each orbit, each flight path and each number in them.
- 22 pictures of the screens of Apsis 1.0.0. Numbers on a picture show the parts of the screen. The list below the picture gives the same numbers.
- 4 videos with an English narration. Each video has Japanese subtitles and English subtitles.

Date of this record: 2026-10-14.

## 1. How to open the manual

1. Open the file `manual/index.html` in a web browser. A web server is not necessary.
2. To change the language, click "English" or "日本語" at the top right of the page.

The browser keeps the language for the next time. The address `manual/index.html?lang=ja` opens the page in Japanese.

The page gets only the files in `manual/`. It sends no data, and it uses no service on the internet.

## 2. Videos

| Video | Title | Length | Contents |
|---|---|---|---|
| 1 | Apsis in three minutes | 2:11 | The two modes, the calculation of a flight to Mars and the actual missions. |
| 2 | Orbits | 2:44 | The shapes of orbits, the speed on an ellipse and the six orbit elements. |
| 3 | Transfers and launch windows | 2:12 | The problem of Lambert, the launch energy C3 and the map of launch dates. |
| 4 | Flybys | 2:15 | The turn of a flyby and the gravity assists of Voyager 2. |

The videos are MP4 files (H.264 and AAC) in `manual/video/`.

- The voice is the speech model Kokoro-82M (voice af_heart). The model operates on the computer of the project. No service on the internet got the text.
- The page shows the subtitles in the language of the page. The menu of the video player can change them.
- The page contains the subtitles, and its script adds them to the videos. A browser does not let a local page read a subtitle file.
- The files `manual/video/*.vtt` and `manual/video/*.srt` have the same subtitles for other video players. The MP4 files have no subtitles.

## 3. How the project makes the manual

The manual is in `git`, thus these steps are necessary only after a change.

Necessary software: Node.js, Google Chrome, FFmpeg with x264 (the programs `ffmpeg` and `ffprobe`) and `cwebp`.

Do these commands one time, in the project directory:

| Command | Result |
|---|---|
| `npm ci --prefix tools/manual` | Puts the packages of the manual tools into `tools/manual/node_modules/`. |
| `node tools/manual/narration/speak.mjs --download` | Downloads the voice model into `tools/manual/.cache/hf/` and makes the narration. |
| `node tools/manual/narration/check.mjs --download` | Downloads the speech recognition model and does the check of the narration. |

Then do these commands, in this sequence:

| Command | Result |
|---|---|
| `npm run manual:data` | The engine calculates the data of the figures and of the videos (`tools/manual/.out/data/`). |
| `npm run manual:shots` | Makes the files of the application and the pictures of its screens (`tools/manual/.out/shots/`). |
| `npm run manual:voice` | Makes the narration and the subtitles, and does the check of the narration (`tools/manual/.out/audio/`, `tools/manual/.out/subs/`). |
| `npm run manual:video` | Makes the four videos (`tools/manual/.out/video/`). |
| `npm run manual:build` | Makes `manual/index.html`, `manual/img/` and `manual/video/`, and does the check of the English text (section 4.1). |
| `npm run manual:check` | Opens the manual in Google Chrome and does the checks of section 4.3. |

The command `npm run manual` does all six commands. The directory `tools/manual/.out/` is not in `git`.

### 3.1 Files

| File | Contents |
|---|---|
| `tools/manual/page/content.mjs` | The English text and the Japanese text of the page. |
| `tools/manual/page/figures.mjs` | The figures. |
| `tools/manual/video/scripts/v1.json` to `v4.json` | The narration and the subtitles of each video. |
| `tools/manual/video/src/scenes/` | The code that makes the pictures of each video. |
| `tools/manual/data/manual-data.spec.ts` | The script that calculates the data with the engine of Apsis. |
| `tools/manual/values.mjs` | The numbers in the texts. They come from the data. |

Each number, orbit and flight path in the figures and in the videos comes from the engine of Apsis. No person wrote these numbers.

## 4. Checks and results

### 4.1 English text (ASD-STE100)

The instruction of the owner: approximately 80 % of the English text must obey ASD-STE100.
The project measures this value with its tool `tools/ste/ste-lint.mjs` (`docs/STE_CHECK.md`).
The command `npm run manual:build` gives each English sentence and each heading of the page to the tool.
The result is the part of the sentences for which the tool has no finding. The narration of the videos has a separate result.

| Text | Sentences | No finding | Without the names of the manual | With unit words |
|---|---|---|---|---|
| Page | 280 | 260 (93 %) | 241 (86 %) | 260 (93 %) |
| Narration | 133 | 85 (64 %) | 84 (63 %) | 97 (73 %) |

- "Without the names of the manual": the result if the tool did not know the names that this work added to `tools/ste/technical-names.json` (examples: "video", "subtitle", "Kokoro").
- "With unit words": the result if the tool accepted unit names as words (example: "kilometers per second"). The narration contains the unit names as words, because the voice cannot read unit symbols.

Most findings of the page are words that are not in the lists of the tool. Examples: "what", "few", "simple", "watch", "here", "fast".
Most findings of the narration are the word "per" of the unit names, and the words "here", "look" and "escape".

The page and the narration are not in the full check of `npm run lint:ste`, because some findings stay in them.

### 4.2 Narration

Speech recognition (the model `Xenova/whisper-small.en`) made a text from the narration of each video. The tool compared that text with the script.

| Video | Words | Word error rate |
|---|---|---|
| 1 | 290 | 3.1 % |
| 2 | 394 | 1.5 % |
| 3 | 321 | 1.9 % |
| 4 | 303 | 1.0 % |
| All | 1308 | 1.8 % (24 words) |

### 4.3 Page

The command `npm run manual:check` opens the manual in Google Chrome four times: on a computer screen (1440 x 1800 pixels) and on a phone screen (390 x 844 pixels), each in English and in Japanese.
It finds these problems:

- An error of the page, or a request to a server.
- A file of the page that is not in `manual/`, or a picture that does not load.
- Text that is wider than the screen.
- Text of the other language on the screen, or a picture with a text of the other language.
- A link to a part that is not in the page.
- A video that does not load, or a subtitle that does not show at its time.
- A language control that does not change the page, the subtitles or the language that the browser keeps.
- A number on a picture that is on a different number, or a number that goes out of the picture.
- A full picture that does not open or does not close.

On 2026-10-14, the result was no problem. The tool also writes pictures of the pages to `tools/manual/.out/check/`. The author examined these pictures.

## 5. Limits

- The STE tool uses the word lists of the project, not the official ASD-STE100 dictionary. No person did a check of the text with the official rules.
- No tool examined the Japanese text. The author of the Japanese text is the same AI model as the author of the English text.
- The voice comes from a speech model. The speech recognition finds incorrect words. It cannot find all problems of the speech. No person examined the speech of the videos for this record.
- The project examined the manual only in Google Chrome on macOS. The phone screen of section 4.3 is a size of the browser, not an actual phone.
- The pictures show the application on 14 October 2026. The Explorer mode starts at the time of the computer. Thus the screens of the user show different dates and positions.
- The subtitles show on the lower part of the video. Thus they can be on a part of a figure for some seconds. The subtitle button of the video player removes them from the video.
- A video player that cannot use the script of the page shows no subtitles. The subtitle files are in `manual/video/`.

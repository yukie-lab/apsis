# Check of the English text for ASD-STE100

All English text of Apsis must obey ASD-STE100 (Simplified Technical English, STE). This document is the record of the check of that text.

Date of this record: 2026-10-14.

## 1. Read this first

- The official ASD-STE100 specification and its dictionary were not available.
- The word lists of the tool are project lists. The author made them from memory of STE. No person compared them with the official dictionary.
- The author of the tool, of the lists and of the corrections is an AI model. The same AI model read the texts. No person examined the texts or the lists.
- A result with no findings does not show that a text obeys ASD-STE100. It shows only that the tool found no word that is not in the project lists. It also shows that the tool found no problem with the writing rules of section 3.2.

## 2. Texts of this record

The tool examines these texts:

- The locale files in `src/i18n/locales/en/`: all text of the screens, of the help and of the glossary. The comments in the files for other programs also come from these files.
- The reference text of each measured value (the field `truth` in `src/validation/measured/*.json`). The Accuracy screen shows these texts.
- The changes of each map (the field `changes` in `public/textures/manifest.json`). The About screen shows these texts.
- `README.md` and the documents in `docs/`. The tool does not examine a document with a name that ends with `_ja.md`, because its text is Japanese.

The author corrected all these texts. At the date of this record, the tool gives no finding for them (section 5.1).

The tool does not examine these texts:

- The cells of the columns Title and Credit of the table of maps in `docs/ASSETS.md`. Each cell is the title of a source file or the credit line of its source. These texts are names and texts from the sources. The About screen shows the same titles and credit lines.
- The other fields of `public/textures/manifest.json` (examples: `note`, `licenceStatement` and `longitudeNote`). These fields are the records of the work on the maps, and they contain text from the pages of the sources. The application does not show them.
- The comments in the source code and in the scripts.
- The test page `dev/bodies/`. The files of the application do not contain it.
- A small number of labels in the source code (example: the label "B·T").
- The license texts of the libraries in `dist/licenses.txt`. These texts come from the libraries.
- The English text of the user manual (`manual/index.html`) and the narration of its videos. Some findings stay in these texts. The command `npm run manual:build` gives them to the tool separately and writes the part of the sentences with no finding (`docs/MANUAL.md`, section 4.1).

## 3. Checks that the tool does

The tool is `tools/ste/ste-lint.mjs`. It is a script for Node.js. It uses no other packages.

### 3.1 Words

The tool compares each word of each text with the lists of this table. A word that is in no list is a finding.

| List | Description |
|---|---|
| `tools/ste/approved-words.txt` | The approved words of the project that are not technical names, each with its parts of speech. |
| `tools/ste/not-approved.json` | The words that are not approved. Each word has the alternative that the tool shows. The file also has the list of spelling that is not American. |
| The glossary (`src/i18n/locales/en/90-glossary.json`) | Each glossary term is a technical name. An entry with a definition that starts with "To" is a technical verb. |
| `tools/ste/technical-names.json` | The technical names and the technical verbs that are not glossary entries. |
| `tools/ste/exceptions.json` | The findings that stay, each with a written reason. |

Each group of names in `technical-names.json` has a category. The categories are the categories of rule 1.5 (technical names) and of rule 1.12 (technical verbs) of ASD-STE100. The author gave each group its category. The texts of the categories come from the memory of the author. No person compared them with the specification.

The file `not-approved.json` also has the vocabulary rules of the project (the entries with the source `policy`). Examples of these rules:

- Use "select". Do not use "choose".
- Use "show". Do not use "display" as a verb.
- Use "calculate". Do not use "compute".
- Use "is necessary" or "must". Do not use "need" or "require".

### 3.2 Writing rules

The first column has the name of the rule in the report of the tool.

| Rule | The tool finds |
|---|---|
| `unknown-word` | A word that is in no list. |
| `unknown-symbol` | A symbol that is not in the list of symbols. |
| `not-approved` | A word or a group of words from `not-approved.json`. A Latin abbreviation. The word "about" before a number. The word "sure" in a text that is not "make sure". |
| `spelling` | A spelling that is not American. |
| `part-of-speech` | A noun of the lists that is a verb in the sentence. |
| `passive` | A form of "be" and a past participle. |
| `perfect` | A form of "have" and a past participle. |
| `participle` | A past participle that is not an adjective. Examples: at the start of a text with no subject, or after a noun and before "by". |
| `ing-form` | A word that ends with "ing" and is not in the lists. |
| `contraction` | A contraction (example: "don't"). |
| `modal` | The modal verbs "should", "may", "might", "could", "would", "shall" and "ought". |
| `semicolon` | A semicolon. |
| `sentence-length` | An instruction with more than 20 words. A description with more than 25 words. |
| `paragraph-length` | A paragraph with more than 6 sentences. |
| `noun-cluster` | More than 3 nouns in sequence. |
| `text-end` | A text of two or more sentences with no full stop at its end. A full sentence with no full stop. An exclamation mark. A glossary term with a full stop. A text with a comma at its end. A text with a full stop at its end and no capital letter at its start. An empty text. |
| `placeholder` | A brace that is not a part of a correct placeholder. |
| `balance` | Parentheses, brackets or quotation marks that are not in pairs. The tool does not do this check in table cells. |
| `spacing` | A space at the start or at the end of a text. Two spaces in sequence. A space before a comma, a colon or a full stop. |

### 3.3 Count of the words of a sentence

The limits are 20 words for an instruction and 25 words for a description. The tool counts the words with these rules:

- A full stop, a question mark or an exclamation mark is the end of a sentence.
- A colon or a dash is the end of a part of a sentence. The tool counts the part before it and the part after it as two sentences.
- The tool counts a text in parentheses as a new sentence. Its words are not in the count of the sentence around it.
- A text in quotation marks is one word.
- A number is one word. A placeholder is one word. A code text, a file name, a path and an address are one word each.
- A unit symbol after a number is one word: "20 km" has two words.
- Each part of a word with hyphens is one word. A prefix (examples: "semi", "non") is the only part that the tool does not count.

The author made these rules from memory of the specification. The author does not know if the specification counts each part of a word with hyphens. The tool uses the larger count. Thus, for these words, the count of the tool is not smaller than the count of the specification.

For the tool, a sentence is an instruction if it starts with a command. A command starts with a verb, with "Do not" or with "Make sure". The tool also finds a command after a first clause and a comma (example: "If the list is empty, add a row."). All other sentences are descriptions.

### 3.4 Texts that the tool reads

- Locale files: each value in the `text` object, and each term and each definition in the `glossary` object. The report gives the file and the key of each finding.
- Files of data: the field `truth` of each item in `src/validation/measured/*.json`, and the field `changes` of each map in `public/textures/manifest.json`. The report gives the file and the item of each finding. Two items with the same text are one text.
- Markdown documents: headings, paragraphs, list items and table cells. The report gives the file and the line of each finding.
- The tool does not examine code blocks. A code text in a line, a file name, a path and an address are one word each. The tool does not examine the characters in them.
- The tool does not examine the words in quotation marks. Thus a sentence can have a keyword of a file format or a text of a different program.
- The tool does not examine the cells of the table columns that the field `nameColumns` of `technical-names.json` gives. It counts these cells. Its output and its report give the number.
- A full stop at the end of a heading or of a table cell is not necessary.

### 3.5 Exceptions

A finding can stay if `exceptions.json` has an entry for it. Each entry has the file, the key or a part of the text, the rule, and a written reason. The tool shows the number of exceptions. If an exception agrees with no finding, the result of the tool is a failure.

## 4. Checks by a reader

The author of the tool (the AI model of section 1) corrected the texts in two steps.

- First step: the locale files `10-common.json` to `37-files.json`, the glossary and `docs/IO_FORMATS.md`. The reader read all these texts one time after the corrections. A script compared the changed locale files with the files before the corrections. The keys and their sequence are the same. Each changed value has the same placeholders and the same numbers as before. A second script compared the numbers of `docs/IO_FORMATS.md` before and after the corrections: they are the same.
- Changes after the first step: some texts of the first step changed later (new texts and corrections). The reader read each of these changes at the time of the change.
- Second step: all other texts of section 2. The reader read each changed text and the text before the change, at the time of the change. After the last corrections, the reader read all these texts again one time. The reader found two numbers that were not the measured values, and corrected them. No script compared the numbers before and after the corrections.
- Last check of the numbers: after all corrections, the reader compared the numbers of measured results with the files in `src/validation/measured/` and with the code. The texts of this check were the locale files and `docs/COMPARISON.md`. Five texts had a value that was smaller than the measured value (for example 0.03 ms for the measured value 0.0311 ms). Two limits in `docs/COMPARISON.md` were smaller than the measured maximum (for example 0.97 % for 0.9706 %). One text had a value that was not the value in the code (TAI − UTC before 1972). One text gave a limit as an approximate value (the error of the GMAT axes at 1 au).
- Corrections after the last check: the reader corrected these texts. The reader also changed other values with one digit to the measured values with two or three digits. These other values were not incorrect.

The reader examined the texts for these problems:

- A changed text with a meaning that is different from the meaning before the change. The meaning includes the numbers, the limits and the methods.
- An instruction that is not a command.
- A sentence with more than one topic.
- Two names for one object or for one quantity.

The reader made no list of the results. This is not a full check of these rules. No person read the texts for this record.

## 5. Results

### 5.1 Counts after the corrections

| Files | Texts | Sentences | Words | Findings | Exceptions |
|---|---|---|---|---|---|
| Locale files (16 files) | 1732 | 2162 | 15168 | 0 | 0 |
| Files of measured values (13 files) | 110 | 134 | 1774 | 0 | 0 |
| `public/textures/manifest.json` | 34 | 101 | 1889 | 0 | 0 |
| `README.md` | 102 | 132 | 888 | 0 | 0 |
| Documents in `docs/` (8 files) | 3368 | 4473 | 32786 | 0 | 0 |
| Total | 5346 | 7002 | 52505 | 0 | 0 |

A text is one value of a locale file or one text of a file of data. In a document, a text is one heading, paragraph, list item or table cell. The count of words does not include numbers, placeholders and code texts. These texts have 1589 different words. 70 of them are forms of the words with a question mark (section 5.3). The tool did not examine 76 table cells of `docs/ASSETS.md` (section 2).

The command `npm run lint:ste` gives the exit code 0 for these files.

### 5.2 Findings before the corrections

The author made the lists during the work. Each word of the texts went into a list, or the author replaced the word. Thus the counts of the tool changed during the work.

The counts of this table come from the tool and the lists at the end of the first step. The texts of this check are the texts before the corrections (the version `21ae6d9` in `git`).

| Rule | 11 locale files | `docs/IO_FORMATS.md` |
|---|---|---|
| `unknown-word` | 334 | 191 |
| `not-approved` | 19 | 52 |
| `spelling` | 0 | 32 |
| `participle` | 20 | 4 |
| `passive` | 9 | 0 |
| `perfect` | 1 | 0 |
| `ing-form` | 4 | 2 |
| `modal` | 1 | 1 |
| `part-of-speech` | 4 | 1 |
| `sentence-length` | 8 | 0 |
| `text-end` | 4 | 2 |
| Total | 404 | 285 |

The corrections of the first step:

- Glossary: the author added 35 entries for technical names that the glossary did not have. These new entries removed 290 of the 334 `unknown-word` findings of the locale files. They also removed 38 of the 191 `unknown-word` findings of `docs/IO_FORMATS.md`.
- Locale files: the author changed 110 values. 18 of these values are glossary definitions.
- `docs/IO_FORMATS.md`: the author changed approximately 200 of the 753 lines.
- No key of a locale file changed.

At the end of the first step, the tool gave these counts for the texts of the second step:

| File | Findings |
|---|---|
| `src/i18n/locales/en/38-scene.json` | 16 |
| `src/i18n/locales/en/39-explorer.json` | 32 |
| `src/i18n/locales/en/40-picture.json` | 59 |
| `docs/ASSETS.md` | 1167 |
| `docs/DECISIONS.md` | 281 |
| `docs/PROGRESS.md` | 59 |
| The 107 texts of `src/validation/measured/*.json` | 133 |

The texts of these files changed during the second step, and the lists also changed. Thus do not compare these counts with the counts of section 5.1.

In the second step, the author added technical names to `technical-names.json`. Examples: the names of the parts of spacecraft, the terms of the maps and of the pictures, and the names of documents and services. The author also added words to `approved-words.txt` (section 5.3).

### 5.3 Exceptions and words with a question mark

- `exceptions.json` has no entry. No finding stays.
- The approved list has 320 words. For 44 of them, the author does not know if the official dictionary has the word in that part of speech. These words have a question mark in `approved-words.txt`. Examine these words first when the official dictionary is available.

The words with a question mark:

```
accept (v), bend (v), bright (adj), calculation (n), category (n), comparison (n), correction (n),
count (v), decision (n), definition (n), detail (n), early (adj), event (n), exactly (adv), flag (n),
fly (v), form (n), goal (n), independent (adj), install (v), language (n), late (adj), loss (n),
none (pron), now (adv), official (adj), old (adj), pair (n), picture (n), price (n), project (n),
publish (v), reason (n), reference (n), selection (n), send (v), separate (adj), separately (adv),
size (n), strong (adj), symbol (n), total (n, adj), without (prep), yes (adv)
```

### 5.4 Texts to examine again

It is possible that the meaning of these texts is not the same as before the correction. Examine them again.

```
10-common.json      error.not-ready, common.previous
20-basis.json       validation.item.quick_solved
31-accuracy.json    page.accuracy.tests.intro, validation.unverified.browsers.text,
                    validation.unverified.models3d.text
32-plan.json        page.windows.intro
34-mission.json     page.mission.origins.plan, page.mission.origins.manual,
                    page.mission.residual, page.mission.timeDiff
35-maneuvers.json   basis.flight.target.limit, page.maneuvers.wanted
36-propagation.json page.propagation.anchorNote, page.propagation.toleranceWhole
37-files.json       page.files.gmatAxesNote, page.files.checkBad, page.files.checkGood,
                    page.files.searchIntro, validation.limits.horizonsCenter.text
90-glossary.json    maneuver, specificImpulse, leapSecond, flyby, asymptote
docs/IO_FORMATS.md  the definitions in the introduction; sections 2.1, 3.1, 3.2, 5.1, 5.4,
                    6.1, 6.2, 8.2, 9, 11 and 13
```

All texts of the second step are also texts to examine again (section 4).

## 6. Limits of the check

- The lists are not the official dictionary (section 1). It is possible that a word of the approved list is not an approved word of ASD-STE100.
- The tool does not examine the meaning of a word. In ASD-STE100, each approved word has one approved meaning. A word of the approved list with a different meaning in the text is not a finding.
- The tool knows the part of speech of a word from the lists only. It finds a noun that is a verb in some sentence forms, not in all.
- The checks of the passive voice, of the participles and of the instructions use the words near a word. They do not examine the full sentence. They can give an incorrect finding. They can also give no finding for a sentence that does not obey a rule.
- The tool counts a group of nouns only if the lists have each word as a noun and as no other part of speech.
- The tool does not examine some rules of ASD-STE100. Examples: one topic for each sentence, one instruction for each sentence, the use of articles, the form of warnings.
- The tool examines each text of a locale file as a separate text. On the screen, the application shows some texts as parts of one text (a placeholder gets a different text). The tool does not examine the result.
- The tool does not examine the texts of section 2 that are not in its list. It does not examine pictures.

## 7. How to do the check

Do these commands in the project directory.

```
npm run lint:ste                                   all texts of section 2
node tools/ste/ste-lint.mjs docs/IO_FORMATS.md     all locale files and the given documents
node tools/ste/ste-lint.mjs --locales              only the locale files
node tools/ste/ste-lint.mjs --only <files>         only the given files
node tools/ste/ste-lint.mjs --summary              only the counts for each file
node tools/ste/ste-lint.mjs --help                 the list of the options
```

- The full check writes the report `tools/ste/report.json`. The report has no dates. Thus it changes only when the texts, the lists or the tool change. The option `--no-report` stops the report.
- The exit code is 0 if there is no finding. It is 1 if there are findings, or if an exception agrees with no finding. It is 2 if the tool cannot read its lists.
- The option `--words` shows each different word of the texts with the list that has the word.
- The option `--unused` shows the entries of the lists that the texts do not use.

If the tool gives a finding, do one of these steps:

1. Change the text. The message of the finding gives the alternative for a word that is not approved.
2. A technical name for orbits or trajectories goes into the glossary. Add an entry with the term and a short definition.
3. If the word is a different technical name, add it to a group of `technical-names.json` that has the correct category.
4. If the official dictionary has the word as an approved word, add it to `approved-words.txt` with its part of speech. If you do not have the dictionary, put a question mark before the word.
5. If the text cannot obey a rule and keep its meaning, add an entry to `exceptions.json` with the reason.

Do not use the words "STE compliant" or "verified" for a text that only this tool examined.

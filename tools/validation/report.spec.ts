/**
 * Writes docs/VALIDATION.md from the measured values of the automatic tests (src/validation/measured/*.json).
 * Use: npm test (writes the measured values), then npm run report.
 *
 * The texts of the checks, of the items with no check and of the limits are the texts of the Accuracy screen
 * (locale files). The fixed sentences of the document are in this file.
 */
import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { MEASUREMENTS, describeMeasurement, truthSource, measuredText, type Measurement } from '../../src/app/provenance';
import { UNVERIFIED, LIMITS } from '../../src/validation/lists';
import { t } from '../../src/i18n';

const OUT = new URL('../../docs/VALIDATION.md', import.meta.url).pathname;

/** The requirements of the specification and the checks that answer each of them. */
const REQUIREMENTS: { title: string; text: string; pick: (m: Measurement) => boolean; extra?: (list: Measurement[]) => string[] }[] = [
  {
    title: 'Positions of the bodies',
    text: 'The positions of the bodies agree with JPL Horizons. The product shows the measured errors.',
    pick: (m) => m.group === 'ephemeris',
  },
  {
    title: 'Exact solutions',
    text: 'The results agree with exact solutions: the Hohmann transfer, the two-body orbit, the Tisserand parameter and the B-plane of a hyperbola.',
    pick: (m) => m.group === 'analytic' || m.group === 'lambert',
  },
  {
    title: 'Time scales and frames',
    text: 'The time scales and the frames agree with JPL Horizons.',
    pick: (m) => m.group === 'time' || m.group === 'frames',
  },
  {
    title: 'Launch windows of actual missions',
    text: 'The launch energy and the launch dates of actual missions agree with the JPL Horizons trajectories and with a published launch period. The length of the flight path of four Mars missions agrees with the published distances.',
    pick: (m) => m.group === 'window',
    extra: launchPeriods,
  },
  {
    title: 'Actual missions with flybys',
    text: 'The application makes the flights of actual missions again from their dates. The flybys have no engine burn, and the flyby conditions agree with JPL Horizons and with published values.',
    pick: (m) => m.group === 'flyby',
  },
  {
    title: 'Propagation from the state of an actual spacecraft',
    text: 'The application propagates a state of an actual spacecraft or asteroid and measures the difference from the JPL Horizons trajectory.',
    pick: (m) => m.group === 'propagation',
  },
  {
    title: 'Files for other programs',
    text: 'The application reads the files that it writes, and it reads tables of JPL Horizons. These checks do not use the other programs.',
    pick: (m) => m.group === 'interchange',
  },
  {
    title: 'Solvers',
    text: 'The target of each solver is an input. These checks show that the solver gets to the target. They do not show that the models of the engine are correct.',
    pick: (m) => m.group === 'solver',
  },
];

/** The launch energy in the published launch period of each mission: values with no limit, from the details of the path checks. */
function launchPeriods(list: Measurement[]): string[] {
  const rows = list.filter((m) => /^window\.\w+\.distance$/.test(m.id) && m.detail);
  if (!rows.length) return [];
  const lines = ['### Launch energy in the published launch periods', ''];
  lines.push('The table shows the launch energy that the engine calculates for the published launch period of each mission. The arrival time is the published landing time.');
  lines.push('These values have no test limit: a project selects its launch period with more conditions than the launch energy.');
  lines.push('A published document about Mars Science Laboratory gives two limits of its launch period: the energy that the launch vehicle can give, and the entry velocity at Mars.');
  lines.push('The record of the sources is in `truth/published/published.json`.', '');
  lines.push('| Mission | Published launch period | C3 on the first day | C3 on the last day | Day of the minimum C3 | Days from the first day | Minimum in the period | Transfer angle on the first day | Transfer angle on the day of the minimum |');
  lines.push('|---------|-------------------------|--------------------:|-------------------:|-----------------------|------------------------:|-----------------------|--------------------------------:|-----------------------------------------:|');
  const notes: string[] = [];
  for (const m of rows) {
    const d = m.detail as Record<string, number | string>;
    const [first, last] = String(d.launchPeriod).split(' to ');
    const day = String(d.dayOfMinimumC3);
    const c3 = (v: number | string): string => `${Number(v).toFixed(1)} km²/s²`;
    lines.push(`| ${t('spacecraft.' + m.id.split('.')[1])} | ${first} to ${last} | ${c3(d.c3FirstDay)} | ${c3(d.c3LastDay)} | ${day} | ${d.minimumFromFirstDayDays} | ${day >= first && day <= last ? 'Yes' : 'No'} | ${Number(d.transferAngleFirstDayDeg).toFixed(0)}° | ${Number(d.transferAngleMinimumDeg).toFixed(0)}° |`);
    if (d.arrivalForTheLastDay !== String(d.arrival).slice(0, 10)) notes.push(`For ${t('spacecraft.' + m.id.split('.')[1])}, the C3 on the last day uses the published landing day for a launch at the end of the period (${d.arrivalForTheLastDay}).`);
  }
  lines.push('', 'The day of the minimum C3 is the launch day with the smallest launch energy for the published arrival time. The search goes from 60 days before the period to 60 days after it.');
  lines.push('The transfer angle is the angle about the Sun from the Earth at the launch to Mars at the arrival.');
  lines.push(...notes, '');
  return lines;
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const value = (text: string, unit: string): string => (unit ? `${text} ${unit}` : text);

function table(list: Measurement[]): string[] {
  const rows = ['| Check | Measured | Test limit | Reference |', '|-------|---------:|-----------:|-----------|'];
  for (const m of list) {
    const x = measuredText(m);
    rows.push(`| ${cell(describeMeasurement(m))} | ${value(x.value, x.unit)} | ${value(x.limit, x.unit)} | ${cell(truthSource(m))} |`);
  }
  return rows;
}

it('writes docs/VALIDATION.md', () => {
  const lines: string[] = [];
  const all = MEASUREMENTS;
  expect(all.length).toBeGreaterThan(200);
  const used = new Set<string>();

  lines.push('# Accuracy checks', '');
  lines.push('The command `npm run report` writes this file from the files in `src/validation/measured/`.');
  lines.push('The automatic tests (`npm test`) write those files. Do not change this file: the command writes it again.');
  lines.push('The Accuracy screen of the application shows the same values.', '');

  lines.push('## Rules', '');
  lines.push('- A reference value comes from one of three sources: an exact solution, a published document of a mission, or JPL Horizons. The column "Reference" gives the source of each check.');
  lines.push('- The output of the application is not a reference. The group "Solvers" is the only exception, and the text of that group gives the reason.');
  lines.push('- "Measured" is the largest error that the test measured.');
  lines.push('- "Test limit" is the limit of the automatic test. If the measured error is larger than the limit, the test result is a failure. A limit does not tell you the accuracy: the measured value is the result.');
  lines.push('- The record of each reference value is in the directory `truth/`: the text that JPL Horizons sent, and the address and the date of each published value.', '');

  lines.push('## Summary', '');
  lines.push('| Subject | Number of checks | Checks in the limit |', '|---------|-----------------:|--------------------:|');
  for (const r of REQUIREMENTS) {
    const list = all.filter(r.pick);
    const ok = list.filter((m) => (m.id === 'integrator.order' ? m.value >= m.limit : Math.abs(m.value) <= m.limit)).length;
    lines.push(`| ${r.title} | ${list.length} | ${ok} |`);
  }
  lines.push(`| All | ${all.length} | |`, '');
  lines.push('The check of the order of the integrator has a smallest permitted value, not a largest permitted error.', '');

  for (const r of REQUIREMENTS) {
    const list = all.filter(r.pick);
    for (const m of list) used.add(m.id);
    lines.push(`## ${r.title}`, '', r.text, '', ...table(list), '', ...(r.extra?.(list) ?? []));
  }
  // Each measured value is in one section.
  expect(all.filter((m) => !used.has(m.id)).map((m) => m.id)).toEqual([]);

  lines.push(`## ${t('page.accuracy.unverified.title')}`, '', t('page.accuracy.unverified.intro'), '');
  for (const id of UNVERIFIED) lines.push(`### ${t(`validation.unverified.${id}.title`)}`, '', t(`validation.unverified.${id}.text`), '');
  lines.push(`## ${t('page.accuracy.limits.title')}`, '', t('page.accuracy.limits.intro'), '');
  for (const id of LIMITS) lines.push(`### ${t(`validation.limits.${id}.title`)}`, '', t(`validation.limits.${id}.text`), '');

  writeFileSync(OUT, lines.join('\n'));
});

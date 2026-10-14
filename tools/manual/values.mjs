// Values for the texts of the manual and of the narration of the videos. All values come from the data files that
// tools/manual/data/manual-data.spec.ts writes (results of the engine of the application) and from the measured
// values of the application (src/validation/measured/famous.json, copied to accuracy.json). A text uses a value
// with {name}. A value is the same in the two languages, or it has an English and a Japanese form (dates).
//
// Use: const V = makeValues(data) with data = { planets, orbits, mars, 'quick-mars': quick, voyager2, missions, accuracy }.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fixed = (x, n) => x.toFixed(n);

/** A date "YYYY-MM-DD..." as English text ("14 October 2026") and as Japanese text ("2026年10月14日"). */
export function date(text) {
  const [y, m, d] = text.slice(0, 10).split('-').map(Number);
  return { en: `${d} ${MONTHS[m - 1]} ${y}`, ja: `${y}年${m}月${d}日` };
}
/** Month and year: "July 1979" and "1979年7月". */
export function monthYear(text) {
  const [y, m] = text.slice(0, 7).split('-').map(Number);
  return { en: `${MONTHS[m - 1]} ${y}`, ja: `${y}年${m}月` };
}

export function makeValues(D) {
  const { planets, orbits, mars, voyager2: v2, missions, accuracy } = D;
  const quick = D['quick-mars'];
  const row = (id) => {
    const r = accuracy.find((x) => x.id === id);
    if (!r) throw new Error('values: no measured value ' + id);
    return r.value;
  };
  const norm = (v) => Math.hypot(...v);
  const best = mars.arcs.find((a) => Math.abs(a.tofDays - mars.best.tofDays) < 1);
  // Search of the launch date of the first video: the lowest value of each launch window of the curve.
  const curve = quick.search.curve.filter((p) => p.dvKmS !== null);
  const half = quick.search.spanDays / 2;
  const lowA = curve.filter((p) => p.day < half).reduce((a, b) => (b.dvKmS < a.dvKmS ? b : a));
  const lowB = curve.filter((p) => p.day >= half).reduce((a, b) => (b.dvKmS < a.dvKmS ? b : a));
  const v2Peri = ['JUPITER', 'SATURN', 'URANUS'].map((b, k) => row(`famous.periapsis.voyager2.${k}.${b}`));
  const v2Vinf = ['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE'].map((b, k) => row(`famous.vinf.voyager2.${k}.${b}`));
  const jup = v2.flybys.find((f) => f.body === 'JUPITER');
  const nep = v2.flybys.find((f) => f.body === 'NEPTUNE');
  const k2 = orbits.kepler2;
  const peri = k2.samples[0], apo = k2.samples.reduce((a, b) => (b.distanceAu > a.distanceAu ? b : a));
  const startYear = Number(planets.coverage.startUtc.slice(0, 4)) + (planets.coverage.startUtc.slice(5) === '01-01' ? 0 : 1);
  const endYear = Number(planets.coverage.endUtc.slice(0, 4)) - (planets.coverage.endUtc.slice(5) === '12-31' ? 0 : 1);
  const months = (days) => Math.round(days / 30.4375);
  const V = {
    // First video and the start of the manual.
    epochDate: date(planets.epochUtc),
    coverStartYear: String(startYear),
    coverEndYear: String(endYear),
    searchMonths: String(months(quick.search.spanDays)),
    windowADv: fixed(lowA.dvKmS, 3),
    windowBDv: fixed(lowB.dvKmS, 3),
    windowADate: monthYear(addDays(quick.afterUtc, lowA.day)),
    windowBDate: monthYear(addDays(quick.afterUtc, lowB.day)),
    quickLaunchDate: date(quick.launchUtc),
    quickArrivalDate: date(quick.arrivalUtc),
    quickDays: String(Math.round(quick.daysToArrival)),
    quickAltitude: String(quick.closest[0]?.altitudeKm ?? ''),
    missionCount: String(missions.length),
    v2PeriMaxPct: fixed(Math.ceil(Math.max(...v2Peri) * 100) / 100, 2),
    v2VinfMaxPct: fixed(Math.ceil(Math.max(...v2Vinf) * 100) / 100, 2),
    v2CorrectionsMs: String(Math.round(row('famous.corrections.voyager2'))),
    // Second video: orbits.
    vCircular: fixed(orbits.circularSpeedAt1AuKmS, 1),
    vEscape: fixed(orbits.escapeSpeedAt1AuKmS, 1),
    periAu: fixed(peri.distanceAu, 2),
    periSpeed: fixed(peri.speedKmS, 1),
    apoAu: fixed(apo.distanceAu, 2),
    apoSpeed: fixed(apo.speedKmS, 1),
    sectorCount: String(k2.sectorAreasAu2.length),
    // Third video: transfers.
    depDate: date(mars.best.depUtc),
    arrDate: date(mars.best.arrUtc),
    bestC3: fixed(mars.best.c3, 2),
    bestTof: String(Math.round(mars.best.tofDays)),
    earthSpeed: fixed(norm(best.earthVelocity), 1),
    departureSpeed: fixed(norm(best.departureVelocity), 1),
    bestVinf: fixed(Math.sqrt(mars.best.c3), 2),
    synodicMonths: String(months(mars.hohmann.synodicDays)),
    synodicDays: String(Math.round(mars.hohmann.synodicDays)),
    hohmannDays: String(Math.round(mars.hohmann.tofDays)),
    seriesStartYear: mars.series[0].depUtc.slice(0, 4),
    seriesEndYear: mars.series[mars.series.length - 2].depUtc.slice(0, 4),
    // Fourth video: flybys.
    v2StartYear: v2.startUtc.slice(0, 4),
    jupiterMonth: monthYear(jup.utc),
    jupiterVinf: fixed(jup.vinfKmS, 2),
    jupiterTurn: fixed(jup.turnDeg, 1),
    jupiterRpRj: String(Math.round(v2.jupiterClose.periapsisRj)),
    jupiterSpeed: fixed(v2.jupiterClose.jupiterSpeedKmS, 1),
    helioIn: fixed(v2.jupiterClose.helioInKmS, 1),
    helioOut: fixed(v2.jupiterClose.helioOutKmS, 1),
    neptuneBefore: fixed(nep.speedBeforeKmS, 1),
    neptuneAfter: fixed(nep.speedAfterKmS, 1),
    correctionCount: String(v2.corrections.length),
  };
  return V;
}

function addDays(utcText, days) {
  const t = Date.parse(utcText.slice(0, 10) + 'T00:00:00Z') + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Put the values into a text: {name} becomes the value in the language lang ('en', 'ja' or 'say'). */
export function fill(text, V, lang) {
  return text.replace(/\{(\w+)\}/g, (m, name) => {
    const v = V[name];
    if (v === undefined) throw new Error(`values: no value "${name}" in: ${text}`);
    return typeof v === 'string' ? v : lang === 'ja' ? v.ja : v.en;
  });
}

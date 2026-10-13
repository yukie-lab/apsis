/** Ephemeris screen: state of a body at a time, its orbit elements, its constants, a table of states. */
import { useMemo, useState } from 'react';
import { useApp } from '../../app/store';
import { clock, useClock } from '../../app/clock';
import { system } from '../../app/system';
import { nowEt } from '../../app/store';
import { t, bodyName } from '../../i18n';
import { BODIES, AU, C_LIGHT, MOON_MODELS } from '../../engine/bodies';
import { stateFromIcrf } from '../../engine/frames';
import { elementsFromState, period, apsides, meanFromTrue } from '../../engine/kepler';
import { soiRadius } from '../../engine/propagate';
import { norm, DEG, type State } from '../../engine/vec';
import { DAY, formatEt, formatIso, YEAR } from '../../engine/time';
import { distance, speed, duration, fixed, angleDeg, sig, sci, type Quantity } from '../../app/format';
import { Val, Src } from '../../ui/Val';
import { BodySelect, DateInput, Field, NumberInput, Panel, downloadText } from '../../ui/controls';
import { PageHead, centerGm } from '../common';
import type { CustomBody } from '../../engine/system';

const num = (text: string, unit = ''): Quantity => ({ text, unit });

function sourceKey(id: string): string {
  const sys = system();
  if (sys.custom.has(id)) return 'custom';
  if (MOON_MODELS[id]) return 'moon';
  if (sys.small?.has(id)) return 'small';
  if (['JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO'].includes(id)) return 'centre';
  return 'de440';
}

function CustomBodies() {
  const custom = useApp((s) => s.custom);
  const add = useApp((s) => s.addCustom);
  const remove = useApp((s) => s.removeCustom);
  const mission = useApp((s) => s.mission);
  const [name, setName] = useState('');
  const [el, setEl] = useState({ a: 2.5, e: 0.1, i: 5, raan: 80, argp: 70, M0: 0, radius: 1 });
  const [epoch, setEpoch] = useState(() => nowEt());
  const id = 'X_' + name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  const ok = name.trim().length > 0 && el.a > 0 && el.e >= 0 && el.e < 1 && !BODIES[id];
  const set = (k: keyof typeof el) => (v: number) => setEl({ ...el, [k]: v });
  const used = (bid: string) => !!mission?.plan?.nodes.some((n) => n.body === bid);
  const create = () => {
    const body: CustomBody = { id, name: name.trim(), a: el.a * AU, e: el.e, i: el.i * DEG, raan: el.raan * DEG, argp: el.argp * DEG, M0: el.M0 * DEG, epochEt: epoch };
    add({ body, radiusKm: el.radius });
    setName('');
  };
  return (
    <Panel title={t('page.ephemeris.custom.title')}>
      <p className="note">{t('page.ephemeris.custom.intro')}</p>
      {custom.length > 0 && (
        <table className="data">
          <thead><tr><th>{t('common.name')}</th><th className="r">a</th><th className="r">e</th><th className="r">i</th><th /></tr></thead>
          <tbody>
            {custom.map((c) => (
              <tr key={c.body.id}>
                <td>{c.body.name}</td>
                <td className="r"><Val q={num(fixed(c.body.a / AU, 6), 'au')} /></td>
                <td className="r"><Val q={num(fixed(c.body.e, 6))} /></td>
                <td className="r"><Val q={angleDeg(c.body.i, 4)} /></td>
                <td className="r"><button type="button" className="btn small" disabled={used(c.body.id)} title={used(c.body.id) ? t('page.ephemeris.custom.inUse') : undefined} onClick={() => remove(c.body.id)}>{t('common.remove')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="grid3">
        <Field label={t('common.name')}><input className="input" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('el.a')}><NumberInput value={el.a} onChange={set('a')} unit="au" min={0.05} max={200} /></Field>
        <Field label={t('el.e')}><NumberInput value={el.e} onChange={set('e')} min={0} max={0.999} /></Field>
        <Field label={t('el.i')}><NumberInput value={el.i} onChange={set('i')} unit="°" min={0} max={180} /></Field>
        <Field label={t('el.raan')}><NumberInput value={el.raan} onChange={set('raan')} unit="°" min={-360} max={360} /></Field>
        <Field label={t('el.argp')}><NumberInput value={el.argp} onChange={set('argp')} unit="°" min={-360} max={360} /></Field>
        <Field label={t('el.M0')}><NumberInput value={el.M0} onChange={set('M0')} unit="°" min={-360} max={360} /></Field>
        <Field label={t('el.epoch')}><DateInput et={epoch} onChange={setEpoch} min={-1e11} max={1e11} /></Field>
        <Field label={t('page.ephemeris.radius')}><NumberInput value={el.radius} onChange={set('radius')} unit="km" min={0.001} max={5000} /></Field>
      </div>
      <p className="note">{t('page.ephemeris.custom.frame')}</p>
      <div className="row end"><button type="button" className="btn" disabled={!ok} onClick={create}>{t('page.ephemeris.custom.add')}</button></div>
    </Panel>
  );
}

export default function Ephemeris() {
  const { et } = useClock(200);
  const s = useApp((x) => x.settings);
  useApp((x) => x.custom);
  const [body, setBody] = useState('MARS');
  const [stepDays, setStepDays] = useState(10);
  const [rows, setRows] = useState(37);
  const sys = system();
  const id = BODIES[body] ? body : 'MARS';
  const b = BODIES[id];
  const cov = sys.coverage(id);
  const inRange = et >= cov[0] && et <= cov[1];
  const same = id === s.center;

  const st: State | null = useMemo(() => (inRange ? stateFromIcrf(sys.stateRel(id, s.center, et), s.frame) : null), [id, s.center, s.frame, et, inRange, sys]);
  const mu = centerGm(s.center) + (same ? 0 : b.gm);
  const el = st && !same && centerGm(s.center) > 0 ? elementsFromState(st, mu) : null;
  const r = st ? norm(st.r) : 0, v = st ? norm(st.v) : 0;
  const kind = 'ephem.state' as const;
  const src = sourceKey(id);

  const table = useMemo(() => {
    const out: { et: number; s: State }[] = [];
    for (let k = 0; k < rows; k++) {
      const tk = et + k * stepDays * DAY;
      if (tk < Math.max(cov[0], sys.etStart) || tk > Math.min(cov[1], sys.etEnd)) continue;
      out.push({ et: tk, s: stateFromIcrf(sys.stateRel(id, s.center, tk), s.frame) });
    }
    return out;
  }, [et, stepDays, rows, id, s.center, s.frame, cov, sys]);

  const csv = () => {
    const head = [
      '# Apsis ephemeris table',
      `# body: ${id}`, `# center: ${s.center}`, `# frame: ${s.frame}`, `# time scale: ${s.timeScale}`, '# units: km, km/s',
      'date,x_km,y_km,z_km,vx_km_s,vy_km_s,vz_km_s',
    ];
    const lines = table.map((row) => [formatIso(row.et, s.timeScale, 3), ...row.s.r.map((x) => x.toFixed(6)), ...row.s.v.map((x) => x.toFixed(9))].join(','));
    downloadText(`${id.toLowerCase()}_${s.center.toLowerCase()}_${s.frame.toLowerCase()}.csv`, [...head, ...lines].join('\n') + '\n', 'text/csv');
  };
  const pos = (km: number) => distance(km, s.distUnit, s.distUnit === 'km' ? 3 : 9);
  const rot = b.pm[1] !== 0 ? (360 / Math.abs(b.pm[1])) * DAY : 0;
  const lon = st ? Math.atan2(st.r[1], st.r[0]) : 0, lat = st && r > 0 ? Math.asin(st.r[2] / r) : 0;

  return (
    <>
      <PageHead id="ephemeris" />
      <div className="cols">
        <div className="stack">
          <Panel title={t('page.ephemeris.input')}>
            <Field label={t('common.body')}><BodySelect value={id} onChange={setBody} /></Field>
            <Field label={t('common.date')}><DateInput et={et} onChange={(x) => clock.set(x)} nudge /></Field>
            <div className="row">
              <button type="button" className="btn small" onClick={() => clock.set(nowEt())}>{t('common.now')}</button>
              <span className="note">{t('page.ephemeris.centerNote', { center: bodyName(s.center), frame: t('frame.' + s.frame) })}</span>
            </div>
            <dl className="kv">
              <dt>{t('page.ephemeris.source')}</dt><dd>{t('page.ephemeris.sourceOf.' + src)}</dd>
              <dt>{t('page.ephemeris.coverage')}</dt>
              <dd>{Number.isFinite(cov[0]) ? `${formatEt(Math.max(cov[0], sys.etStart), s.timeScale, 'day')} – ${formatEt(Math.min(cov[1], sys.etEnd), s.timeScale, 'day')} ${s.timeScale}` : t('page.ephemeris.allDates')}</dd>
            </dl>
          </Panel>
          <Panel title={t('page.ephemeris.constants')} actions={<Src kind="const" body={id} />}>
            <dl className="kv">
              <dt>{t('const.gm')}</dt><dd><Val q={num(b.gm > 0 ? sig(b.gm, 12) : '0', 'km³/s²')} /></dd>
              {b.gmSystem !== b.gm && <><dt>{t('const.gmSystem')}</dt><dd><Val q={num(sig(b.gmSystem, 12), 'km³/s²')} /></dd></>}
              <dt>{t('const.radius')}</dt><dd><Val q={num(fixed(b.radius, b.radius < 100 ? 3 : 1), 'km')} /></dd>
              {b.polarRadius !== b.radius && <><dt>{t('const.polarRadius')}</dt><dd><Val q={num(fixed(b.polarRadius, 1), 'km')} /></dd></>}
              {b.j2 > 0 && <><dt>{t('const.j2')}</dt><dd><Val q={num(sci(b.j2, 6))} /></dd></>}
              {rot > 0 && <><dt>{t('const.rotation')}</dt><dd><Val q={duration(rot)} /></dd></>}
              {b.parent && b.gm > 0 && inRange && <><dt>{t('const.soi')}</dt><dd><Val q={distance(soiRadius(sys, id, et), 'km', 0)} kind="ephem.derived" body={id} /></dd></>}
              {b.gm === 0 && <><dt /><dd className="note">{t('const.noMass')}</dd></>}
            </dl>
          </Panel>
          <CustomBodies />
        </div>
        <div className="stack">
          {!inRange && <div className="banner warn">{t('page.ephemeris.noData', { body: bodyName(id) })}</div>}
          {same && <div className="banner">{t('page.ephemeris.same')}</div>}
          {st && !same && (
            <Panel title={t('page.ephemeris.state', { body: bodyName(id), center: bodyName(s.center) })} actions={<Src kind={kind} body={id} />}>
              <table className="data">
                <thead><tr><th /><th className="r">{t('common.x')}</th><th className="r">{t('common.y')}</th><th className="r">{t('common.z')}</th><th className="r">{t('page.ephemeris.magnitude')}</th></tr></thead>
                <tbody>
                  <tr><td>{t('page.ephemeris.position')}</td>{st.r.map((x, k) => <td className="r" key={k}><Val q={pos(x)} /></td>)}<td className="r"><Val q={pos(r)} kind="ephem.derived" body={id} /></td></tr>
                  <tr><td>{t('page.ephemeris.velocity')}</td>{st.v.map((x, k) => <td className="r" key={k}><Val q={speed(x, 7)} /></td>)}<td className="r"><Val q={speed(v, 7)} kind="ephem.derived" body={id} /></td></tr>
                </tbody>
              </table>
              <dl className="kv">
                <dt>{t('page.ephemeris.longitude', { frame: t('frame.' + s.frame) })}</dt><dd><Val q={angleDeg(lon < 0 ? lon + 2 * Math.PI : lon, 5)} kind="ephem.derived" body={id} /></dd>
                <dt>{t('page.ephemeris.latitude', { frame: t('frame.' + s.frame) })}</dt><dd><Val q={angleDeg(lat, 5)} kind="ephem.derived" body={id} /></dd>
                <dt>{t('page.ephemeris.lightTime')}</dt><dd><Val q={duration(r / C_LIGHT)} kind="ephem.derived" body={id} /> <span className="dim">(<span className="num">{fixed(r / C_LIGHT, 3)}</span><span className="unit">s</span>)</span></dd>
              </dl>
            </Panel>
          )}
          {el && (
            <Panel title={t('page.ephemeris.elements', { center: bodyName(s.center) })} actions={<Src kind="ephem.elements" body={id} />}>
              <dl className="kv">
                <dt>{t('el.a')}</dt><dd><Val q={pos(el.a)} /></dd>
                <dt>{t('el.e')}</dt><dd><Val q={num(fixed(el.e, 9))} /></dd>
                <dt>{t('el.i')}</dt><dd><Val q={angleDeg(el.i, 6)} /></dd>
                <dt>{t('el.raan')}</dt><dd><Val q={angleDeg(el.raan, 6)} /></dd>
                <dt>{t('el.argp')}</dt><dd><Val q={angleDeg(el.argp, 6)} /></dd>
                <dt>{t('el.nu')}</dt><dd><Val q={angleDeg(el.nu, 6)} /></dd>
                {el.e < 1 && <><dt>{t('el.M')}</dt><dd><Val q={angleDeg(meanFromTrue(el.nu, el.e), 6)} /></dd></>}
                <dt>{t('el.rp')}</dt><dd><Val q={pos(apsides(el).rp)} /></dd>
                {el.e < 1 && <><dt>{t('el.ra')}</dt><dd><Val q={pos(apsides(el).ra)} /></dd></>}
                {el.e < 1 && <><dt>{t('el.period')}</dt><dd><Val q={duration(period(el.a, mu))} /> <span className="dim">(<span className="num">{fixed(period(el.a, mu) / DAY, 4)}</span><span className="unit">d</span>, <span className="num">{fixed(period(el.a, mu) / YEAR, 5)}</span><span className="unit">y</span>)</span></dd></>}
              </dl>
              <p className="note">{t('page.ephemeris.elementsNote', { frame: t('frameLong.' + s.frame) })}</p>
            </Panel>
          )}
          {inRange && !same && (
            <Panel title={t('page.ephemeris.table')} actions={<><Src kind={kind} body={id} /><button type="button" className="btn small" onClick={csv}>{t('page.ephemeris.csv')}</button></>}>
              <div className="row">
                <Field label={t('page.ephemeris.step')}><NumberInput value={stepDays} onChange={setStepDays} unit="d" min={0.001} max={3650} /></Field>
                <Field label={t('page.ephemeris.rows')}><NumberInput value={rows} onChange={(x) => setRows(Math.round(x))} min={2} max={2000} /></Field>
              </div>
              <div className="scroll" style={{ maxHeight: 320 }}>
                <table className="data">
                  <thead><tr><th>{t('common.date')} ({s.timeScale})</th><th className="r">X ({s.distUnit})</th><th className="r">Y ({s.distUnit})</th><th className="r">Z ({s.distUnit})</th><th className="r">VX (km/s)</th><th className="r">VY (km/s)</th><th className="r">VZ (km/s)</th></tr></thead>
                  <tbody>
                    {table.slice(0, 400).map((row) => (
                      <tr key={row.et}>
                        <td className="num">{formatEt(row.et, s.timeScale)}</td>
                        {row.s.r.map((x, k) => <td className="r num" key={k}>{pos(x).text}</td>)}
                        {row.s.v.map((x, k) => <td className="r num" key={k}>{fixed(x, 6)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.length > 400 && <p className="note">{t('page.ephemeris.tableLimit', { n: 400, total: table.length })}</p>}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

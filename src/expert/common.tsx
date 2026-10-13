/** Parts that the screens of the Expert mode share. */
import type { ReactNode } from 'react';
import { useApp } from '../app/store';
import { t } from '../i18n';
import { Val } from '../ui/Val';
import { dateTime } from '../app/format';
import type { BasisKind, BasisContext } from '../app/provenance';
import type { ExpertPage } from '../app/router';
import type { State } from '../engine/vec';
import { system } from '../app/system';
import { clock, useClock } from '../app/clock';
import { DateInput } from '../ui/controls';
import { BODIES } from '../engine/bodies';

export function PageHead({ id, children }: { id: ExpertPage; children?: ReactNode }) {
  return (
    <div className="head">
      <h1>{t(`page.${id}.title`)}</h1>
      <p>{t(`page.${id}.intro`)}</p>
      {children}
    </div>
  );
}

/** Date in the time scale of the settings (the scale name shows as the unit). */
export function Dt({ et, kind, precision, ...ctx }: { et: number; kind?: BasisKind; precision?: 'day' | 'minute' | 'second' | 'milli' } & BasisContext) {
  const scale = useApp((s) => s.settings.timeScale);
  return <Val q={dateTime(et, scale, precision ?? 'second')} kind={kind} {...ctx} />;
}

/** State of a body relative to the centre of the settings (ICRF axes). */
export function relToCenter(id: string, center: string, et: number): State {
  return system().stateRel(id, center, et);
}
/** State of the spacecraft (given relative to the SSB) relative to a centre. */
export function scRel(s: State, center: string, et: number): State {
  if (center === 'SSB') return s;
  const c = system().state(center, et);
  return { r: [s.r[0] - c.r[0], s.r[1] - c.r[1], s.r[2] - c.r[2]], v: [s.v[0] - c.v[0], s.v[1] - c.v[1], s.v[2] - c.v[2]] };
}
/** GM of a centre for two-body elements (planet system for a planet with moons), km^3/s^2. 0 for the barycentre. */
export const centerGm = (center: string): number => (center === 'SSB' ? 0 : BODIES[center]?.gmSystem ?? 0);

/** Slider and date field for the time of the view, between the start and the end of a flight. */
export function ViewTime({ et0, et1 }: { et0: number; et1: number }) {
  const { et } = useClock(100);
  const span = et1 - et0;
  const x = span > 0 ? Math.round(1000 * Math.min(1, Math.max(0, (et - et0) / span))) : 0;
  return (
    <div className="viewtime">
      <input type="range" min={0} max={1000} value={x} aria-label={t('common.viewSlider')} onChange={(e) => clock.set(et0 + (Number(e.target.value) / 1000) * span)} />
      <DateInput et={Math.min(et1, Math.max(et0, et))} compact min={et0} max={et1} label={t('context.viewTime')} onChange={(v) => clock.set(v)} />
    </div>
  );
}

/** Empty state of a screen: a short text and one or more actions. */
export function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="panel empty">
      <p>{text}</p>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

/** The solar system model of the page (main thread). The engine worker has its own copy of the same data. */
import { ChebyshevEphemeris } from '../engine/ephemeris';
import { SolarSystem } from '../engine/system';

export interface SystemData { ephem: ArrayBuffer; small: ArrayBuffer }

let sys: SolarSystem | null = null;
let data: SystemData | null = null;

/** URL of a file in the public directory (the application works in any directory of a static host). */
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path;
}

export async function loadSystem(): Promise<SolarSystem> {
  if (sys) return sys;
  const get = async (name: string): Promise<ArrayBuffer> => {
    const res = await fetch(assetUrl('data/' + name));
    if (!res.ok) throw new Error('data-file:' + name);
    return res.arrayBuffer();
  };
  const [ephem, small] = await Promise.all([get('ephem.bin'), get('small.bin')]);
  data = { ephem, small };
  sys = new SolarSystem(new ChebyshevEphemeris(ephem), new ChebyshevEphemeris(small));
  return sys;
}
/** The model. Call only after loadSystem() has finished. */
export function system(): SolarSystem {
  if (!sys) throw new Error('system-not-loaded');
  return sys;
}
export function systemData(): SystemData {
  if (!data) throw new Error('system-not-loaded');
  return data;
}

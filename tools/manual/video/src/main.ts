/**
 * Page of the video frames. URL: stage.html?scene=<id>. The page builds the scene, then sets window.__scene with
 * the length of the video and the function render(t). The capture script (tools/manual/video/capture.mjs) calls
 * render(t) for each frame and takes a picture of the page.
 */
import { Scene } from './core';
import { loadFonts } from './text';
import { loadNarration, type Narration } from './narration';

export interface Kit { scene: Scene; N: Narration; data: <T = any>(name: string) => Promise<T> }

declare global { interface Window { __scene?: { duration: number; estimated: boolean; render: (t: number) => void }; __error?: string } }

const scenes = import.meta.glob('./scenes/*.ts');

async function start(): Promise<void> {
  const id = new URLSearchParams(location.search).get('scene') ?? 'v1';
  await loadFonts();
  const loader = scenes[`./scenes/${id}.ts`];
  if (!loader) throw new Error(`No scene "${id}".`);
  const mod = (await loader()) as { default: (k: Kit) => Promise<void> };
  const scene = new Scene(document.getElementById('stage') as unknown as SVGSVGElement);
  const N = await loadNarration(id);
  const cache = new Map<string, unknown>();
  const data = async <T,>(name: string): Promise<T> => {
    if (!cache.has(name)) {
      const res = await fetch(`/out/data/${name}.json`);
      if (!res.ok) throw new Error(`No data file ${name}.json: run npm run manual:data.`);
      cache.set(name, await res.json());
    }
    return cache.get(name) as T;
  };
  await mod.default({ scene, N, data });
  scene.duration = N.total;
  const t0 = Number(new URLSearchParams(location.search).get('t') ?? '0');
  scene.render(t0);
  window.__scene = { duration: scene.duration, estimated: N.estimated, render: (t: number) => scene.render(t) };
}

start().catch((e) => { window.__error = String(e?.stack ?? e); console.error(e); });

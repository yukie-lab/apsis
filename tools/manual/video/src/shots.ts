/**
 * Pictures of the screens of the application in the videos. The screenshot step of the manual
 * (tools/manual/shots/capture.mjs) writes .out/shots/<name>.png and .out/shots/<name>.json (size and the boxes of
 * the marked parts of the screen).
 */
import type { Scene } from './core';
import { Picture } from './shapes';

export interface ShotInfo { name: string; file: string; width: number; height: number; scale: number; boxes: Record<string, [number, number, number, number]> }

export async function shot(scene: Scene, name: string, x: number, y: number, w: number): Promise<{ picture: Picture; info: ShotInfo }> {
  const res = await fetch(`/out/shots/${name}.json`);
  if (!res.ok) throw new Error(`No picture "${name}": run the screenshot step of the manual first.`);
  const info = (await res.json()) as ShotInfo;
  const url = `/out/shots/${info.file}`;
  // Load and decode the picture before the first frame.
  const img = new Image();
  img.src = url;
  await img.decode();
  const picture = scene.add(new Picture(scene.defs, url, [info.width, info.height], x, y, w), 'ui');
  return { picture, info };
}

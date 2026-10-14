/**
 * Loader of a larger file of a map, for a camera that is near (see MapSet in core.ts). The first file stays in
 * use until the GPU has all of the larger file.
 *
 * A texture from an image element gives the renderer much work in the frame that first shows it. The browser
 * decodes the file, and the GPU gets all pixels in one step. For a map of 4096 x 2048 pixels the picture stops for
 * about 0.1 s (measured: Chrome on an Apple M4 computer). The body is large on the screen at this time, so the
 * stop shows. This loader makes no such stop:
 * - The file comes as a Blob (fetch), and the browser decodes it in the background (createImageBitmap of the
 *   Blob). Chrome decodes an image element on the main thread, also in createImageBitmap: 30 to 40 ms for a file
 *   of 4096 x 2048 pixels and 7 to 12 ms for 2048 x 1024 (measured on the same computer).
 * - The loader reads the pixels in parts of some rows, one part for each frame, into one array.
 * - The texture is a DataTexture of this array. Each part goes to the GPU in the frame that reads it
 *   (the update ranges of the texture, and WebGLRenderer.initTexture).
 * - `done` gets the texture when the GPU has all rows. The material can then use it with no more work.
 * The transfer needs a renderer. So the owner of the load calls `step` each frame, with the renderer that draws the
 * body. The renderer does not have to draw the body in this frame.
 * A renderer gets one part in one frame, also if more than one map loads (the three maps of the Earth, or the
 * maps of two bodies): the maps then load one after the other.
 * If the browser cannot do this (no fetch, a Blob that it cannot decode, pixels that it cannot read), the loader
 * loads the file as an image element, as loadMap does. Then it decodes the image on the main thread, or `done`
 * gets the texture of the image, as loadMap gives it.
 *
 * The array stays in memory while the texture lives (4 bytes for each pixel): the renderer needs it if it must
 * send the texture again, after a loss of the WebGL context. When the texture is disposed, nothing holds the array.
 */
import * as THREE from 'three';
import { findDarkEdges, imageMapTexture, setUpMapTexture } from './manifest';
import type { DarkEdges, EdgeBasis, MapOptions } from './manifest';

export interface PartLoad {
  /**
   * Call each frame, before the renderer draws the scene. It sends the next part of the texture to the GPU of this
   * renderer. The load keeps the first renderer that it gets: a call with another renderer does nothing.
   */
  step(renderer: THREE.WebGLRenderer): void;
  /** Stops the load and releases what it holds. After `done` it has no effect: the texture then belongs to the caller. */
  cancel(): void;
}

/** About this number of pixels goes to the GPU in one frame. */
const PART_PIXELS = 1 << 19;
/** For each renderer: the number of the frame (WebGLRenderer.info.render.frame) in which a load last sent a part. */
const lastPartFrame = new WeakMap<THREE.WebGLRenderer, number>();
/** An image that is smaller than this (width or height, pixels) is not worth the parts. */
const MIN_SIZE = 256;

/** The state of a load whose pixels can be read. */
interface Stage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  edges: DarkEdges;
  /** Canvas for one part of the image. */
  context: CanvasRenderingContext2D;
  /** Number of rows in one part. The last part can have more, up to twice this number. */
  partRows: number;
  /** All pixels: red, green, blue, alpha. The first row is the bottom row of the image (the row order of WebGL). */
  data: Uint8Array;
  texture: THREE.DataTexture;
  /** Number of rows that are in `data`, and number of rows that the GPU has. Both count from the bottom row. */
  read: number;
  sent: number;
  renderer: THREE.WebGLRenderer | null;
}

/** The pixel values of the file, with no change. */
const BITMAP_OPTIONS: ImageBitmapOptions = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

/**
 * Downloads the file as a Blob and decodes it in the background.
 * 'failed': the file did not load. null: the browser cannot do this, so the path of an image element must try.
 */
async function fetchBitmap(url: string, signal: AbortSignal | undefined): Promise<ImageBitmap | 'failed' | null> {
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  let blob: Blob;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return 'failed';
    blob = await response.blob();
  } catch {
    // A network error, or the load stopped.
    return 'failed';
  }
  try {
    return await createImageBitmap(blob, BITMAP_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * Prepares the transfer in parts. `source`: a decoded file (the stage takes it), or an image element (the code
 * decodes it here, on the main thread). null: the browser cannot read the pixels this way.
 */
async function openStage(source: ImageBitmap | HTMLImageElement, url: string, opt: MapOptions, basis: EdgeBasis): Promise<Stage | null> {
  let bitmap: ImageBitmap | null = typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap ? source : null;
  try {
    if (typeof document === 'undefined') throw new Error('document');
    if (!bitmap) {
      if (typeof createImageBitmap !== 'function' || typeof HTMLImageElement === 'undefined' || !(source instanceof HTMLImageElement)) return null;
      if (source.naturalWidth < MIN_SIZE || source.naturalHeight < MIN_SIZE) return null;
      bitmap = await createImageBitmap(source, BITMAP_OPTIONS);
      if (bitmap.width !== source.naturalWidth || bitmap.height !== source.naturalHeight) throw new Error('size');
    }
    const { width, height } = bitmap;
    if (width < MIN_SIZE || height < MIN_SIZE) throw new Error('size');
    // The edge test: at least the repair of the first file. null: the code cannot read the pixels.
    const edges = (opt.repair ?? opt.wrapU) ? findDarkEdges(bitmap, basis) : { top: 0, bottom: 0, left: 0, right: 0 };
    if (!edges) throw new Error('pixels');
    const partRows = Math.max(64, Math.round(PART_PIXELS / width));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.min(height, 2 * partRows);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('canvas');
    // A part replaces the pixels of the part before it, also where the image is transparent.
    context.globalCompositeOperation = 'copy';
    const data = new Uint8Array(width * height * 4);
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
    const repaired = edges.top + edges.bottom + edges.left + edges.right > 0;
    setUpMapTexture(texture, url, opt, repaired ? edges : null);
    return { bitmap, width, height, edges, context, partRows, data, texture, read: 0, sent: 0, renderer: null };
  } catch {
    bitmap?.close();
    return null;
  }
}

/** Reads `rows` rows of the image into the array, from the row `stage.read` (counted from the bottom) upward. */
function readPart(stage: Stage, rows: number): void {
  const { width: w, height: h, edges, context, data } = stage;
  const top = h - stage.read - rows;
  context.drawImage(stage.bitmap, 0, top, w, rows, 0, 0, w, rows);
  const px = context.getImageData(0, 0, w, rows).data;
  const line = w * 4;
  // The repair of repairEdges. The columns first: the rows that follow then copy good corner pixels.
  if (edges.left > 0 || edges.right > 0) {
    for (let y = 0; y < rows; y++) {
      const row = y * line;
      for (let x = 0; x < edges.left; x++) px.copyWithin(row + x * 4, row + edges.left * 4, row + edges.left * 4 + 4);
      const good = row + (w - 1 - edges.right) * 4;
      for (let x = 0; x < edges.right; x++) px.copyWithin(row + (w - 1 - x) * 4, good, good + 4);
    }
  }
  // A part has many more rows than the rows that can be wrong, so the good row is in the same part.
  if (edges.top > 0 && top === 0) {
    for (let y = 0; y < edges.top; y++) px.copyWithin(y * line, edges.top * line, (edges.top + 1) * line);
  }
  if (edges.bottom > 0 && top + rows === h) {
    const good = (rows - 1 - edges.bottom) * line;
    for (let y = 0; y < edges.bottom; y++) px.copyWithin((rows - 1 - y) * line, good, good + line);
  }
  // The rows go into the array in the opposite order: the bottom row of the image is the first row of a WebGL texture.
  for (let y = 0; y < rows; y++) data.set(px.subarray(y * line, (y + 1) * line), (h - 1 - (top + y)) * line);
  stage.read += rows;
}

/**
 * Starts the download of a larger file of a map.
 * `basis`: the edge repair of the first file (edgeBasis). The larger file gets at least the same repair.
 * `done` gets the texture when a renderer has all of it, or null if the file did not load.
 */
export function loadMapInParts(url: string, opt: MapOptions, basis: EdgeBasis, done: (texture: THREE.Texture | null) => void): PartLoad {
  let alive = true;
  let stage: Stage | null = null;
  let canvas: HTMLCanvasElement | null = null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  // After a loss of the WebGL context the GPU has no row of the texture: the transfer starts again. The rows that are read stay.
  const onRestored = (): void => {
    if (stage) stage.sent = 0;
  };
  const close = (): void => {
    canvas?.removeEventListener('webglcontextrestored', onRestored);
    canvas = null;
    if (stage) {
      stage.bitmap.close();
      // The canvas of the parts releases its memory.
      stage.context.canvas.width = 0;
      stage.context.canvas.height = 0;
    }
    stage = null;
  };

  // The path of an image element, as in loadMap.
  const fromImage = (): void => {
    new THREE.TextureLoader().load(
      url,
      (loaded) => {
        if (!alive) {
          loaded.dispose();
          return;
        }
        const image: unknown = loaded.image;
        const element = typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement ? image : null;
        void (element ? openStage(element, url, opt, basis) : Promise.resolve(null)).then((opened) => {
          if (!alive) {
            opened?.bitmap.close();
            opened?.texture.dispose();
            loaded.dispose();
          } else if (opened) {
            loaded.dispose();
            stage = opened;
          } else {
            // The browser cannot read the pixels in parts: the texture of the image, with the pause in its first frame.
            alive = false;
            done(imageMapTexture(loaded, url, opt, basis));
          }
        });
      },
      undefined,
      () => {
        if (alive) done(null);
        alive = false;
      },
    );
  };

  void fetchBitmap(url, controller?.signal).then(async (bitmap) => {
    if (!alive) {
      if (bitmap !== null && bitmap !== 'failed') bitmap.close();
      return;
    }
    if (bitmap === 'failed') {
      alive = false;
      done(null);
      return;
    }
    if (bitmap === null) {
      fromImage();
      return;
    }
    const opened = await openStage(bitmap, url, opt, basis);
    if (!alive) {
      opened?.bitmap.close();
      opened?.texture.dispose();
    } else if (opened) {
      stage = opened;
    } else {
      // The pixels of the decoded file cannot be read: the path of an image element.
      fromImage();
    }
  });

  return {
    step(renderer: THREE.WebGLRenderer): void {
      const s = stage;
      if (!alive || !s) return;
      // One renderer gets the parts. Another renderer that draws the body later sends the complete texture itself.
      if (s.renderer === null) {
        s.renderer = renderer;
        canvas = renderer.domElement;
        canvas.addEventListener('webglcontextrestored', onRestored);
      } else if (s.renderer !== renderer) {
        return;
      }
      // One part in one frame of a renderer, for all loads together.
      const frame = renderer.info.render.frame;
      if (lastPartFrame.get(renderer) === frame) return;
      lastPartFrame.set(renderer, frame);
      try {
        const left = s.height - s.sent;
        const rows = left < 2 * s.partRows ? left : s.partRows;
        if (s.sent + rows > s.read) readPart(s, s.sent + rows - s.read);
        const line = s.width * 4;
        for (let y = s.sent; y < s.sent + rows; y++) s.texture.addUpdateRange(y * line, line);
        s.texture.needsUpdate = true;
        // three.js sends the rows of the ranges now. The first call also makes the texture of the GPU.
        renderer.initTexture(s.texture);
        s.sent += rows;
      } catch {
        // The body keeps the map that it shows.
        alive = false;
        s.texture.dispose();
        close();
        done(null);
        return;
      }
      if (s.sent >= s.height) {
        const texture = s.texture;
        alive = false;
        close();
        done(texture);
      }
    },
    cancel(): void {
      if (!alive) return;
      alive = false;
      // A download that runs stops.
      controller?.abort();
      stage?.texture.dispose();
      close();
    },
  };
}

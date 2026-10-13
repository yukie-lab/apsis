/**
 * Material library of one spacecraft model.
 *
 * Each model owns one `Materials` object. A material (and its textures) is made when a model
 * file asks for it the first time, so a model only pays for what it uses. `dispose()` frees all
 * materials and textures of the model.
 *
 * All materials use the vertex colours as a colour factor (see `EmitOptions.tint`).
 * The look is tuned for one strong directional light, a weak fill light and a dim environment
 * map, with ACES filmic tone mapping.
 */
import * as THREE from 'three';
import { foilMaps, grunge, tiles, weave, wireMesh } from './textures';
import type { Pixels, TileSpec } from './textures';

type Std = THREE.MeshStandardMaterial;
type StdParams = THREE.MeshStandardMaterialParameters;
type PhysParams = THREE.MeshPhysicalMaterialParameters;

const FOIL_SIZE = 256;
const FOIL_COARSE = 3;
const FOIL_SEED = 11;

export class Materials {
  private readonly materials = new Map<string, THREE.Material>();
  private readonly textures = new Map<string, THREE.DataTexture>();

  // -------------------------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------------------------

  private texture(key: string, pixels: () => Pixels, srgb: boolean, repeat = 1): THREE.DataTexture {
    const id = `${key}@${repeat}`;
    let t = this.textures.get(id);
    if (!t) {
      const p = pixels();
      t = new THREE.DataTexture(p.data, p.size, p.size, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.name = id;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 8;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
      this.textures.set(id, t);
    }
    return t;
  }

  private std(name: string, params: () => StdParams): Std {
    let m = this.materials.get(name);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params() });
      m.name = name;
      this.materials.set(name, m);
    }
    return m as Std;
  }

  private phys(name: string, params: () => PhysParams): THREE.MeshPhysicalMaterial {
    let m = this.materials.get(name);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({ vertexColors: true, ...params() });
      m.name = name;
      this.materials.set(name, m);
    }
    return m as THREE.MeshPhysicalMaterial;
  }

  private foilNormal(repeat = 1): THREE.DataTexture {
    return this.texture('foilNormal', () => foilMaps(FOIL_SIZE, FOIL_COARSE, FOIL_SEED).normal, false, repeat);
  }

  private foilRough(repeat = 1): THREE.DataTexture {
    return this.texture('foilRough', () => foilMaps(FOIL_SIZE, FOIL_COARSE, FOIL_SEED).rough, false, repeat);
  }

  private grungeMap(repeat = 1): THREE.DataTexture {
    return this.texture('grunge', () => grunge(128, 23, 0.74), false, repeat);
  }

  private foil(name: string, color: number, metalness: number, roughness: number, bump: number, repeat = 1): Std {
    return this.std(name, () => ({
      color,
      metalness,
      roughness,
      normalMap: this.foilNormal(repeat),
      normalScale: new THREE.Vector2(bump, bump),
      roughnessMap: this.foilRough(repeat),
    }));
  }

  private tiled(name: string, spec: TileSpec, extra: StdParams, bump = 0): Std {
    return this.std(name, () => {
      const map = this.texture(`tiles:${name}`, () => tiles(spec), true);
      const p: StdParams = { color: 0xffffff, map, ...extra };
      if (bump > 0) {
        p.bumpMap = map;
        p.bumpScale = bump;
      }
      return p;
    });
  }

  /** A copy of a material that is drawn on its two sides (for thin sheets). */
  twoSided<T extends THREE.Material>(base: T): T {
    const name = `${base.name}:2`;
    let m = this.materials.get(name);
    if (!m) {
      m = base.clone();
      m.name = name;
      m.side = THREE.DoubleSide;
      this.materials.set(name, m);
    }
    return m as T;
  }

  // -------------------------------------------------------------------------------------------
  // Thermal blankets
  // -------------------------------------------------------------------------------------------

  /** Gold-coloured blanket (amber polyimide film on aluminium). */
  get foilGold(): Std {
    return this.foil('foilGold', 0xdfa63c, 0.86, 0.5, 1.0);
  }

  /** Darker, more orange blanket. */
  get foilAmber(): Std {
    return this.foil('foilAmber', 0xb9742c, 0.84, 0.52, 1.0);
  }

  /** Black blanket (carbon-loaded film). */
  get foilBlack(): Std {
    return this.foil('foilBlack', 0x1c1c20, 0.25, 0.82, 1.0);
  }

  /** Silver blanket (aluminised film). */
  get foilSilver(): Std {
    return this.foil('foilSilver', 0xcdd1d6, 0.9, 0.46, 1.0);
  }

  /** White cloth blanket, matt. */
  get clothWhite(): Std {
    return this.std('clothWhite', () => ({
      color: 0xe7e4dc,
      metalness: 0,
      roughness: 0.88,
      normalMap: this.foilNormal(1),
      normalScale: new THREE.Vector2(0.45, 0.45),
    }));
  }

  // -------------------------------------------------------------------------------------------
  // Paint
  // -------------------------------------------------------------------------------------------

  get paintWhite(): Std {
    return this.std('paintWhite', () => ({ color: 0xebe9e3, metalness: 0, roughness: 0.62, roughnessMap: this.grungeMap() }));
  }

  get paintBlack(): Std {
    return this.std('paintBlack', () => ({ color: 0x101012, metalness: 0, roughness: 0.72, roughnessMap: this.grungeMap() }));
  }

  get paintGrey(): Std {
    return this.std('paintGrey', () => ({ color: 0x7a7d82, metalness: 0.1, roughness: 0.62, roughnessMap: this.grungeMap() }));
  }

  /** White antenna paint with panel seams. The texture has 2 x 2 panels per tile. */
  get dishWhite(): Std {
    return this.tiled(
      'dishWhite',
      { size: 256, cells: 2, base: [233, 232, 227], gap: [182, 182, 178], gapPx: 1, jitter: 0.03, noise: 0.035, seed: 5 },
      { metalness: 0, roughness: 0.56, roughnessMap: this.grungeMap() },
      0.5,
    );
  }

  // -------------------------------------------------------------------------------------------
  // Metals and composites
  // -------------------------------------------------------------------------------------------

  /** Bare machined aluminium. */
  get aluminium(): Std {
    return this.std('aluminium', () => ({ color: 0xc3c6ca, metalness: 1, roughness: 0.46, roughnessMap: this.grungeMap() }));
  }

  /** Dark structural metal (titanium, steel). */
  get titanium(): Std {
    return this.std('titanium', () => ({ color: 0x8c8780, metalness: 1, roughness: 0.52, roughnessMap: this.grungeMap() }));
  }

  /** Rocket nozzle metal, outside. */
  get nozzle(): Std {
    return this.std('nozzle', () => ({ color: 0x6a625a, metalness: 0.95, roughness: 0.42, roughnessMap: this.grungeMap(2) }));
  }

  /** Rocket nozzle, inside. */
  get nozzleInner(): Std {
    return this.std('nozzleInner', () => ({ color: 0x2a2522, metalness: 0.7, roughness: 0.6 }));
  }

  /** Polished gold plate. */
  get goldPlate(): Std {
    return this.std('goldPlate', () => ({ color: 0xf0c050, metalness: 1, roughness: 0.24, roughnessMap: this.grungeMap(2) }));
  }

  /** Copper-coloured metal (tape, small parts). */
  get copper(): Std {
    return this.std('copper', () => ({ color: 0xc58a4a, metalness: 1, roughness: 0.36 }));
  }

  /** Pale spring metal of a whip or wire antenna. */
  get antennaWire(): Std {
    return this.std('antennaWire', () => ({ color: 0xbdb6a6, metalness: 1, roughness: 0.42 }));
  }

  /** Carbon-fibre composite. */
  get carbon(): Std {
    return this.std('carbon', () => {
      const w = this.texture('weave', () => weave(64, 4, 3), false, 6);
      return { color: 0x1c1c20, metalness: 0.15, roughness: 0.5, roughnessMap: w };
    });
  }

  /** Pale glass-fibre composite of a light boom. */
  get fibre(): Std {
    return this.std('fibre', () => ({ color: 0xcfc08e, metalness: 0, roughness: 0.55 }));
  }

  /** Dark casing of a radioisotope generator. */
  get generator(): Std {
    return this.std('generator', () => ({ color: 0x4b4b52, metalness: 0.35, roughness: 0.5, roughnessMap: this.grungeMap(2) }));
  }

  // -------------------------------------------------------------------------------------------
  // Special surfaces
  // -------------------------------------------------------------------------------------------

  /** Solar cells under cover glass. The texture has 4 x 4 cells per tile. */
  get solarCells(): THREE.MeshPhysicalMaterial {
    return this.phys('solarCells', () => ({
      color: 0xffffff,
      map: this.texture(
        'cells',
        () =>
          tiles({
            size: 256,
            cells: 4,
            base: [18, 26, 58],
            gap: [150, 152, 158],
            gapPx: 1,
            jitter: 0.16,
            warmth: -0.06,
            fingers: 16,
            bars: 2,
            line: [120, 126, 140],
            cut: 5,
            seed: 21,
          }),
        true,
      ),
      metalness: 0.55,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }));
  }

  /** Back side of a solar array. */
  get solarBack(): Std {
    return this.std('solarBack', () => {
      const w = this.texture('weave', () => weave(64, 4, 3), false, 6);
      return { color: 0x2a2724, metalness: 0.2, roughness: 0.55, roughnessMap: w };
    });
  }

  /** Mirror tiles of a radiator. The texture has 4 x 4 tiles per tile. */
  get mirror(): Std {
    return this.tiled(
      'mirror',
      { size: 128, cells: 4, base: [206, 214, 224], gap: [70, 72, 78], gapPx: 1, jitter: 0.1, warmth: 0.03, seed: 31 },
      { metalness: 1, roughness: 0.16 },
    );
  }

  /** Tan ablator tiles of a heat shield. The texture has 4 x 4 tiles per tile. */
  get ablator(): Std {
    return this.tiled(
      'ablator',
      { size: 256, cells: 4, base: [150, 110, 74], gap: [92, 66, 46], gapPx: 1, jitter: 0.06, warmth: 0.03, noise: 0.22, seed: 41 },
      { metalness: 0, roughness: 0.92 },
      0.8,
    );
  }

  /** White thermal tiles of a backshell. The texture has 4 x 4 tiles per tile. */
  get shellWhite(): Std {
    return this.tiled(
      'shellWhite',
      { size: 256, cells: 4, base: [224, 220, 210], gap: [190, 186, 178], gapPx: 1, jitter: 0.045, warmth: 0.025, noise: 0.11, seed: 43 },
      { metalness: 0, roughness: 0.78 },
      0.5,
    );
  }

  /** Dark screen grid of an ion engine. */
  get ionGrid(): Std {
    return this.tiled(
      'ionGrid',
      { size: 64, cells: 8, base: [16, 17, 20], gap: [96, 98, 104], gapPx: 1, jitter: 0.1, seed: 51 },
      { metalness: 0.85, roughness: 0.42 },
    );
  }

  /** Open gold wire mesh of an umbrella antenna (see-through). */
  get meshGold(): Std {
    return this.std('meshGold', () => ({
      color: 0xffffff,
      map: this.texture('wireMesh', () => wireMesh(64, 8, [236, 196, 110], 0.34), true),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      metalness: 0.35,
      roughness: 0.5,
    }));
  }

  /** Dark lens glass. */
  get glass(): THREE.MeshPhysicalMaterial {
    return this.phys('glass', () => ({ color: 0x05070b, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, ior: 1.6 }));
  }

  /** Black cable jacket. */
  get cable(): Std {
    return this.std('cable', () => ({ color: 0x0e0e10, metalness: 0, roughness: 0.75 }));
  }

  /** White wrapped cable harness. */
  get harness(): Std {
    return this.std('harness', () => ({ color: 0xb9b6ac, metalness: 0.2, roughness: 0.6 }));
  }

  /** Frees all materials and textures of the model. */
  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.materials.clear();
    this.textures.clear();
  }
}

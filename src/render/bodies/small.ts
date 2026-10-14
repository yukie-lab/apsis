/**
 * Rocky bodies with a surface that the code makes: asteroids, comet nuclei, small moons with an irregular shape,
 * and any round body that has no map in the manifest.
 *
 * The mesh of an irregular body comes from shapes.ts. The shader adds craters and rocks at several sizes
 * (changes of the normal and small shadows, with no change of the outline) and a dark surface with low contrast.
 * Nothing here is measured: the body has the provenance 'procedural' and the note 'shape-approximate'.
 * An irregular body with a real map in the manifest (Phobos, Deimos, Bennu, Eros) shows the map on the
 * approximate shape (provenance 'mixed'). The relief of the mesh does not follow the map then: only a crater with
 * a fixed place in shapes.ts (Stickney on Phobos) is at the place of its picture in the map.
 */
import * as THREE from 'three';
import { Globe, MeshPart, colorVector, shaderBase } from './core';
import type { BuildContext, Built, Part } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_LIGHT, GLSL_MAP, GLSL_NODATA, GLSL_NOISE, VERT_UNIT_SPHERE } from './glsl';
import { isPartial, longitudeOffset, notesFromEntry } from './manifest';
import { buildShape } from './shapes';
import type { ShapeSpec } from './shapes';
import { NIGHT_FILL, applyMapScan, makeNoDataUniforms } from './surface';
import type { NoDataUniforms } from './surface';
import type { TextureEntry } from './types';

export interface RockLook {
  /** Colour of the ground (hex). Without it the body has the display colour of the body table. */
  color?: string;
  /** Brightness factor of the colour. */
  gain: number;
  /** Weight of the Lommel-Seeliger law, 0 to 1. */
  seeliger: number;
  /** Craters: depth as a part of the crater radius, and the part of the cells that hold a crater. */
  craters: number;
  craterShare: number;
  /** Rocks: height as a part of the rock radius, and the part of the cells that hold a rock. */
  rocks: number;
  rockShare: number;
  /** Contrast of the large bright and dark areas, and of the fine grain. */
  mottle: number;
  grain: number;
  /** Slope of the small lumps of the ground (0 = smooth). */
  rough: number;
  /** Radius of the largest craters of the shader, as a part of the mean radius of the body. */
  markSize: number;
  /** Extra brightness of the neck between two lobes. */
  neckBright: number;
  /** Faint wide gloss (a surface with metal). 0 for dust. */
  sheen: number;
}

/**
 * Looks by body id. All values are set by eye from the general character of each body
 * (rubble with many rocks, or old ground with many craters). They are not measured.
 */
export const ROCK_LOOKS: Record<string, RockLook> = {
  EROS: { gain: 0.72, seeliger: 0.6, craters: 0.3, craterShare: 0.55, rocks: 0.4, rockShare: 0.1, mottle: 0.12, grain: 0.1, rough: 0.22, markSize: 0.14, neckBright: 0, sheen: 0 },
  ITOKAWA: { gain: 0.72, seeliger: 0.6, craters: 0.2, craterShare: 0.06, rocks: 0.5, rockShare: 0.72, mottle: 0.14, grain: 0.14, rough: 0.3, markSize: 0.16, neckBright: 0.15, sheen: 0 },
  RYUGU: { gain: 0.7, seeliger: 0.7, craters: 0.2, craterShare: 0.08, rocks: 0.5, rockShare: 0.8, mottle: 0.1, grain: 0.14, rough: 0.34, markSize: 0.14, neckBright: 0, sheen: 0 },
  BENNU: { gain: 0.9, seeliger: 0.7, craters: 0.2, craterShare: 0.07, rocks: 0.55, rockShare: 0.84, mottle: 0.12, grain: 0.16, rough: 0.36, markSize: 0.16, neckBright: 0, sheen: 0 },
  DIDYMOS: { gain: 0.7, seeliger: 0.6, craters: 0.2, craterShare: 0.12, rocks: 0.5, rockShare: 0.62, mottle: 0.1, grain: 0.12, rough: 0.3, markSize: 0.12, neckBright: 0, sheen: 0 },
  ARROKOTH: { gain: 0.62, seeliger: 0.5, craters: 0.16, craterShare: 0.22, rocks: 0, rockShare: 0, mottle: 0.12, grain: 0.06, rough: 0.1, markSize: 0.07, neckBright: 0.45, sheen: 0 },
  PSYCHE: { gain: 0.7, seeliger: 0.5, craters: 0.28, craterShare: 0.5, rocks: 0.4, rockShare: 0.05, mottle: 0.18, grain: 0.1, rough: 0.22, markSize: 0.12, neckBright: 0, sheen: 0.2 },
  HALLEY: { color: '#77706a', gain: 0.42, seeliger: 0.7, craters: 0.24, craterShare: 0.3, rocks: 0.45, rockShare: 0.3, mottle: 0.18, grain: 0.14, rough: 0.32, markSize: 0.12, neckBright: 0, sheen: 0 },
  CHURYUMOV_GERASIMENKO: { color: '#77706a', gain: 0.42, seeliger: 0.7, craters: 0.24, craterShare: 0.3, rocks: 0.45, rockShare: 0.35, mottle: 0.18, grain: 0.14, rough: 0.32, markSize: 0.1, neckBright: 0.3, sheen: 0 },
};

/** Look of a rocky body that has no entry in ROCK_LOOKS: old ground with craters and a few rocks. */
export const ROCK_LOOK_GENERIC: RockLook = {
  gain: 0.7,
  seeliger: 0.6,
  craters: 0.28,
  craterShare: 0.5,
  rocks: 0.4,
  rockShare: 0.1,
  mottle: 0.14,
  grain: 0.1,
  rough: 0.22,
  markSize: 0.14,
  neckBright: 0,
  sheen: 0,
};

/** Look of a round body with no map: more craters, and the largest craters are smaller parts of the body. */
export const ROCK_LOOK_GLOBE: RockLook = { ...ROCK_LOOK_GENERIC, craterShare: 0.8, rocks: 0, rockShare: 0, mottle: 0.24, markSize: 0.085, rough: 0.18 };

/** Look of a comet nucleus with no entry in ROCK_LOOKS: very dark, rough ground. */
export const ROCK_LOOK_COMET: RockLook = { ...ROCK_LOOK_GENERIC, color: '#77706a', gain: 0.42, seeliger: 0.7, craterShare: 0.3, rocks: 0.45, rockShare: 0.3, mottle: 0.18, rough: 0.32 };

/** Look of a mapped body on an irregular shape: the map holds the detail, so the shader adds none. */
const MAPPED_LOOK: RockLook = { ...ROCK_LOOK_GENERIC, gain: 1.0, seeliger: 0.65, craters: 0, craterShare: 0, rocks: 0, rockShare: 0, mottle: 0, grain: 0, rough: 0 };

/** Largest number of lobes that the shadow test of the shader accepts. */
const MAX_LOBES = 3;

const VERT_SHAPE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;
varying vec3 vNormal;
void main() {
  vPos = position;
  vNormal = normal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_NOISE}
${GLSL_MAP}
${GLSL_LIGHT}
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uSunColor;
uniform vec3 uAlbedo;
uniform vec4 uRock;           // x: cells per km of the largest marks, y: contrast of the fine grain, z: contrast of the large areas, w: gloss
uniform vec4 uMarks;          // x: depth of the craters, y: part of the cells with a crater, z: height of the rocks, w: part of the cells with a rock
uniform vec3 uSeed;           // shift of the patterns, so that each body has its own craters and rocks
uniform vec4 uShade;          // x: weight of the Lommel-Seeliger law, y: light on the night side, z: brightness of the map, w: slope of the small lumps
#ifdef SHAPE_MESH
varying vec3 vPos;
varying vec3 vNormal;
#else
varying vec3 vUnit;
uniform vec3 uRadii;
#endif
#ifdef USE_MAP
${GLSL_NODATA}
uniform sampler2D uMap;
uniform vec4 uMapParams;      // x: u offset, y: latitude factor, w: 1 = the map is ready
uniform vec3 uMeanColor;
#endif
#if LOBES > 0
uniform vec3 uLobeC[LOBES];   // centres of the lobes, km
uniform vec3 uLobeR[LOBES];   // half-axes of the lobes, a little smaller than the mesh, km
#endif
#ifdef NECK
uniform vec4 uNeck;           // xyz: centre of the neck (km), w: radius of the neck zone (km)
uniform float uNeckBright;
#endif

#if MARK_OCTAVES > 0
// Craters and rocks of one size, in cells of size 1.
// st: unit vector to the Sun along the ground. tanE: tangent of the height of the Sun above the ground.
// The function adds the slope of the relief to grad and the change of the brightness to tone.
// It lowers light where a crater wall or a rock hides the Sun.
void marks(vec3 p, vec3 st, float tanE, float fade, inout vec3 grad, inout float tone, inout float light) {
  vec3 base = floor(p - 0.5);
  for (int k = 0; k < 8; k++) {
    vec3 cell = base + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    float pick = hash13(cell + 31.7);
    if (pick >= uMarks.y + uMarks.w) continue;
    vec3 d = p - (cell + 0.3 + 0.4 * hash33(cell));
    float len = length(d);
    vec3 dn = d / max(len, 1e-5);
    float vary = 0.6 + 0.8 * fract(pick * 91.7);
    if (pick < uMarks.y) {
      // A crater: a bowl with a low rim.
      float rad = 0.42 * pow(0.3, pick / uMarks.y);
      float t = len / rad;
      if (t > 1.5) continue;
      float depth = uMarks.x * vary;
      float bowl = t < 1.0 ? 4.0 * t * (1.0 - t * t) : 0.0;
      float e = (t - 1.0) / 0.22;
      float rim = exp(-e * e);
      grad += fade * depth * dn * (bowl - 1.4 * e * rim);
      tone += fade * (0.1 * rim - (t < 1.0 ? 0.05 * (1.0 - t * t) : 0.0));
      if (t < 1.0) {
        // The wall on the side of the Sun puts a shadow on the floor when the Sun is low.
        float limit = tanE / (1.3 * depth) - 1.0;
        light *= 1.0 - fade * smoothstep(limit, limit + 0.3, dot(d, st) / rad) * (1.0 - t * t * t * t);
      }
    } else {
      // A rock: a block with a flat top, steep sides and its own brightness.
      // Its outline is an ellipse with a random direction: the distance counts more along one axis.
      float rad = 0.33 * pow(0.35, (pick - uMarks.y) / uMarks.w);
      vec3 axis = normalize(hash33(cell + 9.1) - 0.5);
      vec3 e = d + axis * (0.8 * dot(d, axis));
      float t = length(e) / rad;
      if (t > 2.4) continue;
      float height = uMarks.z * vary;
      if (t < 1.0) {
        float s = clamp((t - 0.4) / 0.6, 0.0, 1.0);
        vec3 out3 = normalize(e + axis * (0.8 * dot(e, axis)));
        grad -= fade * height * out3 * (10.0 * s * (1.0 - s));
        tone += fade * 0.6 * (fract(pick * 37.3) - 0.5) * smoothstep(1.0, 0.8, t);
      }
      // The shadow of the rock on the ground behind it (the formula of a dome with the shape of a parabola).
      // It is short and soft: the code cuts a long shadow of a low Sun at about two rock radii.
      float T = tanE / height;
      float A = -dot(e, st) / rad;
      float B2 = max(t * t - A * A, 0.0);
      float inside = (1.0 - B2) / max(T, 0.05) + 0.25 * T - A;
      float shadow = smoothstep(0.0, 0.5, inside) * smoothstep(0.5 * T - 0.2, 0.5 * T + 0.2, A) * (1.0 - smoothstep(1.2, 2.4, t)) * (1.0 - smoothstep(0.5, 1.0, B2));
      light *= 1.0 - 0.9 * fade * shadow;
    }
  }
}
#endif

#if LOBES > 0
// Part of the sunlight that the other lobes of the body let pass.
float lobeShadow(vec3 p, vec3 s) {
  float light = 1.0;
  for (int i = 0; i < LOBES; i++) {
    vec3 pw = (p - uLobeC[i]) / uLobeR[i];
    vec3 sw = normalize(s / uLobeR[i]);
    float t = -dot(pw, sw);
    float r2 = dot(pw, pw);
    // No shadow from a lobe behind the point, and none from the lobe that holds the point.
    if (t <= 0.0 || r2 < 1.0) continue;
    light *= smoothstep(0.93, 1.0, sqrt(max(r2 - t * t, 0.0)));
  }
  return light;
}
#endif

void main() {
  #include <logdepthbuf_fragment>
  #ifdef SHAPE_MESH
    vec3 pos = vPos;
    vec3 n = normalize(vNormal);
  #else
    vec3 unit = normalize(vUnit);
    vec3 pos = unit * uRadii;
    vec3 n = normalize(unit / uRadii);
  #endif
  vec3 v = normalize(uCamPos - pos);
  // Size of one pixel on the surface, km.
  float px = max(length(dFdx(pos)), length(dFdy(pos)));
  float mu0g = dot(n, uSunDir);

  vec3 albedo = uAlbedo;
  #ifdef USE_MAP
    MapCoord mc = mapCoord(normalize(pos), uMapParams.x, uMapParams.y);
    vec3 tex = mapSampleSmooth(uMap, mc).rgb;
    albedo = mix(uMeanColor, mix(uNoDataColor, tex * uShade.z, mapHasData(tex, mc.uv)), uMapParams.w);
  #endif

  // Bright and dark areas with soft edges, and a fine grain that fades when it is smaller than a pixel.
  vec3 q = pos * uRock.x + uSeed;
  float tone = 2.0 * uRock.z * (fbm(q * 0.7 + 3.1, 3) - 0.5);
  float grainFade = 1.0 - smoothstep(0.1, 0.35, px * uRock.x * 14.0);
  tone += uRock.y * grainFade * (fbm(q * 14.0 + 7.7, 2) - 0.5);

  // Small lumps of the ground: three sizes of noise change the normal. A size fades out when it is smaller than a few pixels.
  vec3 grad = vec3(0.0);
  #if ROUGH_OCTAVES > 0
    float lumpScale = uRock.x * 8.0;
    float lumpSlope = uShade.w;
    for (int o = 0; o < ROUGH_OCTAVES; o++) {
      float lumpFade = 1.0 - smoothstep(0.12, 0.4, px * lumpScale);
      if (lumpFade > 0.0) grad += (lumpSlope * lumpFade) * vnoiseGrad(pos * lumpScale + uSeed + float(o) * 7.9).yzw;
      lumpScale *= 2.3;
      lumpSlope *= 0.8;
    }
  #endif

  // Craters and rocks at several sizes. A size fades out when its marks are smaller than a few pixels.
  float light = 1.0;
  #if MARK_OCTAVES > 0
    vec3 sunGround = uSunDir - n * mu0g;
    float sunGroundLength = length(sunGround);
    vec3 st = sunGround / max(sunGroundLength, 1e-4);
    float tanE = max(mu0g, 0.02) / max(sunGroundLength, 1e-3);
    float scale = uRock.x;
    for (int o = 0; o < MARK_OCTAVES; o++) {
      float fade = smoothstep(1.0, 2.5, 0.2 / (scale * px));
      if (fade > 0.0) marks(pos * scale + uSeed + float(o) * 17.3, st, tanE, fade, grad, tone, light);
      scale *= 2.2;
    }
  #endif
  albedo *= max(1.0 + tone, 0.25);
  #ifdef NECK
    vec3 dk = (pos - uNeck.xyz) / uNeck.w;
    albedo *= 1.0 + uNeckBright * exp(-dot(dk, dk));
  #endif

  vec3 nb = normalize(n - (grad - n * dot(grad, n)));
  float mu0 = dot(nb, uSunDir);
  float mu = max(dot(n, v), 0.0);
  // The dusty law gives the brightness of the smooth surface. The relief changes it by the ratio of the cosines:
  // a slope that faces the Sun is brighter, a slope that faces away is darker.
  float relief = clamp(mu0 / max(mu0g, 0.1), 0.0, 2.2);
  float lit = dustyDiffuse(mu0g, mu, uShade.x) * relief * light;
  float shadow = casterShadow(pos, uSunDir);
  vec3 sun = uSunColor * shadow;
  #if LOBES > 0
    float lobes = lobeShadow(pos, uSunDir);
    sun *= lobes;
    shadow *= lobes;
  #endif
  vec3 color = albedo * sun * lit;
  if (uRock.w > 0.0) {
    vec3 hv = normalize(uSunDir + v);
    color += sun * (uRock.w * pow(max(dot(nb, hv), 0.0), 18.0) * max(mu0, 0.0) * light * smoothstep(0.0, 0.1, mu0g));
  }
  color += albedo * uSunColor * (uShade.y + nightFill(shadow * lit));
  gl_FragColor = vec4(color, 1.0);
  ${FRAG_TAIL}
}
`;

/** A shift of the noise patterns from the id of the body: three numbers from 0 to 64. */
function seedOf(id: string): THREE.Vector3 {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return new THREE.Vector3((h & 1023) / 16, ((h >>> 10) & 1023) / 16, ((h >>> 20) & 1023) / 16);
}

interface RockMaterial {
  material: THREE.ShaderMaterial;
  uniforms: Record<string, THREE.IUniform>;
  /** Uniforms for the areas with no data of a real map, or null for a surface of the code. */
  noData: NoDataUniforms | null;
}

function makeRockMaterial(
  ctx: BuildContext,
  look: RockLook,
  meanRadiusKm: number,
  shapeMesh: boolean,
  useMap: boolean,
  lobes: { c: THREE.Vector3; r: THREE.Vector3 }[],
  neck: { at: THREE.Vector3; radius: number } | null,
): RockMaterial {
  const high = ctx.quality === 'high';
  const cellKm = (look.markSize * meanRadiusKm) / 0.42;
  const hasMarks = look.craterShare > 0 || look.rockShare > 0;
  const uniforms: Record<string, THREE.IUniform> = {
    uSunDir: ctx.frame.uSunDir,
    uCamPos: ctx.frame.uCamPos,
    uSunColor: ctx.frame.uSunColor,
    uCasters: ctx.frame.uCasters,
    uSunAngR: ctx.frame.uSunAngR,
    uNightFill: ctx.frame.uNightFill,
    uAlbedo: { value: colorVector(look.color ?? ctx.color, look.gain) },
    uRock: { value: new THREE.Vector4(1 / cellKm, look.grain, look.mottle, look.sheen) },
    // A share of zero must not divide by zero in the shader.
    uMarks: { value: new THREE.Vector4(look.craters, look.craterShare, look.rocks, Math.max(look.rockShare, 1e-6)) },
    uShade: { value: new THREE.Vector4(look.seeliger, NIGHT_FILL, look.gain, look.rough) },
    uSeed: { value: seedOf(ctx.id) },
  };
  let noData: NoDataUniforms | null = null;
  const defines: Record<string, number> = {
    LOBES: Math.min(lobes.length, MAX_LOBES),
    // The low quality has fewer sizes of marks: a view from very near shows less fine detail.
    MARK_OCTAVES: hasMarks ? (high ? 7 : 3) : 0,
    ROUGH_OCTAVES: look.rough > 0 ? (high ? 6 : 2) : 0,
  };
  if (shapeMesh) defines.SHAPE_MESH = 1;
  else uniforms.uRadii = { value: new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm) };
  if (useMap) {
    defines.USE_MAP = 1;
    defines.MAP_ANISOTROPY = ctx.maps.anisotropy;
    if (ctx.maps.smooth) defines.MAP_SMOOTH = 1;
    uniforms.uMap = { value: ctx.maps.blank };
    uniforms.uMapParams = { value: new THREE.Vector4(0.5, 1, 0, 0) };
    uniforms.uMeanColor = { value: colorVector(ctx.color, 0.8) };
    noData = makeNoDataUniforms(ctx.maps.blank);
    Object.assign(uniforms, noData);
  }
  if (defines.LOBES > 0) {
    // The shadow lobes are smaller than the mesh, so a point of the surface is never inside the shadow of its own lobe.
    uniforms.uLobeC = { value: lobes.slice(0, MAX_LOBES).map((l) => l.c.clone()) };
    uniforms.uLobeR = { value: lobes.slice(0, MAX_LOBES).map((l) => l.r.clone().multiplyScalar(0.9)) };
  }
  if (neck && look.neckBright > 0) {
    defines.NECK = 1;
    uniforms.uNeck = { value: new THREE.Vector4(neck.at.x, neck.at.y, neck.at.z, neck.radius) };
    uniforms.uNeckBright = { value: look.neckBright };
  }
  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/rock`),
    defines,
    uniforms,
    vertexShader: shapeMesh ? VERT_SHAPE : VERT_UNIT_SPHERE,
    fragmentShader: FRAGMENT,
  });
  return { material, uniforms, noData };
}

/**
 * Builds a body with an irregular shape.
 * `entry`: real map of the body, or null for a surface that the code makes.
 */
export function buildShaped(ctx: BuildContext, spec: ShapeSpec, look: RockLook, entry: TextureEntry | null, notes: string[]): Built {
  const shape = buildShape(spec, ctx.quality === 'high' ? 6 : 4, ctx.radiusKm, ctx.polarRadiusKm);
  const used = entry ? MAPPED_LOOK : look;
  const { material, uniforms, noData } = makeRockMaterial(ctx, used, shape.meanRadiusKm, true, entry !== null, shape.lobes, shape.neck);
  const mesh = new THREE.Mesh(shape.geometry, material);
  mesh.name = `${ctx.id}/shape`;
  ctx.root.add(mesh);
  notes.push('shape-approximate');
  let area: THREE.Texture | null = null;
  const built: Built = {
    parts: [new MeshPart(mesh), { triangles: () => 0, trianglesMax: () => 0, dispose: () => area?.dispose() }],
    provenance: entry ? 'mixed' : 'procedural',
    notes,
    extentKm: shape.extentKm,
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: entry ? ctx.maps.taps : 0,
  };
  if (entry) {
    const mapParams = uniforms.uMapParams.value as THREE.Vector4;
    mapParams.x = longitudeOffset(entry);
    const partial = isPartial(entry);
    notes.push(...notesFromEntry(entry));
    if (partial) notes.push('no-data');
    const fromFile = [...notesFromEntry(entry), 'no-data'];
    ctx.maps.watch(mesh, shape.meanRadiusKm);
    ctx.maps.load(
      entry,
      { srgb: true, wrapU: true },
      (texture) => {
        if (texture) {
          uniforms.uMap.value = texture;
          mapParams.w = 1;
          if (noData) area = applyMapScan(texture, partial, noData, notes);
          // A map with areas of no data has a second small texture, and a dark pixel reads it.
          if (area) {
            built.codeTextures = 1;
            built.samplesPerPixel = ctx.maps.taps + 1;
          }
          return;
        }
        // The file did not load: the shape gets the surface of the code, and the notes of the file go away.
        const rock = makeRockMaterial(ctx, look, shape.meanRadiusKm, true, false, shape.lobes, shape.neck);
        mesh.material = rock.material;
        material.dispose();
        for (const note of fromFile) {
          const k = notes.indexOf(note);
          if (k >= 0) notes.splice(k, 1);
        }
        notes.push('map-load-failed', 'surface-procedural');
        built.provenance = 'procedural';
        built.samplesPerPixel = 0;
      },
      // Another file of the same map (the larger file, or the first file again): the small map of the areas with no
      // data stays as it is.
      (texture) => {
        uniforms.uMap.value = texture;
      },
    );
  } else {
    notes.push('surface-procedural');
  }
  return built;
}

/**
 * Gives the sphere of a round body the cratered surface of the code. A body whose map did not load uses it,
 * so that it is not a ball with one colour.
 */
export function useRockSurface(ctx: BuildContext, globe: Globe, look: RockLook): void {
  const { material } = makeRockMaterial(ctx, look, ctx.radiusKm, false, false, [], null);
  const old = globe.mesh.material as THREE.Material;
  globe.mesh.material = material;
  old.dispose();
}

/** Builds a round body with no map: an exact ellipsoid with a cratered surface that the code makes. */
export function buildRockyGlobe(ctx: BuildContext, look: RockLook, notes: string[]): Built {
  const { material } = makeRockMaterial(ctx, look, ctx.radiusKm, false, false, [], null);
  const globe = new Globe(`${ctx.id}/surface`, material, new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm), ctx.quality);
  ctx.root.add(globe.mesh);
  notes.push('surface-procedural');
  const parts: Part[] = [globe];
  return {
    parts,
    provenance: 'procedural',
    notes,
    extentKm: ctx.radiusKm,
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: 0,
  };
}

/**
 * Rocky bodies with a surface that the code makes: asteroids, comet nuclei, small moons with an irregular shape,
 * and any round body that has no map in the manifest.
 *
 * The mesh of an irregular body comes from shapes.ts. The shader adds small craters, boulders and a fine roughness
 * (changes of the normal, with no change of the outline) and a dark surface with low contrast.
 * Nothing here is measured: the body has the provenance 'procedural' and the note 'shape-approximate'.
 * Phobos and Deimos use their real map on the approximate shape (provenance 'mixed').
 */
import * as THREE from 'three';
import { Globe, MeshPart, colorVector, shaderBase } from './core';
import type { BuildContext, Built, Part } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_LIGHT, GLSL_MAP, GLSL_NODATA, GLSL_NOISE, VERT_UNIT_SPHERE } from './glsl';
import { isPartial, longitudeOffset, notesFromEntry } from './manifest';
import { buildShape } from './shapes';
import type { ShapeSpec } from './shapes';
import { NIGHT_FILL, applyMapScan, makeNoDataUniforms } from './surface';
import type { TextureEntry } from './types';

export interface RockLook {
  /** Brightness factor of the display colour of the body table. */
  gain: number;
  /** Weight of the Lommel-Seeliger law, 0 to 1. */
  seeliger: number;
  /** Small craters: strength of the relief (0 = none) and part of the cells that hold a crater. */
  craters: number;
  craterDensity: number;
  /** Boulders: strength of the relief (0 = none) and part of the cells that hold a boulder. */
  boulders: number;
  boulderDensity: number;
  /** Fine roughness of the ground. */
  rough: number;
  /** Contrast of the bright and dark areas. */
  mottle: number;
  /** Size of the largest craters of the shader, as a part of the mean radius. */
  markSize: number;
  /** Extra brightness of the neck between two lobes. */
  neckBright: number;
  /** Faint wide gloss (a metal-rich surface). 0 for dust. */
  sheen: number;
}

/** Looks by body id. All values are set by eye from the general character of each body. They are not measured. */
export const ROCK_LOOKS: Record<string, RockLook> = {
  EROS: { gain: 0.72, seeliger: 0.6, craters: 0.9, craterDensity: 0.75, boulders: 0, boulderDensity: 0, rough: 0.5, mottle: 0.16, markSize: 0.16, neckBright: 0, sheen: 0 },
  ITOKAWA: { gain: 0.7, seeliger: 0.6, craters: 0.25, craterDensity: 0.2, boulders: 1.0, boulderDensity: 0.8, rough: 0.7, mottle: 0.2, markSize: 0.13, neckBright: 0.18, sheen: 0 },
  RYUGU: { gain: 0.5, seeliger: 0.7, craters: 0.35, craterDensity: 0.25, boulders: 1.0, boulderDensity: 0.85, rough: 0.7, mottle: 0.16, markSize: 0.12, neckBright: 0, sheen: 0 },
  BENNU: { gain: 0.5, seeliger: 0.7, craters: 0.3, craterDensity: 0.22, boulders: 1.1, boulderDensity: 0.9, rough: 0.7, mottle: 0.2, markSize: 0.13, neckBright: 0, sheen: 0 },
  DIDYMOS: { gain: 0.66, seeliger: 0.6, craters: 0.3, craterDensity: 0.25, boulders: 0.9, boulderDensity: 0.7, rough: 0.6, mottle: 0.16, markSize: 0.11, neckBright: 0, sheen: 0 },
  ARROKOTH: { gain: 0.62, seeliger: 0.5, craters: 0.35, craterDensity: 0.3, boulders: 0, boulderDensity: 0, rough: 0.3, mottle: 0.12, markSize: 0.1, neckBright: 0.45, sheen: 0 },
  PSYCHE: { gain: 0.7, seeliger: 0.5, craters: 0.9, craterDensity: 0.7, boulders: 0, boulderDensity: 0, rough: 0.45, mottle: 0.2, markSize: 0.17, neckBright: 0, sheen: 0.22 },
  HALLEY: { gain: 0.24, seeliger: 0.7, craters: 0.5, craterDensity: 0.4, boulders: 0.3, boulderDensity: 0.3, rough: 1.0, mottle: 0.2, markSize: 0.14, neckBright: 0, sheen: 0 },
  CHURYUMOV_GERASIMENKO: { gain: 0.24, seeliger: 0.7, craters: 0.55, craterDensity: 0.45, boulders: 0.35, boulderDensity: 0.35, rough: 1.0, mottle: 0.2, markSize: 0.12, neckBright: 0.25, sheen: 0 },
};

/** Look of a rocky body that has no entry in ROCK_LOOKS. */
export const ROCK_LOOK_GENERIC: RockLook = {
  gain: 0.68,
  seeliger: 0.6,
  craters: 0.9,
  craterDensity: 0.7,
  boulders: 0,
  boulderDensity: 0,
  rough: 0.5,
  mottle: 0.18,
  markSize: 0.16,
  neckBright: 0,
  sheen: 0,
};

/** Look of a mapped body on an irregular shape: the map holds the detail, so the shader adds none. */
const MAPPED_LOOK: RockLook = { ...ROCK_LOOK_GENERIC, gain: 1.0, seeliger: 0.65, craters: 0, craterDensity: 0, rough: 0, mottle: 0 };

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
uniform vec4 uRock;           // x: cells per km of the largest marks, y: fine roughness, z: contrast of the albedo pattern, w: gloss
uniform vec4 uMarks;          // x: crater strength, y: crater density, z: boulder strength, w: boulder density
uniform vec3 uShade;          // x: weight of the Lommel-Seeliger law, y: light on the night side, z: brightness of the map
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

// Craters (dome = 0) or boulders (dome = 1) in cells of size 1.
// xyz: gradient of the height. w: change of the brightness.
vec4 marks(vec3 p, float density, float dome) {
  vec3 base = floor(p - 0.5);
  vec4 sum = vec4(0.0);
  for (int k = 0; k < 8; k++) {
    vec3 cell = base + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    float pick = hash13(cell + 31.7);
    if (pick >= density) continue;
    vec3 d = p - (cell + 0.3 + 0.4 * hash33(cell));
    float len = length(d);
    float rad = 0.42 * pow(0.33, pick / density);
    float t = len / rad;
    if (t > 1.5) continue;
    vec3 dn = d / max(len, 1e-5);
    if (dome > 0.5) {
      // A boulder: a dome with a sharp foot. Each boulder has its own brightness.
      if (t < 1.0) sum += vec4(dn * (-2.2 * t), 0.5 * (hash13(cell + 5.3) - 0.5) * (1.0 - t * t));
    } else {
      // A crater: a bowl with a raised rim.
      float bowl = t < 1.0 ? 4.0 * t * (1.0 - t * t) : 0.0;
      float e = (t - 1.0) / 0.22;
      float rim = exp(-e * e);
      sum += vec4(dn * (bowl - 2.7 * e * rim), 0.12 * rim - (t < 1.0 ? 0.06 * (1.0 - t * t) : 0.0));
    }
  }
  return sum;
}

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

  vec3 albedo = uAlbedo;
  #ifdef USE_MAP
    MapCoord mc = mapCoord(normalize(pos), uMapParams.x, uMapParams.y);
    vec3 tex = mapSample(uMap, mc).rgb;
    albedo = mix(uMeanColor, mix(uNoDataColor, tex * uShade.z, mapHasData(tex)), uMapParams.w);
  #endif

  // Bright and dark areas with soft edges, at two sizes. The fine pattern fades when it is smaller than a pixel.
  vec3 q = pos * uRock.x;
  float fine = 1.0 - smoothstep(0.08, 0.3, px * uRock.x * 9.0);
  float tone = (fbm(q * 0.8 + 3.1, 3) - 0.5) + 0.5 * fine * (fbm(q * 9.0 + 7.7, ROCK_OCTAVES) - 0.5);

  // Craters and boulders at several sizes. A size fades out when its marks are smaller than a few pixels.
  vec3 grad = vec3(0.0);
  float scale = uRock.x;
  for (int o = 0; o < MARK_OCTAVES; o++) {
    float fade = smoothstep(1.5, 4.0, 0.25 / (scale * px));
    if (fade > 0.0) {
      vec3 pp = pos * scale + float(o) * 17.3;
      if (uMarks.x > 0.0) {
        vec4 c = marks(pp, uMarks.y, 0.0);
        grad += fade * uMarks.x * c.xyz;
        tone += fade * c.w;
      }
      if (uMarks.z > 0.0) {
        vec4 b = marks(pp + 5.5, uMarks.w, 1.0);
        grad += fade * uMarks.z * b.xyz;
        tone += fade * b.w;
      }
    }
    scale *= 2.3;
  }
  albedo *= max(1.0 + 2.0 * uRock.z * tone, 0.2);
  #ifdef NECK
    vec3 dn = (pos - uNeck.xyz) / uNeck.w;
    albedo *= 1.0 + uNeckBright * exp(-dot(dn, dn));
  #endif

  // Fine roughness: a height from noise. Its slope comes from the difference between pixels.
  vec3 nb = n;
  if (uRock.y > 0.0) {
    float h = uRock.y * fine * (0.6 / (uRock.x * 9.0)) * fbm(q * 9.0 + 1.3, ROCK_OCTAVES);
    vec3 dpx = dFdx(pos);
    vec3 dpy = dFdy(pos);
    vec3 r1 = cross(dpy, n);
    vec3 r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 slope = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    nb = normalize(abs(det) * n - slope);
  }
  vec3 gt = grad - n * dot(grad, n);
  nb = normalize(nb - gt);

  float mu0g = dot(n, uSunDir);
  float mu0 = dot(nb, uSunDir);
  float mu = max(dot(n, v), 0.0);
  // The relief gets no light where the smooth surface is in the dark.
  float lit = dustyDiffuse(mu0, mu, uShade.x) * smoothstep(-0.04, 0.08, mu0g);
  vec3 sun = uSunColor * casterShadow(pos, uSunDir);
  #if LOBES > 0
    sun *= lobeShadow(pos, uSunDir);
  #endif
  vec3 color = albedo * sun * lit;
  if (uRock.w > 0.0) {
    vec3 hv = normalize(uSunDir + v);
    color += sun * uRock.w * pow(max(dot(nb, hv), 0.0), 18.0) * max(mu0, 0.0) * smoothstep(-0.04, 0.08, mu0g);
  }
  color += albedo * uSunColor * uShade.y;
  gl_FragColor = vec4(color, 1.0);
  ${FRAG_TAIL}
}
`;

interface RockMaterial {
  material: THREE.ShaderMaterial;
  uniforms: Record<string, THREE.IUniform>;
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
  const uniforms: Record<string, THREE.IUniform> = {
    uSunDir: ctx.frame.uSunDir,
    uCamPos: ctx.frame.uCamPos,
    uSunColor: ctx.frame.uSunColor,
    uCasters: ctx.frame.uCasters,
    uSunAngR: ctx.frame.uSunAngR,
    uAlbedo: { value: colorVector(ctx.color, look.gain) },
    uRock: { value: new THREE.Vector4(1 / cellKm, look.rough, look.mottle, look.sheen) },
    uMarks: { value: new THREE.Vector4(look.craters, look.craterDensity, look.boulders, look.boulderDensity) },
    uShade: { value: new THREE.Vector3(look.seeliger, NIGHT_FILL, look.gain) },
  };
  const defines: Record<string, number> = {
    LOBES: Math.min(lobes.length, MAX_LOBES),
    MARK_OCTAVES: high ? 4 : 2,
    ROCK_OCTAVES: high ? 3 : 2,
  };
  if (shapeMesh) defines.SHAPE_MESH = 1;
  else uniforms.uRadii = { value: new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm) };
  if (useMap) {
    defines.USE_MAP = 1;
    uniforms.uMap = { value: ctx.maps.blank };
    uniforms.uMapParams = { value: new THREE.Vector4(0.5, 1, 0, 0) };
    uniforms.uMeanColor = { value: colorVector(ctx.color, 0.8) };
    Object.assign(uniforms, makeNoDataUniforms());
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
  return { material, uniforms };
}

/**
 * Builds a body with an irregular shape.
 * `entry`: real map of the body (Phobos, Deimos) or null for a surface that the code makes.
 */
export function buildShaped(ctx: BuildContext, spec: ShapeSpec, look: RockLook, entry: TextureEntry | null, notes: string[]): Built {
  const shape = buildShape(spec, ctx.quality === 'high' ? 6 : 4, ctx.radiusKm, ctx.polarRadiusKm);
  const used = entry ? MAPPED_LOOK : look;
  const { material, uniforms } = makeRockMaterial(ctx, used, shape.meanRadiusKm, true, entry !== null, shape.lobes, shape.neck);
  const mesh = new THREE.Mesh(shape.geometry, material);
  mesh.name = `${ctx.id}/shape`;
  ctx.root.add(mesh);
  notes.push('shape-approximate');
  if (entry) {
    const mapParams = uniforms.uMapParams.value as THREE.Vector4;
    mapParams.x = longitudeOffset(entry);
    const partial = isPartial(entry);
    notes.push(...notesFromEntry(entry));
    if (partial) notes.push('no-data');
    ctx.maps.load(entry, { srgb: true, wrapU: true }, (texture) => {
      if (!texture) {
        notes.push('map-load-failed');
        return;
      }
      uniforms.uMap.value = texture;
      mapParams.w = 1;
      applyMapScan(texture, partial, uniforms.uNoData.value as THREE.Vector4, notes);
    });
  } else {
    notes.push('surface-procedural');
  }
  return {
    parts: [new MeshPart(mesh)],
    provenance: entry ? 'mixed' : 'procedural',
    notes,
    extentKm: shape.extentKm,
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: entry ? 1 : 0,
  };
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

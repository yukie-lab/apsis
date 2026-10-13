/**
 * Planet rings: the radial profile, the ring mesh and its light model.
 *
 * The profile is a strip of N x 1 pixels. Red, green and blue hold the colour of the ring particles times
 * their albedo. Alpha holds the opacity for a ray along the ring axis: alpha = 1 - exp(-optical depth).
 * The code makes the strip from published ring limits and adds fine structure with noise.
 * If the manifest has a ring strip of Saturn with its inner and outer radius, the colour and the brightness of
 * each ring part come from this file (a photograph of the lit face). A photograph does not give the opacity, so
 * the code derives the optical depth from the brightness and from the limits of the fact sheet (see fileProfile).
 * Ring parts outside of the file (the F ring) stay as the code makes them.
 *
 * Light model: single scattering in a flat layer of particles (the classic formulas for reflected and for
 * transmitted light). The lit face is bright where the ring is dense. The unlit face is bright where the
 * ring is thin, and dark where it is dense. Dust (the F ring) is bright against the light.
 */
import * as THREE from 'three';
import { MeshPart, shaderBase } from './core';
import type { BuildContext } from './core';
import { buildAnnulus } from './geometry';
import { FRAG_HEAD, FRAG_TAIL } from './glsl';
import { findTexture, readMiddleRow, ringStripRadii } from './manifest';

/**
 * Ring limits of Saturn, km from the planet centre.
 * Source: NSSDC Saturnian Rings Fact Sheet (last update 19 April 2022), local copy data-src/factsheets/satringfact.html.
 * These are approximate published values. This work did not measure them.
 * The fact sheet lists gaps and ringlets by the radius of their inner edge.
 * The inner edge of the C ring and the outer edge of the A ring come from BODIES.SATURN.rings (the same fact sheet).
 */
const SATURN = {
  TITAN_RINGLET: 77871,
  MAXWELL_GAP: 87491,
  C_OUTER: 91975,
  B_OUTER: 117507,
  A_INNER: 122340,
  ENCKE_GAP: 133410,
  KEELER_GAP: 136487,
  F_RING: 139826,
};

/**
 * Widths of gaps and of the F ring, km. The fact sheet does not give them.
 * They are approximate values from general knowledge. No document was checked for them in this work.
 * The F ring is drawn wider than the real ring so that the strip can hold it.
 */
const SATURN_WIDTH = {
  TITAN_GAP: 180,
  MAXWELL_GAP: 270,
  HUYGENS_GAP: 400,
  ENCKE_GAP: 325,
  KEELER_GAP: 40,
  F_RING: 140,
};

/**
 * Optical depth and albedo of each ring. The ranges come from the same fact sheet:
 * C 0.05 to 0.35 (albedo 0.12 to 0.30), B 0.4 to 2.5 (0.4 to 0.6), Cassini division 0 to 0.1 (0.2 to 0.4),
 * A 0.4 to 1.0 (0.4 to 0.6), F 0.1 (0.6). The variation inside each ring is made by code. It is not measured.
 */
const SATURN_ALBEDO = { C: 0.22, B: 0.55, CASSINI: 0.3, A: 0.5, F: 0.6 };
/** Largest optical depth of each main ring: the upper limits of the ranges above. */
const SATURN_TAU_MAX = { C: 0.35, B: 2.5, CASSINI: 0.1, A: 1.0 };

/** Colour tints of the ring particles (sRGB, 0 to 255). Set by eye: pale tan for the dense rings, grey-brown for the thin rings. */
const SATURN_TINT: Record<string, [number, number, number]> = {
  C: [168, 156, 142],
  B: [232, 214, 184],
  CASSINI: [172, 160, 144],
  A: [222, 210, 188],
  F: [226, 224, 220],
};

/**
 * Rings of Uranus: radius (km), optical depth, width (km).
 * Source: NSSDC Uranus Rings Fact Sheet (last update 14 October 2015), local copy data-src/factsheets/uranringfact.html.
 * These are approximate published values. This work did not measure them.
 */
const URANUS_RINGS: [number, number, number][] = [
  [41837, 0.3, 1.5],
  [42234, 0.5, 2],
  [42571, 0.3, 2],
  [44718, 0.4, 7],
  [45661, 0.3, 8],
  [47176, 0.4, 1.6],
  [47627, 0.3, 2.5],
  [48300, 0.5, 5],
  [50024, 0.1, 2],
  [51149, 1.4, 58],
];
/** The rings of Uranus are a few km wide. A line that narrow is not visible, so each ring is drawn with this width at least (km). */
const URANUS_MIN_WIDTH = 70;
/**
 * Display albedo of the rings of Uranus, before the grey tint of the particles. With the tint the rings reflect
 * about 6 percent of the light. The fact sheet gives about 1.5 percent: rings that dark and that narrow do not show
 * at all after the tone mapping of the application. The larger value makes them thin faint lines. Set by eye.
 */
const URANUS_ALBEDO = 0.2;

/**
 * Brightness factor of the rings. The light model has single scattering only, and it has no opposition surge:
 * real rings are brighter. The factor is set by eye so that the B ring is about as bright as the planet.
 */
const RING_GAIN = 4.6;

function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1(i) * (1 - u) + hash1(i + 1) * u;
}
function fbm1(x: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise1(x);
    norm += amp;
    x = x * 2.07 + 13.7;
    amp *= 0.5;
  }
  return sum / norm;
}
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/**
 * Brightness pattern of the dense rings: many narrow bands of different width, mean value about 0.5.
 * A dense ring reflects about the same light at each optical depth, so the bands that photographs show are
 * differences of the particle albedo. The places of the bands here are made by code. They are not measured.
 */
function bandPattern(r: number): number {
  return 0.45 * fbm1(r / 1700 + 3, 3) + 0.35 * fbm1(r / 380 + 40, 3) + 0.2 * noise1(r / 95 + 9);
}
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

interface RingSample {
  tau: number;
  albedo: number;
  tint: [number, number, number];
}
const NONE: RingSample = { tau: 0, albedo: 0, tint: [0, 0, 0] };

/** One point of a strip: optical depth, and colour of the particles times their albedo (linear light). */
interface StripSample {
  tau: number;
  r: number;
  g: number;
  b: number;
}

/** Optical depth and colour of the rings of Saturn at radius r (km). */
function saturnSample(r: number, cInner: number, aOuter: number): RingSample {
  if (r < cInner) return NONE;
  if (r < SATURN.C_OUTER) {
    const t = (r - cInner) / (SATURN.C_OUTER - cInner);
    let tau = (0.05 + 0.06 * t) * (0.75 + 0.5 * fbm1(r / 520, 3));
    // Plateaus: narrow dense bands in the outer part of the C ring. Their places are made by code.
    if (r > 84000 && r < 91000) {
      const cell = (r - 84000) / 640;
      const f = cell - Math.floor(cell);
      if (hash1(Math.floor(cell) + 71) > 0.42) tau = Math.max(tau, 0.3 * smooth(0.28, 0.36, f) * (1 - smooth(0.62, 0.7, f)));
    }
    // The ring becomes denser near the B ring.
    tau += 0.16 * smooth(0.93, 1.0, t) * smooth(0.93, 1.0, t);
    let d = r - (SATURN.TITAN_RINGLET - 110);
    if (d > 0 && d < SATURN_WIDTH.TITAN_GAP) tau = d > 110 && d < 135 ? 0.3 : 0;
    d = r - SATURN.MAXWELL_GAP;
    if (d > 0 && d < SATURN_WIDTH.MAXWELL_GAP) tau = d > 95 && d < 160 ? 0.3 : 0;
    return { tau: clamp(tau, 0, SATURN_TAU_MAX.C), albedo: SATURN_ALBEDO.C, tint: SATURN_TINT.C };
  }
  if (r < SATURN.B_OUTER) {
    const t = (r - SATURN.C_OUTER) / (SATURN.B_OUTER - SATURN.C_OUTER);
    // Dense middle, less dense inner part. The general shape is approximate, the structure is made by code.
    const base = 0.95 - 0.3 * smooth(0.06, 0.14, t) + 1.0 * smooth(0.22, 0.34, t) + 0.75 * smooth(0.44, 0.52, t) - 0.55 * smooth(0.74, 0.82, t);
    const tau = base * (0.62 + 0.76 * fbm1(r / 330, 4)) * (0.9 + 0.2 * noise1(r / 85));
    // The inner part of the B ring is a little darker than the outer part.
    const albedo = SATURN_ALBEDO.B * (0.68 + 0.64 * bandPattern(r)) * (0.84 + 0.2 * smooth(0.05, 0.55, t));
    return { tau: clamp(tau, 0.4, SATURN_TAU_MAX.B), albedo, tint: SATURN_TINT.B };
  }
  if (r < SATURN.A_INNER) {
    const t = (r - SATURN.B_OUTER) / (SATURN.A_INNER - SATURN.B_OUTER);
    if (r - SATURN.B_OUTER < SATURN_WIDTH.HUYGENS_GAP) return NONE;
    const bands = 0.5 + 0.5 * Math.sin(noise1(r / 700) * 9 + r / 260);
    const tau = 0.025 + 0.045 * bands * noise1(r / 410) + 0.05 * smooth(0.72, 1.0, t);
    return { tau: clamp(tau, 0, SATURN_TAU_MAX.CASSINI), albedo: SATURN_ALBEDO.CASSINI, tint: SATURN_TINT.CASSINI };
  }
  if (r < aOuter) {
    let d = r - SATURN.ENCKE_GAP;
    if (d > 0 && d < SATURN_WIDTH.ENCKE_GAP) return NONE;
    d = r - SATURN.KEELER_GAP;
    if (d > 0 && d < SATURN_WIDTH.KEELER_GAP) return NONE;
    const t = (r - SATURN.A_INNER) / (aOuter - SATURN.A_INNER);
    let tau = 0.98 - 0.45 * smooth(0.03, 0.22, t) + 0.12 * smooth(0.74, 0.8, t);
    tau *= 0.9 + 0.2 * fbm1(r / 240, 3);
    // Wave trains in the outer part.
    if (t > 0.6) tau *= 1 + 0.1 * smooth(0.6, 0.8, t) * Math.sin(r / (28 + 20 * noise1(r / 900)));
    // The A ring is more even than the B ring. Its inner edge is the brightest part.
    const albedo = SATURN_ALBEDO.A * (0.84 + 0.32 * bandPattern(r + 5000)) * (1.08 - 0.14 * smooth(0.0, 0.3, t));
    return { tau: clamp(tau, 0.4, SATURN_TAU_MAX.A), albedo, tint: SATURN_TINT.A };
  }
  const x = (r - SATURN.F_RING) / (SATURN_WIDTH.F_RING / 2);
  const tau = 0.1 * Math.exp(-x * x);
  return tau > 0.002 ? { tau, albedo: SATURN_ALBEDO.F, tint: SATURN_TINT.F } : NONE;
}

function uranusSample(r: number): RingSample {
  let tau = 0;
  for (const [radius, depth, width] of URANUS_RINGS) {
    const x = (r - radius) / (Math.max(width, URANUS_MIN_WIDTH) / 2);
    tau += depth * Math.exp(-x * x);
  }
  return tau > 0.002 ? { tau, albedo: URANUS_ALBEDO, tint: [150, 150, 152] } : NONE;
}

/** True if the profile of the code has a ring part at a radius that the file does not cover. */
function hasRingOutside(code: (r: number) => RingSample, file: { inner: number; outer: number }, inner: number, outer: number): boolean {
  const steps = 4096;
  for (let i = 0; i <= steps; i++) {
    const r = inner + (i / steps) * (outer - inner);
    if ((r < file.inner || r > file.outer) && code(r).tau > 0) return true;
  }
  return false;
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** A sample of the code profile as a strip sample. */
function fromRing(s: RingSample): StripSample {
  return {
    tau: s.tau,
    r: srgbToLinear(s.tint[0] / 255) * s.albedo,
    g: srgbToLinear(s.tint[1] / 255) * s.albedo,
    b: srgbToLinear(s.tint[2] / 255) * s.albedo,
  };
}

/** One ring of a ring file: its limits (km) and the largest optical depth that the fact sheet gives for it. */
interface FileRegion {
  from: number;
  to: number;
  tauMax: number;
}

/** The value at the part `p` (0 to 1) of the sorted list of values. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * The profile function of a ring strip of the manifest.
 *
 * `row` holds one pixel row of the file (red, green, blue, alpha, 0 to 255). The file is a photograph of the lit
 * face: red, green and blue are the colour of a ring part, and alpha is its brightness (see the manifest).
 * A photograph does not give the opacity. The model of this function:
 *   - Colour: the colour of the file.
 *   - Albedo: in proportion to alpha. The median of the ring `bright` gets the albedo `albedoRef`.
 *   - Optical depth: inside each ring of `regions` it grows with the square of alpha, and the bright end of the
 *     ring (alpha at 95 percent of the sorted values) gets the largest optical depth of the fact sheet.
 * With the strip of Saturn of 14 October 2026 the model gives (values at 10, 50 and 90 percent of each ring):
 * C ring optical depth 0.02, 0.08, 0.23 and albedo 0.07, 0.16, 0.27; B ring 1.1, 1.8, 2.4 and 0.43, 0.55, 0.63;
 * Cassini division 0.004, 0.03, 0.10 and 0.09, 0.22, 0.41; A ring 0.61, 0.69, 0.92 and 0.35, 0.37, 0.43.
 * These numbers are the result of the model. They are not measured optical depths.
 * Outside of the radii of the file the function gives the profile of the code.
 * Returns null if the row has no brightness in the ring `bright`.
 */
function fileProfile(
  row: Uint8ClampedArray,
  file: { inner: number; outer: number },
  regions: FileRegion[],
  bright: FileRegion,
  albedoRef: number,
  code: (r: number) => RingSample,
): ((r: number) => StripSample) | null {
  const w = row.length >> 2;
  if (w < 2) return null;
  const level = new Float32Array(w);
  const colour = new Float32Array(w * 3);
  for (let i = 0; i < w; i++) {
    level[i] = row[i * 4 + 3] / 255;
    let top = 0;
    for (let k = 0; k < 3; k++) {
      colour[i * 3 + k] = srgbToLinear(row[i * 4 + k] / 255);
      top = Math.max(top, colour[i * 3 + k]);
    }
    // The largest channel becomes 1: the brightness is in alpha only.
    if (top > 0) for (let k = 0; k < 3; k++) colour[i * 3 + k] /= top;
  }
  const radiusOf = (i: number): number => file.inner + ((i + 0.5) / w) * (file.outer - file.inner);
  const levelsIn = (g: FileRegion): number[] => {
    const out: number[] = [];
    for (let i = 0; i < w; i++) {
      const r = radiusOf(i);
      if (r >= g.from && r < g.to) out.push(level[i]);
    }
    return out;
  };
  const ref = percentile(levelsIn(bright), 0.5);
  if (!(ref > 0)) return null;
  const tau = new Float32Array(w);
  for (const g of regions) {
    const high = percentile(levelsIn(g), 0.95);
    if (!(high > 0)) continue;
    for (let i = 0; i < w; i++) {
      const r = radiusOf(i);
      if (r >= g.from && r < g.to) {
        const x = Math.min(1, level[i] / high);
        tau[i] = g.tauMax * x * x;
      }
    }
  }
  return (r: number): StripSample => {
    if (r < file.inner || r > file.outer) return fromRing(code(r));
    // Linear interpolation between the centres of two pixels of the file.
    const x = clamp(((r - file.inner) / (file.outer - file.inner)) * w - 0.5, 0, w - 1);
    const i0 = Math.min(Math.floor(x), w - 2);
    const f = x - i0;
    const albedo = (albedoRef * (level[i0] * (1 - f) + level[i0 + 1] * f)) / ref;
    const at = (k: number): number => Math.min(1, albedo * (colour[i0 * 3 + k] * (1 - f) + colour[i0 * 3 + 3 + k] * f));
    return { tau: tau[i0] * (1 - f) + tau[i0 + 1] * f, r: at(0), g: at(1), b: at(2) };
  };
}

/** Makes the strip from a profile function. Each pixel is the mean of four samples. */
function makeStrip(sample: (r: number) => StripSample, inner: number, outer: number, size: number): THREE.DataTexture {
  const data = new Uint8Array(size * 4);
  const sub = 4;
  for (let i = 0; i < size; i++) {
    let rr = 0;
    let gg = 0;
    let bb = 0;
    let trans = 0;
    let weight = 0;
    for (let k = 0; k < sub; k++) {
      const r = inner + ((i + (k + 0.5) / sub) / size) * (outer - inner);
      const s = sample(r);
      const opacity = 1 - Math.exp(-s.tau);
      rr += opacity * s.r;
      gg += opacity * s.g;
      bb += opacity * s.b;
      weight += opacity;
      trans += Math.exp(-s.tau);
    }
    const w = weight > 1e-6 ? 1 / weight : 0;
    data[i * 4] = Math.round(255 * linearToSrgb(rr * w));
    data[i * 4 + 1] = Math.round(255 * linearToSrgb(gg * w));
    data[i * 4 + 2] = Math.round(255 * linearToSrgb(bb * w));
    data[i * 4 + 3] = Math.round(255 * (1 - trans / sub));
  }
  const t = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.name = 'bodies/ring-strip';
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
uniform sampler2D uRing;
uniform vec4 uRingParams;     // x: inner radius of the strip (km), y: outer radius (km), z: factor of the optical depth, w: brightness
uniform vec4 uRingDust;       // x: radius (km) beyond which the ring is dust, y: asymmetry of the dust, z: dust part of the main rings
uniform vec3 uPlanetRadii;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uSunColor;
uniform float uSunAngR;
uniform float uNightFill;     // fill light of the caller for the parts with no sunlight (0 = none)
varying vec3 vPos;

// (1 - exp(-z)) / z for z >= 0, also near zero.
float ratio1(float z) {
  return z < 1e-3 ? 1.0 - 0.5 * z : (1.0 - exp(-z)) / z;
}

// Part of the sunlight that reaches a ring point: the planet can hide the Sun.
// The calculation is in a space where the planet is a sphere of radius 1, so t, d and w are lengths in planet radii.
float planetShadow(vec3 p, vec3 s) {
  vec3 pw = p / uPlanetRadii;
  vec3 sw = normalize(s / uPlanetRadii);
  float t = -dot(pw, sw);                 // > 0: the planet is on the Sun side of the point
  if (t <= 0.0) return 1.0;
  float d = sqrt(max(dot(pw, pw) - t * t, 0.0));   // distance from the axis of the shadow
  float w = max(0.004, t * uSunAngR);              // half-width of the soft edge: it grows with the distance behind the planet
  return smoothstep(1.0 - w, 1.0 + w, d);
}

void main() {
  #include <logdepthbuf_fragment>
  float r = length(vPos.xy);
  float x = (r - uRingParams.x) / (uRingParams.y - uRingParams.x);
  vec4 strip = texture2D(uRing, vec2(x, 0.5));
  if (x <= 0.0 || x >= 1.0 || strip.a < 0.002) discard;
  float tau = -log(1.0 - min(strip.a, 0.985)) * uRingParams.z;
  vec3 v = normalize(uCamPos - vPos);
  float mu = max(abs(v.z), 0.02);
  float mu0 = max(abs(uSunDir.z), 0.02);
  float cosPhase = dot(v, uSunDir);
  float phase = acos(clamp(cosPhase, -1.0, 1.0));
  // Large particles send the light back (phase function of a Lambert sphere). Dust sends the light forward.
  float back = (8.0 / (3.0 * PI)) * (sin(phase) + (PI - phase) * cosPhase);
  float g = uRingDust.y;
  float forward = (1.0 - g * g) / pow(max(1.0 + g * g + 2.0 * g * cosPhase, 1e-4), 1.5);
  float dust = max(uRingDust.z, smoothstep(uRingDust.x, uRingDust.x + 800.0, r));
  float P = mix(back, forward, dust);
  float xs = 1.0 / mu0;
  float xv = 1.0 / mu;
  float amount;
  if (v.z * uSunDir.z > 0.0) {
    // The camera sees the lit face: reflected light.
    amount = mu0 / (mu0 + mu) * (1.0 - exp(-tau * (xs + xv)));
  } else {
    // The camera sees the unlit face: light that passes through the ring.
    amount = xv * tau * exp(-tau * min(xs, xv)) * ratio1(tau * abs(xv - xs));
  }
  float shadow = planetShadow(vPos, uSunDir);
  vec3 color = uSunColor * strip.rgb * (uRingParams.w * 0.25 * P * amount * shadow);
  float alpha = 1.0 - exp(-tau * xv);
  // The fill light of the caller: a ring part with no sunlight shows its colour. This is the part in the shadow
  // of the planet, and the face that the Sun does not light.
  float day = v.z * uSunDir.z > 0.0 ? shadow : 0.0;
  color += uSunColor * strip.rgb * (uNightFill * alpha * (1.0 - day));
  gl_FragColor = vec4(color, alpha);
  ${FRAG_TAIL}
}
`;

/** Shader text for a planet: part of the sunlight that passes the rings on its way to the point p. */
export const GLSL_RING_SHADOW = /* glsl */ `
uniform sampler2D uRing;
uniform vec4 uRingParams;
float ringShadow(vec3 p, vec3 s) {
  float sz = abs(s.z) < 1e-4 ? 1e-4 : s.z;
  float t = -p.z / sz;
  vec2 q = p.xy + s.xy * t;
  float x = (length(q) - uRingParams.x) / (uRingParams.y - uRingParams.x);
  float a = textureGrad(uRing, vec2(x, 0.5), vec2(dFdx(x), 0.0), vec2(dFdy(x), 0.0)).a;
  if (t <= 0.0 || x <= 0.0 || x >= 1.0) return 1.0;
  float tau = -log(1.0 - min(a, 0.985)) * uRingParams.z;
  return exp(-tau / max(abs(s.z), 0.03));
}
`;

export interface RingSystem {
  part: MeshPart;
  /** Uniforms for GLSL_RING_SHADOW. The planet material uses the same objects. */
  shadowUniforms: { uRing: THREE.IUniform; uRingParams: THREE.IUniform };
  /** Outer radius of the ring mesh, km. */
  outerKm: number;
  /** 1 if the strip comes from the code only, 0 if the code has built it from a file of the manifest. */
  codeTextures(): number;
}

/** Builds the rings of a planet, or returns null for a planet with no ring limits in the body table. */
export function buildRings(ctx: BuildContext, limits: { inner: number; outer: number }, notes: string[]): RingSystem | null {
  const size = ctx.quality === 'high' ? 2048 : 1024;
  const isSaturn = ctx.id === 'SATURN';
  const isUranus = ctx.id === 'URANUS';
  if (!isSaturn && !isUranus) return null;

  const codeSample = isSaturn ? (r: number): RingSample => saturnSample(r, limits.inner, limits.outer) : uranusSample;
  const entry = findTexture(ctx.maps.manifest, ctx.id, 'ring');
  const fileRadii = entry ? ringStripRadii(entry) : null;
  // The strip covers the rings of the code and the rings of the file.
  const inner = Math.min(isSaturn ? limits.inner - 600 : limits.inner - 500, fileRadii ? fileRadii.inner : Infinity);
  const outer = Math.max(isSaturn ? SATURN.F_RING + SATURN_WIDTH.F_RING * 2 : limits.outer + 500, fileRadii ? fileRadii.outer : 0);
  const params = new THREE.Vector4(inner, outer, 1, RING_GAIN);
  const strip = makeStrip((r) => fromRing(codeSample(r)), inner, outer, size);
  const uRing: THREE.IUniform = { value: strip };
  const uRingParams: THREE.IUniform = { value: params };
  const owned: THREE.Texture[] = [strip];
  let codeTextures = 1;
  notes.push('rings-procedural');
  if (isUranus) notes.push('ring-width-exaggerated', 'ring-brightness-exaggerated');

  // A strip of the manifest gives the colour and the brightness of the rings, if the manifest gives its radii.
  // The opacity model needs the ring limits and the optical depths of the fact sheet, so it exists for Saturn only.
  if (entry && fileRadii && isSaturn) {
    const ringB: FileRegion = { from: SATURN.C_OUTER, to: SATURN.B_OUTER, tauMax: SATURN_TAU_MAX.B };
    const regions: FileRegion[] = [
      { from: limits.inner, to: SATURN.C_OUTER, tauMax: SATURN_TAU_MAX.C },
      ringB,
      { from: SATURN.B_OUTER, to: SATURN.A_INNER, tauMax: SATURN_TAU_MAX.CASSINI },
      { from: SATURN.A_INNER, to: limits.outer, tauMax: SATURN_TAU_MAX.A },
    ];
    ctx.maps.load(entry, { srgb: true, wrapU: false }, (texture) => {
      const row = texture ? readMiddleRow(texture) : null;
      const profile = row ? fileProfile(row, fileRadii, regions, ringB, SATURN_ALBEDO.B, codeSample) : null;
      if (!profile) {
        notes.push('ring-map-load-failed');
        return;
      }
      // The file is sharper than the strip of the code, so the new strip has twice as many pixels.
      const merged = makeStrip(profile, inner, outer, size * 2);
      owned.push(merged);
      uRing.value = merged;
      strip.dispose();
      owned.splice(owned.indexOf(strip), 1);
      codeTextures = 0;
      const k = notes.indexOf('rings-procedural');
      if (k >= 0) notes.splice(k, 1);
      notes.push('rings-map', 'ring-opacity-modelled');
      // Ring parts beyond the file (the F ring of Saturn) still come from the code.
      if (hasRingOutside(codeSample, fileRadii, inner, outer)) notes.push('rings-partly-procedural');
    });
  } else if (entry) {
    notes.push(fileRadii ? 'ring-map-unused' : 'ring-map-without-radii');
  }

  const meshOuter = outer;
  const meshInner = inner;
  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/rings`),
    uniforms: {
      uRing,
      uRingParams,
      // Beyond the A ring the rings of Saturn are dust (F ring). The rings of Uranus are large dark particles.
      uRingDust: { value: new THREE.Vector4(isSaturn ? limits.outer + 1200 : 1e12, 0.72, isSaturn ? 0.05 : 0.02, 0) },
      uPlanetRadii: { value: new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm) },
      uSunDir: ctx.frame.uSunDir,
      uCamPos: ctx.frame.uCamPos,
      uSunColor: ctx.frame.uSunColor,
      uSunAngR: ctx.frame.uSunAngR,
      uNightFill: ctx.frame.uNightFill,
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(buildAnnulus(meshInner, meshOuter, ctx.quality === 'high' ? 128 : 64), material);
  mesh.name = `${ctx.id}/rings`;
  ctx.root.add(mesh);
  const part = new MeshPart(mesh);
  const dispose = part.dispose.bind(part);
  part.dispose = (): void => {
    dispose();
    for (const t of owned) t.dispose();
  };
  return { part, shadowUniforms: { uRing, uRingParams }, outerKm: meshOuter * 1.01, codeTextures: () => codeTextures };
}

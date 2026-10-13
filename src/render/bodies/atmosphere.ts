/**
 * Atmosphere: the numbers of each body and the shell that draws the air outside of the disc.
 *
 * The surface shader of a body adds the air in front of the ground (GLSL_ATMOSPHERE in glsl.ts).
 * The shell draws only the rays that pass the ground: the thin bright line at the limb and the twilight arc.
 * It is a sphere a little larger than the top of the atmosphere. The mesh draws its far side, so the body
 * hides it where the ray hits the ground.
 */
import * as THREE from 'three';
import { Globe, shaderBase } from './core';
import type { FrameUniforms } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_ATMOSPHERE, VERT_UNIT_SPHERE } from './glsl';
import type { BodyQuality } from './types';

type Rgb = [number, number, number];

export interface AtmosphereSpec {
  /** Scale height, km. */
  scaleHeightKm: number;
  /** Scattering of the gas at the base, 1/km (red, green, blue). Phase function of Rayleigh. */
  gas: Rgb;
  /** Scattering of the haze at the base, 1/km. Forward phase function. */
  haze: Rgb;
  /** Absorption at the base, 1/km. */
  absorption: Rgb;
  /** Asymmetry of the haze phase function (0 = even, 1 = all light goes forward). */
  hazeG: number;
  /** Factor for the light that scatters more than one time (1 = single scattering only). */
  multiple: number;
  /** The shell ends at this number of scale heights above the base. */
  topScaleHeights: number;
  /** Altitude of the base of the model above the body radius, km (top of a cloud deck). 0 for a solid surface. */
  baseAltitudeKm: number;
  /** Light of the sky on the ground, as a part of the light that the air takes from the Sun beam (red, green, blue). */
  skyFill: Rgb;
}

/**
 * Earth. Scale height: NSSDC Earth Fact Sheet (8.5 km). Gas scattering at sea level for 680, 550 and 440 nm:
 * the values that computer graphics papers use for Rayleigh scattering (5.8e-6, 13.5e-6, 33.1e-6 per metre).
 * The haze part and the factor for multiple scattering are set by eye.
 */
export const ATMOSPHERE_EARTH: AtmosphereSpec = {
  scaleHeightKm: 8.5,
  gas: [0.0058, 0.0135, 0.0331],
  haze: [0.0012, 0.0012, 0.0012],
  absorption: [0.0002, 0.0005, 0.0001],
  hazeG: 0.72,
  multiple: 1.25,
  topScaleHeights: 10,
  baseAltitudeKm: 0,
  skyFill: [0.3, 0.42, 0.6],
};

/**
 * Mars. Scale height: NSSDC Mars Fact Sheet (11.0 km). The dust numbers are set by eye for a thin tan rim:
 * the dust takes blue light away, and it sends most light forward.
 */
export const ATMOSPHERE_MARS: AtmosphereSpec = {
  scaleHeightKm: 11.0,
  gas: [0.00002, 0.00005, 0.00012],
  haze: [0.0058, 0.0046, 0.0034],
  absorption: [0.0002, 0.0012, 0.003],
  hazeG: 0.68,
  multiple: 1.3,
  topScaleHeights: 9,
  baseAltitudeKm: 0,
  skyFill: [0.5, 0.4, 0.3],
};

/**
 * Venus, above the cloud deck. Scale height: NSSDC Venus Fact Sheet (15.9 km, a value for the low atmosphere,
 * used here so that the rim is visible). Cloud top altitude and haze numbers: approximate, set by eye.
 */
export const ATMOSPHERE_VENUS: AtmosphereSpec = {
  scaleHeightKm: 15.9,
  gas: [0.0004, 0.0009, 0.002],
  haze: [0.02, 0.019, 0.016],
  absorption: [0.0, 0.0004, 0.002],
  hazeG: 0.7,
  multiple: 1.5,
  topScaleHeights: 8,
  baseAltitudeKm: 65,
  skyFill: [0.5, 0.5, 0.45],
};

/**
 * Titan, above the thick part of the haze. All numbers are approximate and set by eye: an orange haze with a
 * large scale height that takes blue light away, on a deck 100 km above the surface.
 */
export const ATMOSPHERE_TITAN: AtmosphereSpec = {
  scaleHeightKm: 45,
  gas: [0.0003, 0.0006, 0.0016],
  haze: [0.022, 0.017, 0.009],
  absorption: [0.001, 0.007, 0.022],
  hazeG: 0.6,
  multiple: 1.6,
  topScaleHeights: 9,
  baseAltitudeKm: 100,
  skyFill: [0.5, 0.4, 0.25],
};

/** Titan with the surface map: a thin haze so that the map stays visible. Set by eye. */
export const ATMOSPHERE_TITAN_THIN: AtmosphereSpec = {
  scaleHeightKm: 45,
  gas: [0.0001, 0.0002, 0.0005],
  haze: [0.0028, 0.0022, 0.0012],
  absorption: [0.0001, 0.0008, 0.0026],
  hazeG: 0.6,
  multiple: 1.4,
  topScaleHeights: 9,
  baseAltitudeKm: 0,
  skyFill: [0.5, 0.4, 0.25],
};

/**
 * Pluto. A very thin blue haze that is visible only against the light. Approximate, set by eye
 * (the haze of Pluto has a scale height of some tens of km).
 */
export const ATMOSPHERE_PLUTO: AtmosphereSpec = {
  scaleHeightKm: 45,
  gas: [0.00001, 0.00002, 0.00005],
  haze: [0.00004, 0.00007, 0.00013],
  absorption: [0, 0, 0],
  hazeG: 0.78,
  multiple: 1.0,
  topScaleHeights: 7,
  baseAltitudeKm: 0,
  skyFill: [0, 0, 0],
};

export interface AtmosphereUniforms {
  uAtm: { value: THREE.Vector4 };
  uAtmExt: { value: THREE.Vector3 };
  uAtmRay: { value: THREE.Vector3 };
  uAtmMie: { value: THREE.Vector3 };
  uAtmHaze: { value: THREE.Vector2 };
  uSkyFill: { value: THREE.Vector3 };
}

/** Top radius of the atmosphere model, km. */
export function atmosphereTop(spec: AtmosphereSpec, equatorialRadiusKm: number): number {
  return equatorialRadiusKm + spec.baseAltitudeKm + spec.topScaleHeights * spec.scaleHeightKm;
}

/** Uniform values of GLSL_ATMOSPHERE for a body. The base of the model is a sphere in the scaled space. */
export function atmosphereUniforms(spec: AtmosphereSpec, equatorialRadiusKm: number, polarRadiusKm: number): AtmosphereUniforms {
  const base = equatorialRadiusKm + spec.baseAltitudeKm;
  const ext = new THREE.Vector3(
    spec.gas[0] + spec.haze[0] + spec.absorption[0],
    spec.gas[1] + spec.haze[1] + spec.absorption[1],
    spec.gas[2] + spec.haze[2] + spec.absorption[2],
  );
  return {
    uAtm: { value: new THREE.Vector4(base, spec.scaleHeightKm, atmosphereTop(spec, equatorialRadiusKm), equatorialRadiusKm / polarRadiusKm) },
    uAtmExt: { value: ext },
    uAtmRay: { value: new THREE.Vector3(...spec.gas) },
    uAtmMie: { value: new THREE.Vector3(...spec.haze) },
    uAtmHaze: { value: new THREE.Vector2(spec.hazeG, spec.multiple) },
    uSkyFill: { value: new THREE.Vector3(...spec.skyFill) },
  };
}

const SHELL_FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_ATMOSPHERE}
uniform vec3 uShellRadii;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uSunColor;
uniform float uGapLimit;
varying vec3 vUnit;
void main() {
  #include <logdepthbuf_fragment>
  vec3 pos = vUnit * uShellRadii;
  vec3 k = vec3(1.0, 1.0, uAtm.w);
  vec3 ro = uCamPos * k;
  vec3 rdTrue = normalize(pos - uCamPos);
  vec3 rd = normalize((pos - uCamPos) * k);
  vec3 sun = normalize(uSunDir * k);
  float R = uAtm.x;
  float tca = -dot(ro, rd);
  vec3 q = ro + rd * tca;
  float d2 = dot(q, q);
  float tGround = -1.0;
  if (tca > 0.0 && d2 < R * R) {
    // The ray hits the ground. The surface mesh draws this pixel, except in the thin gap at the edge of its polygons.
    if (d2 < R * R * uGapLimit) discard;
    tGround = tca - sqrt(R * R - d2);
  }
  vec3 scatter;
  vec3 trans;
  atmScatter(ro, rd, tGround, sun, dot(rdTrue, uSunDir), scatter, trans);
  float alpha = tGround > 0.0 ? 1.0 : 1.0 - dot(trans, vec3(0.3333));
  gl_FragColor = vec4(scatter * uSunColor, alpha);
  ${FRAG_TAIL}
}
`;

/**
 * The shell mesh of an atmosphere. It is transparent with a pre-multiplied colour: the air adds its light
 * and it dims the objects behind it.
 */
export function makeAtmosphereShell(
  name: string,
  spec: AtmosphereSpec,
  equatorialRadiusKm: number,
  polarRadiusKm: number,
  quality: BodyQuality,
  frame: FrameUniforms,
): Globe {
  const columns = quality === 'high' ? 96 : 48;
  // The polygon mesh must contain the round top of the atmosphere.
  const margin = 1.002 / Math.cos(Math.PI / columns);
  const top = atmosphereTop(spec, equatorialRadiusKm) * margin;
  const radii = new THREE.Vector3(top, top, (top * polarRadiusKm) / equatorialRadiusKm);
  // Largest relative error of the outline of the coarsest surface sphere (48 columns), with a margin.
  const gap = 1 - 2.5 * (1 - Math.cos(Math.PI / 48));
  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${name}/material`),
    defines: { ATM_SAMPLES: quality === 'high' ? 10 : 5 },
    uniforms: {
      ...atmosphereUniforms(spec, equatorialRadiusKm, polarRadiusKm),
      uShellRadii: { value: radii },
      uGapLimit: { value: gap * gap },
      uSunDir: frame.uSunDir,
      uCamPos: frame.uCamPos,
      uSunColor: frame.uSunColor,
    },
    vertexShader: VERT_UNIT_SPHERE,
    fragmentShader: SHELL_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  return new Globe(name, material, radii, quality, { columns, rows: columns / 2 });
}

/**
 * The Sun. All of it is made by code: the manifest has no real map of the Sun, and the surface of the Sun has
 * no fixed features.
 *
 * Surface: bright cells with darker lanes that change slowly (a picture of granulation, much larger than the real
 * granules so that it is visible on the whole disc), a slow large pattern, and limb darkening that is stronger
 * for blue light. The colour is bright after tone mapping, and it stays below pure white so that the detail is visible.
 * Glow: a shell of several solar radii. Its brightness falls fast with the distance from the limb, like the corona.
 */
import * as THREE from 'three';
import { Globe, shaderBase } from './core';
import type { BuildContext, Built } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_NOISE, VERT_UNIT_SPHERE } from './glsl';

/** Radius of the glow shell in solar radii. */
const GLOW_RADII = 6;

/** Radiance of the disc centre before tone mapping (red, green, blue). Set by eye for the ACES tone curve. */
const CORE_COLOR: [number, number, number] = [1.9, 1.32, 0.62];

/** Limb darkening: I(mu) = 1 - u * (1 - mu). Approximate values for red, green and blue light. */
const LIMB_U: [number, number, number] = [0.5, 0.64, 0.82];

const SURFACE_FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_NOISE}
uniform vec3 uRadii;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uCore;
uniform vec3 uLimb;
varying vec3 vUnit;

#ifdef SUN_CELLS
// Distance to the nearest and to the second nearest cell centre. The centres move slowly.
vec2 cells(vec3 p, float t) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 h = hash33(i + g);
        vec3 r = g + 0.5 + 0.36 * sin(t + PI2 * h) - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
  }
  return sqrt(vec2(d1, d2));
}
#endif

void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vUnit);
  vec3 v = normalize(uCamPos - dir * uRadii);
  float mu = max(dot(dir, v), 0.0);
  #ifdef SUN_CELLS
    vec2 c1 = cells(dir * 24.0, uTime * 0.22);
    float cell = smoothstep(0.03, 0.34, c1.y - c1.x);
    vec2 c2 = cells(dir * 57.0 + 4.0, uTime * 0.35 + 2.0);
    float fine = smoothstep(0.03, 0.3, c2.y - c2.x);
  #else
    float cell = vnoise(dir * 34.0 + uTime * 0.03);
    float fine = vnoise(dir * 80.0 - uTime * 0.05);
  #endif
  float large = fbm(dir * 3.4 + uTime * 0.006, 4);
  float bright = 0.8 + 0.17 * cell + 0.08 * fine + 0.3 * (large - 0.5);
  // Bright patches that show near the limb (a picture of faculae).
  bright += 0.22 * (1.0 - mu) * smoothstep(0.55, 0.8, fbm(dir * 7.0 + 3.0 - uTime * 0.004, 3));
  vec3 darkening = 1.0 - uLimb * (1.0 - mu);
  gl_FragColor = vec4(uCore * bright * darkening, 1.0);
  ${FRAG_TAIL}
}
`;

const GLOW_FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_NOISE}
uniform vec3 uCamPos;
uniform vec4 uGlow;          // x: radius of the Sun (km), y: radius of the shell mesh (km), z: radius where the glow ends (solar radii), w: brightness
uniform float uTime;
varying vec3 vUnit;
void main() {
  #include <logdepthbuf_fragment>
  vec3 pos = vUnit * uGlow.y;
  vec3 rd = normalize(pos - uCamPos);
  float tca = -dot(uCamPos, rd);
  // Nearest point of the view ray to the centre of the Sun. Behind the camera the nearest point is the camera.
  vec3 q = tca > 0.0 ? uCamPos + rd * tca : uCamPos;
  float x = max(length(q) / uGlow.x, 1.0);
  // Fast fall near the limb, slow fall farther out (the shape of the corona brightness).
  float glow = 1.1 * exp(-(x - 1.0) / 0.04) + 0.5 * pow(x, -7.0) + 0.11 * pow(x, -2.6);
  // Faint streamers: the brightness changes with the direction around the disc.
  vec3 qd = normalize(q);
  float rays = fbm(qd * 2.6 + uTime * 0.003, 3) * 0.7 + fbm(qd * 9.0 - uTime * 0.004, 2) * 0.3;
  glow *= mix(1.0, 0.35 + 1.3 * rays, smoothstep(1.02, 1.9, x));
  glow *= 1.0 - smoothstep(0.62 * uGlow.z, uGlow.z, x);
  vec3 tint = mix(vec3(1.0, 0.72, 0.4), vec3(1.0, 0.9, 0.78), smoothstep(1.0, 1.5, x));
  gl_FragColor = vec4(tint * (glow * uGlow.w), 1.0);
  ${FRAG_TAIL}
}
`;

/** Builds the Sun. */
export function buildSun(ctx: BuildContext, notes: string[]): Built {
  const radii = new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm);
  const high = ctx.quality === 'high';
  const surface = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/surface`),
    defines: high ? { SUN_CELLS: 1 } : {},
    uniforms: {
      uRadii: { value: radii },
      uCamPos: ctx.frame.uCamPos,
      uTime: ctx.frame.uTime,
      uCore: { value: new THREE.Vector3(...CORE_COLOR) },
      uLimb: { value: new THREE.Vector3(...LIMB_U) },
    },
    vertexShader: VERT_UNIT_SPHERE,
    fragmentShader: SURFACE_FRAGMENT,
  });
  const globe = new Globe(`${ctx.id}/surface`, surface, radii, ctx.quality);
  ctx.root.add(globe.mesh);

  const columns = high ? 64 : 32;
  // The polygon mesh must contain the sphere where the glow ends.
  const shellRadius = (GLOW_RADII * ctx.radiusKm * 1.01) / Math.cos(Math.PI / columns);
  const glow = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/glow`),
    uniforms: {
      uCamPos: ctx.frame.uCamPos,
      uTime: ctx.frame.uTime,
      uGlow: { value: new THREE.Vector4(ctx.radiusKm, shellRadius, GLOW_RADII, 1) },
    },
    vertexShader: VERT_UNIT_SPHERE,
    fragmentShader: GLOW_FRAGMENT,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shell = new Globe(`${ctx.id}/glow`, glow, new THREE.Vector3(shellRadius, shellRadius, shellRadius), ctx.quality, { columns, rows: columns / 2 });
  ctx.root.add(shell.mesh);
  notes.push('surface-procedural', 'glow-procedural');
  return {
    parts: [globe, shell],
    provenance: 'procedural',
    notes,
    extentKm: shellRadius,
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: 0,
  };
}

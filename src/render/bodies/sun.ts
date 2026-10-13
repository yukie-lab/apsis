/**
 * The Sun. All of it is made by code: the manifest has no real map of the Sun, and the surface of the Sun has
 * no fixed features.
 *
 * Surface: bright cells with darker lanes that change slowly (a picture of granulation, much larger than the real
 * granules so that it is visible on the whole disc), a slow large pattern, and limb darkening that is stronger
 * for blue light. The colour is bright after tone mapping, and it stays below pure white so that the detail is visible.
 * A cell pattern fades out when its cells are only a few pixels wide, so a small disc does not flicker.
 * Glow: a shell of several solar radii. Its brightness falls fast with the distance from the limb, like the corona.
 *
 * The display time: a shader has numbers of 32 bits, and a large time (the seconds of the wall clock, for example)
 * has too few digits left for a smooth motion. So the code wraps the time before the shaders get it (see `SunClock`).
 */
import * as THREE from 'three';
import { Globe, shaderBase } from './core';
import type { BuildContext, Built, Part } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_NOISE, VERT_UNIT_SPHERE } from './glsl';

/** Radius of the glow shell in solar radii. */
const GLOW_RADII = 5;

/**
 * Radiance of the disc centre before tone mapping (red, green, blue). Set by eye for the ACES tone curve:
 * the curve takes colour away from bright light, so the value has more colour than the result on the screen.
 */
const CORE_COLOR: [number, number, number] = [1.7, 0.86, 0.14];

/**
 * Limb darkening: I(mu) = 1 - u * (1 - mu). The real Sun has about 0.5 (red) to 0.8 (blue) in visible light.
 * The values here are a little stronger so that the effect remains visible after tone mapping.
 */
const LIMB_U: [number, number, number] = [0.56, 0.74, 0.9];

/** Speed of the cell centres, radians of their motion for each second of display time: large cells, small cells. */
const CELL_RATE = 0.22;
const FINE_RATE = 0.35;
/** Start phase of the small cells, radians. It keeps the two cell patterns out of step. */
const FINE_PHASE = 2;
/**
 * The slow patterns drift through a noise field that does not repeat, so their time cannot wrap without a step.
 * It wraps after this many seconds (about 55 hours): the slow patterns change in one step at that moment.
 * The value is small enough for 32 bit numbers: the largest shift in the noise field is 10000 cells.
 */
const DRIFT_WRAP_SECONDS = 200000;

const SURFACE_FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_NOISE}
uniform vec3 uRadii;
uniform vec3 uCamPos;
uniform vec3 uSunTime;       // x: time of the slow patterns (s, wrapped), y: phase of the cells (rad), z: phase of the small cells (rad)
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
  // Size of one pixel on the unit sphere.
  float px = max(length(dFdx(dir)), length(dFdy(dir)));
  float cellFade = 1.0 - smoothstep(0.14, 0.4, px * CELL_SCALE);
  float fineFade = 1.0 - smoothstep(0.14, 0.4, px * FINE_SCALE);
  // 0.6 is about the mean value of a cell pattern.
  float cell = 0.6;
  float fine = 0.6;
  #ifdef SUN_CELLS
    if (cellFade > 0.0) {
      vec2 c1 = cells(dir * CELL_SCALE, uSunTime.y);
      cell = mix(0.6, smoothstep(0.03, 0.34, c1.y - c1.x), cellFade);
    }
    if (fineFade > 0.0) {
      vec2 c2 = cells(dir * FINE_SCALE + 4.0, uSunTime.z);
      fine = mix(0.6, smoothstep(0.03, 0.3, c2.y - c2.x), fineFade);
    }
  #else
    cell = mix(0.6, vnoise(dir * CELL_SCALE * 1.4 + uSunTime.x * 0.03), cellFade);
    fine = mix(0.6, vnoise(dir * FINE_SCALE + uSunTime.x * 0.05), fineFade);
  #endif
  float large = fbm(dir * 3.4 + uSunTime.x * 0.006, 4);
  float bright = 0.66 + 0.3 * cell + 0.12 * fine + 0.34 * (large - 0.5);
  // Bright patches that show near the limb (a picture of faculae).
  bright += 0.3 * (1.0 - mu) * smoothstep(0.55, 0.8, fbm(dir * 7.0 + 3.0 - uSunTime.x * 0.004, 3));
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
uniform vec3 uSunTime;       // x: time of the slow patterns (s, wrapped)
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
  float glow = 0.9 * exp(-(x - 1.0) / 0.035) + 0.34 * pow(x, -8.0) + 0.045 * pow(x, -3.0);
  // Faint streamers: the brightness changes with the direction around the disc.
  vec3 qd = normalize(q);
  float rays = fbm(qd * 2.6 + uSunTime.x * 0.003, 3) * 0.7 + fbm(qd * 9.0 - uSunTime.x * 0.004, 2) * 0.3;
  glow *= mix(1.0, 0.35 + 1.3 * rays, smoothstep(1.02, 1.9, x));
  glow *= 1.0 - smoothstep(0.62 * uGlow.z, uGlow.z, x);
  vec3 tint = mix(vec3(1.0, 0.6, 0.2), vec3(1.0, 0.74, 0.46), smoothstep(1.0, 1.6, x));
  gl_FragColor = vec4(tint * (glow * uGlow.w), 1.0);
  ${FRAG_TAIL}
}
`;

/**
 * Wraps the display time for the shaders of the Sun. The work is in 64 bit numbers on the CPU.
 * The cell centres move on circles, so their phase wraps with no step. The slow patterns wrap with one step
 * each DRIFT_WRAP_SECONDS.
 */
class SunClock implements Part {
  readonly value = new THREE.Vector3();

  constructor(private readonly time: { value: number }) {
    this.update();
  }

  update(): void {
    const t = this.time.value;
    this.value.set(t % DRIFT_WRAP_SECONDS, (t * CELL_RATE) % (2 * Math.PI), (t * FINE_RATE + FINE_PHASE) % (2 * Math.PI));
  }

  triangles(): number {
    return 0;
  }

  trianglesMax(): number {
    return 0;
  }

  dispose(): void {}
}

/** Builds the Sun. */
export function buildSun(ctx: BuildContext, notes: string[]): Built {
  const radii = new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm);
  const high = ctx.quality === 'high';
  const clock = new SunClock(ctx.frame.uTime);
  const surface = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/surface`),
    // Number of cells along one radius of the Sun, for the two cell patterns.
    defines: high ? { SUN_CELLS: 1, CELL_SCALE: '34.0', FINE_SCALE: '92.0' } : { CELL_SCALE: '34.0', FINE_SCALE: '92.0' },
    uniforms: {
      uRadii: { value: radii },
      uCamPos: ctx.frame.uCamPos,
      uSunTime: { value: clock.value },
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
      uSunTime: { value: clock.value },
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
    parts: [globe, shell, clock],
    provenance: 'procedural',
    notes,
    extentKm: shellRadius,
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: 0,
  };
}

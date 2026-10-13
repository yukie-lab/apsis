/**
 * A body that shows only the top of a thick atmosphere in visible light: Venus (cloud deck) and Titan (haze).
 *
 * The deck is made by code. Visible light shows little detail on these bodies, so the pattern is pale.
 * Venus: weak bands by latitude, patches of cloud that the wind draws out into streaks which lean away from
 * the equator, and brighter hoods near the poles. This is the general look of the cloud tops. No streak is a real feature.
 * Titan: almost no detail, and a small difference between the north and the south.
 * The deck is a sphere above the solid surface. The atmosphere model of atmosphere.ts adds the soft limb.
 */
import * as THREE from 'three';
import { atmosphereTop, atmosphereUniforms, makeAtmosphereShell } from './atmosphere';
import type { AtmosphereSpec } from './atmosphere';
import { Globe, shaderBase, srgb } from './core';
import type { BuildContext, Built } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_ATMOSPHERE, GLSL_LIGHT, GLSL_NOISE, VERT_UNIT_SPHERE } from './glsl';
import { NIGHT_FILL } from './surface';

export interface DeckLook {
  /** Main colour and second colour of the deck (sRGB 0 to 255). */
  color: [number, number, number];
  color2: [number, number, number];
  /** Contrast of the bands by latitude and of the streaks. */
  band: number;
  streak: number;
  /** Frequency of the noise. */
  scale: number;
  /** The noise is this number of times finer by latitude than by longitude (1: round patches). */
  stretch: number;
  /**
   * Lean of the streaks, radians. The pattern is turned around the axis by this angle more at the pole than at
   * the equator, so a round patch becomes a streak that leans away from the equator.
   * Negative: the high latitudes are ahead to the west. 0: no lean.
   */
  lean: number;
  /** Brightness of the hoods near the poles (0: none). */
  hood: number;
  /** Difference between the north and the south (positive: the north is nearer to the second colour). */
  hemisphere: number;
  /** Half-width of the soft step over the terminator. */
  terminator: number;
  /** Limb darkening, 0 to 1. */
  limb: number;
  /** One turn of the pattern in seconds of display time. Negative: it turns to the west. */
  turnSeconds: number;
  atmosphere: AtmosphereSpec;
}

/**
 * Venus: pale yellow-white cloud deck. The cloud tops of Venus move to the west, and the middle latitudes
 * turn faster than the equator, so the lean is negative (general knowledge: no document was checked for it).
 * All values are set by eye. They are not measured. The real cloud tops show less contrast in visible light.
 */
export const DECK_VENUS: Omit<DeckLook, 'atmosphere'> = {
  color: [238, 228, 200],
  color2: [214, 196, 158],
  band: 0.12,
  streak: 0.4,
  scale: 2.6,
  stretch: 2,
  lean: -4,
  hood: 0.05,
  hemisphere: 0,
  terminator: 0.1,
  limb: 0.35,
  turnSeconds: -2400,
};

/** Titan: orange haze with almost no detail. The colours are set by eye. */
export const DECK_TITAN: Omit<DeckLook, 'atmosphere'> = {
  color: [226, 164, 84],
  color2: [205, 140, 70],
  band: 0.03,
  streak: 0.015,
  scale: 1.6,
  stretch: 7,
  lean: 0,
  hood: 0,
  hemisphere: 0.12,
  terminator: 0.12,
  limb: 0.55,
  turnSeconds: 0,
};

/** Streak contrast of the low quality as a part of the contrast of the high quality. Set by eye. */
const LOW_QUALITY_STREAK = 0.8;

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_NOISE}
${GLSL_LIGHT}
${GLSL_ATMOSPHERE}
uniform vec3 uDeckColor;
uniform vec3 uDeckColor2;
uniform vec4 uDeck;           // x: band contrast, y: streak contrast, z: noise frequency, w: turn of the pattern to the east (turns)
uniform vec4 uDeckFlow;       // x: lean of the streaks (radians), y: brightness of the polar hoods, z: stretch of the noise by latitude
uniform vec4 uDeckShade;      // x: half-width of the terminator step, y: limb darkening, z: difference of the hemispheres, w: light on the night side
uniform vec3 uRadii;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uSunColor;
varying vec3 vUnit;
void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vUnit);
  vec3 pos = dir * uRadii;
  vec3 n = normalize(dir / uRadii);
  vec3 v = normalize(uCamPos - pos);
  // The pattern at this latitude is turned to the east by the angle theta. The angle grows with the latitude,
  // so a round patch of the noise shows as a streak that leans away from the equator.
  float theta = uDeck.w * PI2 + uDeckFlow.x * dir.z * dir.z;
  float ca = cos(theta);
  float sa = sin(theta);
  vec3 d = vec3(ca * dir.x + sa * dir.y, ca * dir.y - sa * dir.x, dir.z);
  float band = fbm(vec3(dir.z * uDeck.z * 4.0, 1.5, 7.5), 3) - 0.5;
  float streak = fbm(vec3(d.xy * uDeck.z, d.z * uDeck.z * uDeckFlow.z) + 2.0, DECK_OCTAVES) - 0.5;
  float tone = uDeck.x * band + uDeck.y * streak;
  float second = clamp(0.5 - 5.0 * tone + uDeckShade.z * dir.z * 4.0, 0.0, 1.0);
  float hood = uDeckFlow.y * smoothstep(0.72, 0.9, abs(dir.z));
  vec3 albedo = mix(uDeckColor, uDeckColor2, second) * (1.0 + tone + hood);

  float mu0 = dot(n, uSunDir);
  float mu = max(dot(n, v), 0.0);
  vec3 k = vec3(1.0, 1.0, uAtm.w);
  vec3 ro = uCamPos * k;
  vec3 sunW = normalize(uSunDir * k);
  float muS = dot(dir, sunW);
  vec3 direct = atmSunAtGround(max(muS, 0.0));
  float shadow = casterShadow(pos, uSunDir);
  vec3 sun = uSunColor * shadow;
  float lit = softCos(mu0, uDeckShade.x);
  float edge = 1.0 - mu;
  vec3 color = albedo * sun * direct * lit * (1.0 - uDeckShade.y * edge * edge);
  vec3 toGround = dir * uAtm.x - ro;
  float tGround = length(toGround);
  vec3 scatter;
  vec3 trans;
  atmScatter(ro, toGround / tGround, tGround, sunW, -dot(v, uSunDir), scatter, trans);
  color = color * trans + scatter * sun;
  color += albedo * uSunColor * uDeckShade.w;
  // The fill light of the caller, with the loss of light of a point with the Sun and the camera above it.
  color += albedo * atmTwoWay() * uSunColor * nightFill(shadow * lit);
  gl_FragColor = vec4(color, 1.0);
  ${FRAG_TAIL}
}
`;

/** Builds a cloud or haze deck with its atmosphere. */
export function buildDeck(ctx: BuildContext, look: DeckLook, notes: string[], deckNote: string): Built {
  const base = look.atmosphere.baseAltitudeKm;
  const radii = new THREE.Vector3(ctx.radiusKm + base, ctx.radiusKm + base, ctx.polarRadiusKm + base);
  const high = ctx.quality === 'high';
  // The noise of the low quality has fewer octaves, so its large patches are stronger: the lower contrast gives the same look.
  const deck = new THREE.Vector4(look.band, look.streak * (high ? 1 : LOW_QUALITY_STREAK), look.scale, 0);
  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/deck`),
    defines: { ATM_SAMPLES: high ? 6 : 3, DECK_OCTAVES: high ? 5 : 2 },
    uniforms: {
      uDeckColor: { value: srgb(...look.color) },
      uDeckColor2: { value: srgb(...look.color2) },
      uDeck: { value: deck },
      uDeckFlow: { value: new THREE.Vector4(look.lean, look.hood, look.stretch, 0) },
      uDeckShade: { value: new THREE.Vector4(look.terminator, look.limb, look.hemisphere, NIGHT_FILL * 0.5) },
      uRadii: { value: radii },
      uSunDir: ctx.frame.uSunDir,
      uCamPos: ctx.frame.uCamPos,
      uSunColor: ctx.frame.uSunColor,
      uCasters: ctx.frame.uCasters,
      uSunAngR: ctx.frame.uSunAngR,
      uNightFill: ctx.frame.uNightFill,
      ...atmosphereUniforms(look.atmosphere, ctx.radiusKm, ctx.polarRadiusKm),
    },
    vertexShader: VERT_UNIT_SPHERE,
    fragmentShader: FRAGMENT,
  });
  const globe = new Globe(`${ctx.id}/deck`, material, radii, ctx.quality);
  ctx.root.add(globe.mesh);
  const shell = makeAtmosphereShell(`${ctx.id}/atmosphere`, look.atmosphere, ctx.radiusKm, ctx.polarRadiusKm, ctx.quality, ctx.frame);
  ctx.root.add(shell.mesh);
  notes.push(deckNote);
  const turn = {
    update(): void {
      deck.w = look.turnSeconds === 0 ? 0 : (ctx.frame.uTime.value / look.turnSeconds) % 1;
    },
    triangles: (): number => 0,
    trianglesMax: (): number => 0,
    dispose(): void {},
  };
  return {
    parts: [globe, shell, turn],
    provenance: 'procedural',
    notes,
    extentKm: atmosphereTop(look.atmosphere, ctx.radiusKm),
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: 0,
  };
}

/**
 * A body that shows only the top of a thick atmosphere in visible light: Venus (cloud deck) and Titan (haze).
 *
 * The deck is made by code. Visible light shows almost no detail on these bodies, so the pattern is faint:
 * weak bands by latitude and weak streaks. The code does not draw strong features.
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

/** Venus: pale yellow-white cloud deck. The colours are set by eye. */
export const DECK_VENUS: Omit<DeckLook, 'atmosphere'> = {
  color: [238, 228, 200],
  color2: [226, 209, 170],
  band: 0.07,
  streak: 0.06,
  scale: 2.2,
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
  hemisphere: 0.12,
  terminator: 0.12,
  limb: 0.55,
  turnSeconds: 0,
};

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_NOISE}
${GLSL_LIGHT}
${GLSL_ATMOSPHERE}
uniform vec3 uDeckColor;
uniform vec3 uDeckColor2;
uniform vec4 uDeck;           // x: band contrast, y: streak contrast, z: noise frequency, w: turn of the pattern (turns)
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
  float a = uDeck.w * PI2;
  float ca = cos(a);
  float sa = sin(a);
  vec3 d = vec3(ca * dir.x - sa * dir.y, sa * dir.x + ca * dir.y, dir.z);
  float band = fbm(vec3(dir.z * uDeck.z * 4.0, 1.5, 7.5), 3) - 0.5;
  float streak = fbm(vec3(d.xy * uDeck.z, d.z * uDeck.z * 7.0) + 2.0, DECK_OCTAVES) - 0.5;
  float tone = uDeck.x * band + uDeck.y * streak;
  float second = clamp(0.5 - 5.0 * tone + uDeckShade.z * dir.z * 4.0, 0.0, 1.0);
  vec3 albedo = mix(uDeckColor, uDeckColor2, second) * (1.0 + tone);

  float mu0 = dot(n, uSunDir);
  float mu = max(dot(n, v), 0.0);
  vec3 k = vec3(1.0, 1.0, uAtm.w);
  vec3 ro = uCamPos * k;
  vec3 sunW = normalize(uSunDir * k);
  float muS = dot(dir, sunW);
  vec3 direct = atmSunAtGround(max(muS, 0.0));
  vec3 sun = uSunColor * casterShadow(pos, uSunDir);
  float edge = 1.0 - mu;
  vec3 color = albedo * sun * direct * softCos(mu0, uDeckShade.x) * (1.0 - uDeckShade.y * edge * edge);
  vec3 toGround = dir * uAtm.x - ro;
  float tGround = length(toGround);
  vec3 scatter;
  vec3 trans;
  atmScatter(ro, toGround / tGround, tGround, sunW, -dot(v, uSunDir), scatter, trans);
  color = color * trans + scatter * sun;
  color += albedo * uSunColor * uDeckShade.w;
  gl_FragColor = vec4(color, 1.0);
  ${FRAG_TAIL}
}
`;

/** Builds a cloud or haze deck with its atmosphere. */
export function buildDeck(ctx: BuildContext, look: DeckLook, notes: string[], deckNote: string): Built {
  const base = look.atmosphere.baseAltitudeKm;
  const radii = new THREE.Vector3(ctx.radiusKm + base, ctx.radiusKm + base, ctx.polarRadiusKm + base);
  const deck = new THREE.Vector4(look.band, look.streak, look.scale, 0);
  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/deck`),
    defines: { ATM_SAMPLES: ctx.quality === 'high' ? 6 : 3, DECK_OCTAVES: ctx.quality === 'high' ? 4 : 2 },
    uniforms: {
      uDeckColor: { value: srgb(...look.color) },
      uDeckColor2: { value: srgb(...look.color2) },
      uDeck: { value: deck },
      uDeckShade: { value: new THREE.Vector4(look.terminator, look.limb, look.hemisphere, NIGHT_FILL * 0.5) },
      uRadii: { value: radii },
      uSunDir: ctx.frame.uSunDir,
      uCamPos: ctx.frame.uCamPos,
      uSunColor: ctx.frame.uSunColor,
      uCasters: ctx.frame.uCasters,
      uSunAngR: ctx.frame.uSunAngR,
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

/**
 * A round body with a real map: the Moon, Mercury, Mars, Pluto, the moons, Ceres, Vesta.
 *
 * The shading is for dusty ground: a mix of the Lambert law and the Lommel-Seeliger law, with no gloss.
 * A body with a thin atmosphere (Mars, Pluto) adds the air in front of the ground and a shell for the rim.
 * A map with areas that have no data shows these areas in a flat dark grey.
 */
import * as THREE from 'three';
import { atmosphereTop, atmosphereUniforms, makeAtmosphereShell } from './atmosphere';
import type { AtmosphereSpec } from './atmosphere';
import { Globe, colorVector, shaderBase } from './core';
import type { BuildContext, Built, Part } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_ATMOSPHERE, GLSL_LIGHT, GLSL_MAP, GLSL_NODATA, VERT_UNIT_SPHERE } from './glsl';
import { isPartial, longitudeOffset, notesFromEntry, scanMap } from './manifest';
import type { TextureEntry } from './types';

export interface MappedLook {
  /** Weight of the Lommel-Seeliger law, 0 to 1. Dark dusty bodies are near 1, bright icy bodies are lower. */
  seeliger: number;
  /** Brightness factor of the map. */
  gain: number;
  /** Latitude of the map rows: planetocentric or planetographic. */
  latitude: 'centric' | 'graphic';
  atmosphere?: AtmosphereSpec;
  /** Note for the user interface when the body has an atmosphere that the code makes. */
  atmosphereNote?: string;
}

/** Light on the night side, as a part of the light of the day side. It is not physical: it keeps the dark side visible. */
export const NIGHT_FILL = 0.006;

/** Colour of an area with no data, before shading (linear). A neutral dark grey. */
export const NO_DATA_GREY = 0.055;

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_MAP}
${GLSL_NODATA}
${GLSL_LIGHT}
#ifdef USE_ATMOSPHERE
${GLSL_ATMOSPHERE}
#endif
uniform sampler2D uMap;
uniform vec4 uMapParams;      // x: u offset, y: latitude factor, w: 1 = the map is ready
uniform vec3 uMeanColor;
uniform vec3 uRadii;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uSunColor;
uniform vec3 uShade;          // x: weight of the Lommel-Seeliger law, y: light on the night side, z: brightness of the map
varying vec3 vUnit;
void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vUnit);
  vec3 pos = dir * uRadii;
  vec3 n = normalize(dir / uRadii);
  vec3 v = normalize(uCamPos - pos);
  MapCoord mc = mapCoord(dir, uMapParams.x, uMapParams.y);
  vec3 tex = mapSample(uMap, mc).rgb;
  vec3 albedo = mix(uMeanColor, mix(uNoDataColor, tex * uShade.z, mapHasData(tex)), uMapParams.w);
  float mu0 = dot(n, uSunDir);
  float mu = dot(n, v);
  vec3 sun = uSunColor * casterShadow(pos, uSunDir);
  #ifdef USE_ATMOSPHERE
    vec3 k = vec3(1.0, 1.0, uAtm.w);
    vec3 ro = uCamPos * k;
    vec3 sunW = normalize(uSunDir * k);
    float muS = dot(dir, sunW);
    vec3 direct = atmSunAtGround(muS);
    vec3 color = albedo * sun * (direct * dustyDiffuse(mu0, mu, uShade.x) + atmSkyAtGround(muS, direct));
    vec3 toGround = dir * uAtm.x - ro;
    float tGround = length(toGround);
    vec3 scatter;
    vec3 trans;
    atmScatter(ro, toGround / tGround, tGround, sunW, -dot(v, uSunDir), scatter, trans);
    color = color * trans + scatter * sun;
  #else
    vec3 color = albedo * sun * dustyDiffuse(mu0, mu, uShade.x);
  #endif
  color += albedo * uSunColor * uShade.y;
  gl_FragColor = vec4(color, 1.0);
  ${FRAG_TAIL}
}
`;

/** Latitude factor of GLSL_MAP for a map. */
export function latitudeFactor(kind: 'centric' | 'graphic', radiusKm: number, polarRadiusKm: number): number {
  return kind === 'centric' ? polarRadiusKm / radiusKm : radiusKm / polarRadiusKm;
}

/** Uniforms of GLSL_NODATA. A map that the manifest calls partial starts with black as "no data". */
export function makeNoDataUniforms(partial = false): { uNoData: { value: THREE.Vector4 }; uNoDataColor: { value: THREE.Vector3 } } {
  return {
    uNoData: { value: new THREE.Vector4(partial ? 1 : 0, 0, 0, 0) },
    uNoDataColor: { value: new THREE.Vector3(NO_DATA_GREY, NO_DATA_GREY, NO_DATA_GREY) },
  };
}

/**
 * Looks for the areas with no data in a map that is ready. It sets the uniforms of GLSL_NODATA and it adds
 * the notes that tell the user interface where the gap is.
 */
export function applyMapScan(texture: THREE.Texture, partial: boolean, noData: THREE.Vector4, notes: string[]): void {
  const scan = scanMap(texture, partial);
  if (!scan) return;
  noData.x = scan.black ? 1 : 0;
  if (scan.flat) noData.set(noData.x, 1, scan.flat.low, scan.flat.high);
  if (scan.missing > 0.003 && !partial) notes.push('no-data-small');
  if (scan.missing > 0.02) {
    if (scan.missingSouth > 2 * scan.missingNorth) notes.push('no-data-south');
    else if (scan.missingNorth > 2 * scan.missingSouth) notes.push('no-data-north');
  }
}

/** Builds a round body with the map of a manifest entry. */
export function buildMapped(ctx: BuildContext, entry: TextureEntry, look: MappedLook, notes: string[]): Built {
  const radii = new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm);
  const partial = isPartial(entry);
  const mapParams = new THREE.Vector4(longitudeOffset(entry), latitudeFactor(look.latitude, ctx.radiusKm, ctx.polarRadiusKm), 0, 0);
  const noData = makeNoDataUniforms(partial);
  const uniforms: Record<string, THREE.IUniform> = {
    uMap: { value: ctx.maps.blank },
    uMapParams: { value: mapParams },
    uMeanColor: { value: colorVector(ctx.color, 0.8) },
    ...noData,
    uRadii: { value: radii },
    uShade: { value: new THREE.Vector3(look.seeliger, NIGHT_FILL, look.gain) },
    uSunDir: ctx.frame.uSunDir,
    uCamPos: ctx.frame.uCamPos,
    uSunColor: ctx.frame.uSunColor,
    uCasters: ctx.frame.uCasters,
    uSunAngR: ctx.frame.uSunAngR,
  };
  const defines: Record<string, number | string> = {};
  if (look.atmosphere) {
    Object.assign(uniforms, atmosphereUniforms(look.atmosphere, ctx.radiusKm, ctx.polarRadiusKm));
    defines.USE_ATMOSPHERE = 1;
    defines.ATM_SAMPLES = ctx.quality === 'high' ? 6 : 3;
  }
  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/surface`),
    defines,
    uniforms,
    vertexShader: VERT_UNIT_SPHERE,
    fragmentShader: FRAGMENT,
  });
  const globe = new Globe(`${ctx.id}/surface`, material, radii, ctx.quality);
  ctx.root.add(globe.mesh);
  const parts: Part[] = [globe];

  notes.push(...notesFromEntry(entry));
  if (partial) notes.push('no-data');
  ctx.maps.load(entry, { srgb: true, wrapU: true }, (texture) => {
    if (!texture) {
      notes.push('map-load-failed');
      return;
    }
    uniforms.uMap.value = texture;
    mapParams.w = 1;
    applyMapScan(texture, partial, noData.uNoData.value, notes);
  });

  let extentKm = ctx.radiusKm;
  if (look.atmosphere) {
    const shell = makeAtmosphereShell(`${ctx.id}/atmosphere`, look.atmosphere, ctx.radiusKm, ctx.polarRadiusKm, ctx.quality, ctx.frame);
    ctx.root.add(shell.mesh);
    parts.push(shell);
    extentKm = atmosphereTop(look.atmosphere, ctx.radiusKm);
    if (look.atmosphereNote) notes.push(look.atmosphereNote);
  }
  return {
    parts,
    provenance: look.atmosphere ? 'mixed' : 'map',
    notes,
    extentKm,
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: 1,
  };
}

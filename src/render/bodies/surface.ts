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
  /** Colour saturation of the map: 1 = as the file, 0 = grey. */
  saturation: number;
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
uniform vec4 uShade;          // x: weight of the Lommel-Seeliger law, y: light on the night side, z: brightness of the map, w: colour saturation
varying vec3 vUnit;
void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vUnit);
  vec3 pos = dir * uRadii;
  vec3 n = normalize(dir / uRadii);
  vec3 v = normalize(uCamPos - pos);
  MapCoord mc = mapCoord(dir, uMapParams.x, uMapParams.y);
  vec3 tex = mapSample(uMap, mc).rgb;
  vec3 tone = mix(vec3(dot(tex, vec3(0.2126, 0.7152, 0.0722))), tex, uShade.w) * uShade.z;
  vec3 albedo = mix(uMeanColor, mix(uNoDataColor, tone, mapHasData(tex, mc.uv)), uMapParams.w);
  float mu0 = dot(n, uSunDir);
  float mu = dot(n, v);
  float shadow = casterShadow(pos, uSunDir);
  vec3 sun = uSunColor * shadow;
  float diffuse = dustyDiffuse(mu0, mu, uShade.x);
  #ifdef USE_ATMOSPHERE
    vec3 k = vec3(1.0, 1.0, uAtm.w);
    vec3 ro = uCamPos * k;
    vec3 sunW = normalize(uSunDir * k);
    float muS = dot(dir, sunW);
    vec3 direct = atmSunAtGround(muS);
    vec3 color = albedo * sun * (direct * diffuse + atmSkyAtGround(muS, direct));
    vec3 toGround = dir * uAtm.x - ro;
    float tGround = length(toGround);
    vec3 scatter;
    vec3 trans;
    atmScatter(ro, toGround / tGround, tGround, sunW, -dot(v, uSunDir), scatter, trans);
    color = color * trans + scatter * sun;
    // The fill light of the caller. Below air it has the loss of light of a point with the Sun and the camera above it.
    color += albedo * atmTwoWay() * uSunColor * nightFill(shadow * diffuse);
  #else
    vec3 color = albedo * sun * diffuse;
    color += albedo * uSunColor * nightFill(shadow * diffuse);
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

export interface NoDataUniforms {
  uNoData: { value: THREE.Vector4 };
  uNoDataColor: { value: THREE.Vector3 };
  uNoDataArea: { value: THREE.Texture };
}

/**
 * Uniforms of GLSL_NODATA. A map that the manifest calls partial starts with black as "no data".
 * `blank` is a white texture: until the map is read, each black pixel counts as an area with no data.
 */
export function makeNoDataUniforms(blank: THREE.Texture, partial = false): NoDataUniforms {
  return {
    uNoData: { value: new THREE.Vector4(partial ? 1 : 0, 0, 0, 0) },
    uNoDataColor: { value: new THREE.Vector3(NO_DATA_GREY, NO_DATA_GREY, NO_DATA_GREY) },
    uNoDataArea: { value: blank },
  };
}

/**
 * Looks for the areas with no data in a map that is ready. It sets the uniforms of GLSL_NODATA and it adds
 * the notes that tell the user interface where the gap is.
 * Returns the small map of these areas (the caller disposes it), or null if the map has no such area.
 */
export function applyMapScan(texture: THREE.Texture, partial: boolean, uniforms: NoDataUniforms, notes: string[]): THREE.Texture | null {
  const scan = scanMap(texture, partial);
  if (!scan) return null;
  const noData = uniforms.uNoData.value;
  noData.x = scan.black ? 1 : 0;
  if (scan.flat) noData.set(noData.x, 1, scan.flat.low, scan.flat.high);
  if (scan.missing > 0.003 && !partial) notes.push('no-data-small');
  if (scan.missing > 0.02) {
    if (scan.missingSouth > 2 * scan.missingNorth) notes.push('no-data-south');
    else if (scan.missingNorth > 2 * scan.missingSouth) notes.push('no-data-north');
  }
  if (noData.x === 0 && noData.y === 0) return null;
  const area = new THREE.DataTexture(scan.area, scan.areaWidth, scan.areaHeight, THREE.RedFormat, THREE.UnsignedByteType);
  area.name = 'bodies/no-data-area';
  area.wrapS = THREE.RepeatWrapping;
  area.wrapT = THREE.ClampToEdgeWrapping;
  area.magFilter = THREE.LinearFilter;
  area.minFilter = THREE.LinearFilter;
  area.generateMipmaps = false;
  area.needsUpdate = true;
  uniforms.uNoDataArea.value = area;
  return area;
}

/**
 * Builds a round body with the map of a manifest entry.
 * `onFail` is called if the file does not load. It can give the sphere another material. Without it the body
 * keeps its plain colour.
 */
export function buildMapped(ctx: BuildContext, entry: TextureEntry, look: MappedLook, notes: string[], onFail?: (globe: Globe) => void): Built {
  const radii = new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm);
  const partial = isPartial(entry);
  const mapParams = new THREE.Vector4(longitudeOffset(entry), latitudeFactor(look.latitude, ctx.radiusKm, ctx.polarRadiusKm), 0, 0);
  const noData = makeNoDataUniforms(ctx.maps.blank, partial);
  const uniforms: Record<string, THREE.IUniform> = {
    uMap: { value: ctx.maps.blank },
    uMapParams: { value: mapParams },
    uMeanColor: { value: colorVector(ctx.color, 0.8) },
    ...noData,
    uRadii: { value: radii },
    uShade: { value: new THREE.Vector4(look.seeliger, NIGHT_FILL, look.gain, look.saturation) },
    uSunDir: ctx.frame.uSunDir,
    uCamPos: ctx.frame.uCamPos,
    uSunColor: ctx.frame.uSunColor,
    uCasters: ctx.frame.uCasters,
    uSunAngR: ctx.frame.uSunAngR,
    uNightFill: ctx.frame.uNightFill,
  };
  const defines: Record<string, number | string> = { MAP_ANISOTROPY: ctx.maps.anisotropy };
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
  if (look.saturation < 1 && notes.includes('colour-enhanced')) notes.push('colour-muted');
  if (partial) notes.push('no-data');

  let extentKm = ctx.radiusKm;
  if (look.atmosphere) {
    const shell = makeAtmosphereShell(`${ctx.id}/atmosphere`, look.atmosphere, ctx.radiusKm, ctx.polarRadiusKm, ctx.quality, ctx.frame);
    ctx.root.add(shell.mesh);
    parts.push(shell);
    extentKm = atmosphereTop(look.atmosphere, ctx.radiusKm);
    if (look.atmosphereNote) notes.push(look.atmosphereNote);
  }
  const built: Built = {
    parts,
    provenance: look.atmosphere ? 'mixed' : 'map',
    notes,
    extentKm,
    variant: 'default',
    codeTextures: 0,
    samplesPerPixel: 1,
  };
  let area: THREE.Texture | null = null;
  parts.push({ triangles: () => 0, trianglesMax: () => 0, dispose: () => area?.dispose() });
  ctx.maps.load(entry, { srgb: true, wrapU: true }, (texture) => {
    if (texture) {
      uniforms.uMap.value = texture;
      mapParams.w = 1;
      area = applyMapScan(texture, partial, noData, notes);
      // A map with areas of no data has a second small texture, and a dark pixel reads it.
      if (area) {
        built.codeTextures = 1;
        built.samplesPerPixel = 2;
      }
      return;
    }
    // The notes of the file are no longer true: the body shows no map.
    notes.length = 0;
    notes.push('map-load-failed');
    if (look.atmosphere && look.atmosphereNote) notes.push(look.atmosphereNote);
    built.provenance = 'procedural';
    built.samplesPerPixel = 0;
    onFail?.(globe);
  });
  return built;
}

/**
 * Giant planets: Jupiter, Saturn, Uranus, Neptune.
 *
 * A planet with a map in the manifest shows the map. A planet with no map shows cloud bands that the code
 * makes from a table of colours by latitude, with noise for the wavy band edges and the fine streaks.
 * The tables are approximate looks. They are not measured data, and the body then has the provenance 'procedural'
 * (or 'mixed' if its ring strip comes from a file) and the note 'bands-procedural'.
 *
 * Shading: the Lambert law with a soft step over the terminator (a deep atmosphere has no sharp terminator),
 * and a thin haze above the clouds that sends most light forward: it gives the faint line at the limb and the
 * bright crescent of a planet that is seen against the light.
 * Saturn and Uranus get their rings. The rings of Saturn put a shadow on the planet.
 * If the map of a planet does not load, the planet changes to the bands of the code.
 */
import * as THREE from 'three';
import { Globe, colorVector, shaderBase } from './core';
import type { BuildContext, Built, Part } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_LIGHT, GLSL_MAP, GLSL_NOISE, VERT_UNIT_SPHERE } from './glsl';
import { findTexture, latitudeKind, longitudeOffset, notesFromEntry } from './manifest';
import { GLSL_RING_SHADOW, buildRings } from './rings';
import { NIGHT_FILL, latitudeFactor } from './surface';

/** One point of a band table: planetographic latitude (degrees) and colour (sRGB hex). */
type BandStop = [number, string];

interface GiantLook {
  /** Colours from the north pole to the south pole. Approximate, written for this module. */
  bands: BandStop[];
  /** Size of the waves of the band edges, as a part of the pole-to-pole distance. */
  wave: number;
  /** Contrast of the fine streaks. */
  streak: number;
  /** Base frequency of the noise. */
  scale: number;
  /** Half-width of the soft step over the terminator (cosine of the Sun angle). */
  terminator: number;
  /** Colour and optical depth of the haze above the clouds. */
  haze: string;
  hazeAmount: number;
  /** Brightness factor. */
  gain: number;
}

const LOOKS: Record<string, GiantLook> = {
  JUPITER: {
    bands: [
      [90, '#7e7a70'], [72, '#8a8272'], [60, '#9a8f7c'], [50, '#b3a48c'], [44, '#9b8a73'], [38, '#d3c8b2'],
      [31, '#ddd3be'], [27, '#a88362'], [23, '#b9966f'], [19, '#e2d8c4'], [15, '#9f6f4c'], [9, '#a8754f'],
      [6, '#d8cbb4'], [0, '#ebe2cf'], [-5, '#e4dac6'], [-8, '#b08060'], [-14, '#9d6c4c'], [-19, '#b58a68'],
      [-23, '#e6dcc8'], [-28, '#d9cdb8'], [-31, '#b29a80'], [-36, '#d6ccb9'], [-42, '#a8997f'], [-48, '#bdb09a'],
      [-56, '#998d7a'], [-66, '#8b8475'], [-90, '#7f7b72'],
    ],
    wave: 0.006,
    streak: 0.2,
    scale: 3.2,
    terminator: 0.06,
    haze: '#b7b4ad',
    hazeAmount: 0.05,
    gain: 1.0,
  },
  SATURN: {
    bands: [
      [90, '#9a9682'], [80, '#a49c80'], [70, '#b4a67f'], [62, '#c2b087'], [54, '#b9a67c'], [47, '#cdb98c'],
      [40, '#c3ad7f'], [33, '#d5c293'], [26, '#c9b384'], [18, '#d9c797'], [10, '#e2d1a3'], [3, '#e9d9ad'],
      [0, '#e4d3a6'], [-3, '#e9d9ad'], [-10, '#e1d0a2'], [-18, '#d6c394'], [-26, '#c7b182'], [-33, '#d3c091'],
      [-40, '#c1ab7e'], [-47, '#cab68a'], [-54, '#b8a67d'], [-62, '#bfae86'], [-70, '#b1a481'], [-80, '#a39b82'],
      [-90, '#999583'],
    ],
    wave: 0.003,
    streak: 0.07,
    scale: 3.0,
    terminator: 0.07,
    haze: '#c6ba98',
    hazeAmount: 0.06,
    gain: 1.0,
  },
  URANUS: {
    bands: [
      [90, '#d2eeee'], [70, '#c8eaeb'], [50, '#bbe5e8'], [38, '#b3e1e6'], [20, '#b0dfe5'], [0, '#aedee4'],
      [-20, '#abdce3'], [-45, '#a8dae2'], [-70, '#a4d7e0'], [-90, '#a1d5df'],
    ],
    wave: 0.002,
    streak: 0.015,
    scale: 2.4,
    terminator: 0.08,
    haze: '#c9e6ea',
    hazeAmount: 0.08,
    gain: 0.95,
  },
  NEPTUNE: {
    bands: [
      [90, '#5f86cf'], [70, '#5a82d0'], [50, '#5d88d6'], [35, '#648fdb'], [20, '#6190da'], [0, '#5c8ad6'],
      [-20, '#5a86d3'], [-35, '#527dcb'], [-50, '#4f79c8'], [-62, '#5781cd'], [-75, '#5a84cf'], [-90, '#5c85cf'],
    ],
    wave: 0.004,
    streak: 0.05,
    scale: 2.6,
    terminator: 0.08,
    haze: '#9fb9e6',
    hazeAmount: 0.08,
    gain: 0.95,
  },
};

/** Look of a giant planet that is not in the table: plain bands in the display colour. */
function plainLook(color: string): GiantLook {
  return { bands: [[90, color], [-90, color]], wave: 0.003, streak: 0.05, scale: 3, terminator: 0.07, haze: '#b0b0b0', hazeAmount: 0.05, gain: 1 };
}

/** The band table as a strip of size x 1 pixels: u = 0 is the south pole, u = 1 is the north pole. */
function makeBandStrip(bands: BandStop[], size: number): THREE.DataTexture {
  const stops = bands.map(([lat, hex]) => ({ lat, color: new THREE.Color(hex) })).sort((a, b) => a.lat - b.lat);
  const data = new Uint8Array(size * 4);
  const c = new THREE.Color();
  const out = new THREE.Color();
  for (let i = 0; i < size; i++) {
    const lat = -90 + (180 * (i + 0.5)) / size;
    let k = 0;
    while (k < stops.length - 2 && stops[k + 1].lat < lat) k++;
    const a = stops[k];
    const b = stops[k + 1];
    let t = Math.min(1, Math.max(0, (lat - a.lat) / (b.lat - a.lat)));
    t = t * t * (3 - 2 * t);
    c.copy(a.color).lerp(b.color, t);
    out.copy(c).convertLinearToSRGB();
    data[i * 4] = Math.round(out.r * 255);
    data[i * 4 + 1] = Math.round(out.g * 255);
    data[i * 4 + 2] = Math.round(out.b * 255);
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.name = 'bodies/band-strip';
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_NOISE}
${GLSL_MAP}
${GLSL_LIGHT}
#ifdef RING_SHADOW
${GLSL_RING_SHADOW}
#endif
uniform sampler2D uMap;       // real map, or the band strip that the code makes
uniform vec4 uMapParams;      // x: u offset, y: latitude factor, w: 1 = the map is ready
uniform vec4 uBand;           // x: wave size, y: streak contrast, z: noise frequency
uniform vec3 uMeanColor;
uniform vec4 uShade;          // x: half-width of the terminator step, y: optical depth of the haze, z: brightness, w: light on the night side
uniform vec3 uHazeColor;
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
  #ifdef BANDS
    // Latitude with waves. The noise is long in longitude, so the bands stay bands.
    float lat = atan(dir.z * uMapParams.y, length(dir.xy));
    vec3 q = vec3(dir.xy * uBand.z, dir.z * uBand.z * 5.0);
    float w = (fbm(q, BAND_OCTAVES) - 0.5) + 0.45 * (fbm(q * 3.3 + 11.0, BAND_OCTAVES) - 0.5);
    float u = lat * RECIPROCAL_PI + 0.5 + uBand.x * w * cos(lat);
    vec3 albedo = texture2D(uMap, vec2(u, 0.5)).rgb;
    float streak = fbm(vec3(dir.xy * uBand.z * 2.2, dir.z * uBand.z * 46.0) + 5.0, BAND_OCTAVES);
    albedo *= 1.0 + uBand.y * (streak - 0.5);
  #else
    MapCoord mc = mapCoord(dir, uMapParams.x, uMapParams.y);
    vec3 albedo = mix(uMeanColor, mapSample(uMap, mc).rgb, uMapParams.w);
  #endif
  albedo *= uShade.z;
  float mu0 = dot(n, uSunDir);
  float mu = max(dot(n, v), 0.0);
  float lit = softCos(mu0, uShade.x);
  float shadow = casterShadow(pos, uSunDir);
  vec3 sun = uSunColor * shadow;
  #ifdef RING_SHADOW
    float ring = ringShadow(pos, uSunDir);
    sun *= ring;
    shadow *= ring;
  #endif
  // The limb is a little darker than the Lambert law says.
  float edge = 1.0 - mu;
  float edge2 = edge * edge;
  vec3 color = albedo * sun * lit * (1.0 - 0.25 * edge2 * edge2);
  // Haze above the clouds: single scattering in a thin flat layer, with a forward phase function
  // (Henyey-Greenstein, g = 0.55). It is faint with the Sun behind the camera and bright against the light.
  float cs = -dot(v, uSunDir);
  float hazePhase = 0.6975 / pow(max(1.3025 - 1.1 * cs, 1e-3), 1.5);
  float m0 = max(mu0, 0.0) + 0.02;
  float mv = mu + 0.02;
  float hazeLit = smoothstep(-uShade.x, uShade.x, mu0);
  color += uHazeColor * sun * (0.25 * hazePhase * hazeLit * m0 / (m0 + mv) * (1.0 - exp(-uShade.y * (1.0 / m0 + 1.0 / mv))));
  color += albedo * uSunColor * (uShade.w + nightFill(shadow * lit));
  gl_FragColor = vec4(color, 1.0);
  ${FRAG_TAIL}
}
`;

/** Builds a giant planet. `rings`: ring limits of the body table. */
export function buildGiant(ctx: BuildContext, rings: { inner: number; outer: number } | undefined, notes: string[]): Built {
  const radii = new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm);
  const entry = findTexture(ctx.maps.manifest, ctx.id, 'color');
  const look = LOOKS[ctx.id] ?? plainLook(ctx.color);
  const high = ctx.quality === 'high';
  // The rows of a map have the latitude kind that the manifest gives. The band table of the code has planetographic latitude.
  const mapParams = new THREE.Vector4(
    entry ? longitudeOffset(entry) : 0.5,
    latitudeFactor(entry ? latitudeKind(entry) : 'graphic', ctx.radiusKm, ctx.polarRadiusKm),
    0,
    0,
  );
  const uniforms: Record<string, THREE.IUniform> = {
    uMap: { value: ctx.maps.blank },
    uMapParams: { value: mapParams },
    uBand: { value: new THREE.Vector4(look.wave, look.streak, look.scale, 0) },
    uMeanColor: { value: colorVector(ctx.color, 0.8) },
    uShade: { value: new THREE.Vector4(look.terminator, look.hazeAmount, look.gain, NIGHT_FILL * 0.5) },
    uHazeColor: { value: colorVector(look.haze) },
    uRadii: { value: radii },
    uSunDir: ctx.frame.uSunDir,
    uCamPos: ctx.frame.uCamPos,
    uSunColor: ctx.frame.uSunColor,
    uCasters: ctx.frame.uCasters,
    uSunAngR: ctx.frame.uSunAngR,
    uNightFill: ctx.frame.uNightFill,
  };
  const defines: Record<string, number> = { MAP_ANISOTROPY: ctx.maps.anisotropy };
  const owned: THREE.Texture[] = [];
  let bandTextures = 0;
  // The bands of the code: the strip of colours by latitude replaces the map.
  const useBands = (target: Record<string, number>): void => {
    const strip = makeBandStrip(look.bands, 512);
    owned.push(strip);
    uniforms.uMap.value = strip;
    mapParams.set(0.5, latitudeFactor('graphic', ctx.radiusKm, ctx.polarRadiusKm), 0, 1);
    target.BANDS = 1;
    target.BAND_OCTAVES = high ? 4 : 2;
    notes.push('bands-procedural');
  };
  // True while the surface of the planet comes from a file (also while the file loads).
  let planetFromMap = entry !== null;
  const fileNotes = entry ? notesFromEntry(entry) : [];
  if (entry) {
    notes.push(...fileNotes);
  } else {
    useBands(defines);
    bandTextures = 1;
  }

  const parts: Part[] = [];
  let extentKm = ctx.radiusKm;
  const ringSystem = rings ? buildRings(ctx, rings, notes) : null;
  if (ringSystem) {
    if (ctx.id === 'SATURN') {
      // Only the rings of Saturn are dense and wide enough for a visible shadow.
      defines.RING_SHADOW = 1;
      Object.assign(uniforms, ringSystem.shadowUniforms);
    }
    extentKm = ringSystem.outerKm;
  }

  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/surface`),
    defines,
    uniforms,
    vertexShader: VERT_UNIT_SPHERE,
    fragmentShader: FRAGMENT,
  });
  const globe = new Globe(`${ctx.id}/surface`, material, radii, ctx.quality);
  // The planet is first in the group, so the rings are drawn after it.
  ctx.root.add(globe.mesh);
  if (ringSystem) {
    ctx.root.remove(ringSystem.part.mesh);
    ctx.root.add(ringSystem.part.mesh);
    parts.push(globe, ringSystem.part);
  } else {
    parts.push(globe);
  }
  parts.push({
    triangles: () => 0,
    trianglesMax: () => 0,
    dispose: () => {
      for (const t of owned) t.dispose();
    },
  });
  const built: Built = {
    parts,
    // These two values change when a file arrives or fails, so they are read each time.
    // Rings always have parts of the code (the whole profile, or the opacity and the F ring), so a planet with
    // rings is 'mixed' when its surface or its ring strip comes from a file.
    get provenance(): Built['provenance'] {
      if (!ringSystem) return planetFromMap ? 'map' : 'procedural';
      return planetFromMap || ringSystem.codeTextures() === 0 ? 'mixed' : 'procedural';
    },
    notes,
    extentKm,
    variant: 'default',
    get codeTextures(): number {
      return bandTextures + (ringSystem ? ringSystem.codeTextures() : 0);
    },
    samplesPerPixel: 1 + (defines.RING_SHADOW ? 1 : 0),
  };
  if (entry) {
    ctx.maps.load(entry, { srgb: true, wrapU: true }, (texture) => {
      if (texture) {
        uniforms.uMap.value = texture;
        mapParams.w = 1;
        return;
      }
      // The file did not load: the planet shows the bands of the code, and the notes of the file go away.
      for (const note of fileNotes) {
        const k = notes.indexOf(note);
        if (k >= 0) notes.splice(k, 1);
      }
      notes.push('map-load-failed');
      useBands(material.defines as Record<string, number>);
      material.needsUpdate = true;
      bandTextures = 1;
      planetFromMap = false;
    });
  }
  return built;
}

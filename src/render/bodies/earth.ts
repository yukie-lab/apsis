/**
 * The Earth: day map, lights of the night side, a cloud layer with soft shadows, the glint of the Sun on the
 * water, and the air (blue haze over the disc, a thin bright rim, a warm terminator).
 *
 * All layers are in one shader, so the mix of the layers is done before the tone mapping.
 * The manifest has no water mask: the shader finds water from the colour of the day map
 * (blue is much larger than red and green, or the pixel is nearly black).
 */
import * as THREE from 'three';
import { ATMOSPHERE_EARTH, atmosphereTop, atmosphereUniforms, makeAtmosphereShell } from './atmosphere';
import { Globe, colorVector, shaderBase } from './core';
import type { BuildContext, Built } from './core';
import { FRAG_HEAD, FRAG_TAIL, GLSL_ATMOSPHERE, GLSL_LIGHT, GLSL_MAP, VERT_UNIT_SPHERE } from './glsl';
import { findTexture, longitudeOffset } from './manifest';
import { NIGHT_FILL, latitudeFactor } from './surface';

/**
 * One turn of the cloud layer relative to the ground, in seconds of display time.
 * The layer turns to the east as one piece: this is the direction of the weather in the middle latitudes.
 * The real clouds of the tropics move to the west. The drift is for the look only.
 */
const CLOUD_TURN_SECONDS = 5400;
/** Altitude of the cloud layer for its shadow, as a part of the radius. It is larger than the real value so that the shadow is visible from orbit. */
const CLOUD_SHADOW_REACH = 0.0035;
/** Darkest cloud shadow (part of the direct sunlight that a thick cloud takes away). */
const CLOUD_SHADOW_DEPTH = 0.55;
/** Slope roughness of the sea (GGX alpha). A light wind gives about this value in the model of Cox and Munk (approximate). */
const SEA_ROUGHNESS = 0.16;
/** Factor of the glint. 1 is the value of the reflection model. */
const GLINT_STRENGTH = 1.0;
/** Dark level of the night map (moonlit land and ice, linear red, green, blue). The shader removes it so that only the lights remain. */
const NIGHT_FLOOR: [number, number, number] = [0.026, 0.036, 0.094];
const NIGHT_GAIN = 2.2;

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_MAP}
${GLSL_LIGHT}
${GLSL_ATMOSPHERE}
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec4 uMapParams;      // x: u offset of the day map, y: latitude factor, z: u offset of the night map, w: u offset of the cloud map
uniform vec3 uReady;          // 1 = the day map, the night map, the cloud map is ready
uniform vec3 uMeanColor;
uniform vec4 uCloud;          // x: drift of the cloud map (turns, negative: the clouds move to the east), y: reach of the shadow, z: depth of the shadow
uniform vec4 uSea;            // x: roughness, y: glint factor, z: light on the night side
uniform vec4 uNightLights;    // xyz: dark level of the night map, w: gain
uniform vec3 uRadii;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uSunColor;
varying vec3 vUnit;

float cloudAmount(float raw) {
  return smoothstep(0.06, 0.78, raw);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 dir = normalize(vUnit);
  vec3 pos = dir * uRadii;
  vec3 n = normalize(dir / uRadii);
  vec3 v = normalize(uCamPos - pos);
  float mu0 = dot(n, uSunDir);
  float mu = max(dot(n, v), 0.0);

  MapCoord mc = mapCoord(dir, uMapParams.x, uMapParams.y);
  vec3 day = mix(uMeanColor, mapSample(uDay, mc).rgb, uReady.x);
  // Water: blue is the largest channel by a wide margin (sea), or the pixel is nearly black (lakes).
  float blue = day.b / (max(day.r, day.g) + 0.0005);
  float water = uReady.x * max(smoothstep(1.2, 2.0, blue), 1.0 - smoothstep(0.004, 0.007, max3(day)));

  vec2 cloudUv = vec2(mc.uv.x - uMapParams.x + uMapParams.w + uCloud.x, mc.uv.y);
  float cloud = uReady.z * cloudAmount(textureGrad(uClouds, cloudUv, mc.dx, mc.dy).r);
  float shade = 1.0;
  #ifdef CLOUD_SHADOW
    // The shadow of a cloud falls on the ground on the side away from the Sun.
    vec3 sunFlat = uSunDir - n * mu0;
    vec3 dir2 = normalize(dir + sunFlat * (uCloud.y / max(mu0, 0.22)));
    vec2 uv2 = mapUv(dir2, uMapParams.w + uCloud.x, uMapParams.y);
    float cloud2 = uReady.z * cloudAmount(textureGrad(uClouds, uv2, mc.dx * 2.0, mc.dy * 2.0).r);
    shade = 1.0 - uCloud.z * cloud2 * smoothstep(0.0, 0.1, mu0);
  #endif

  vec3 k = vec3(1.0, 1.0, uAtm.w);
  vec3 ro = uCamPos * k;
  vec3 sunW = normalize(uSunDir * k);
  float muS = dot(dir, sunW);
  vec3 direct = atmSunAtGround(muS);
  vec3 sky = atmSkyAtGround(muS, direct);

  vec3 ground = day * (direct * (max(mu0, 0.0) * shade) + sky);
  // Glint of the Sun on the water (GGX lobe, Fresnel factor of water, Cook-Torrance masking).
  vec3 h = normalize(uSunDir + v);
  float nh = max(dot(n, h), 0.0);
  float vh = max(dot(v, h), 1e-3);
  float a2 = uSea.x * uSea.x;
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  float F = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
  float G = min(1.0, 2.0 * nh * min(mu, max(mu0, 0.0)) / vh);
  float glint = uSea.y * PI * D * F * G / (4.0 * max(mu, 0.05));
  ground += water * shade * direct * glint;

  vec3 cloudColor = vec3(mix(0.74, 0.97, cloud)) * (direct * softCos(mu0, 0.03) + sky);
  float shadow = casterShadow(pos, uSunDir);
  vec3 sun = uSunColor * shadow;
  vec3 color = mix(ground, cloudColor, cloud) * sun;

  // Lights of the cities, on the dark side only. Clouds hide a part of them.
  vec3 lights = max(mapSample(uNight, MapCoord(vec2(mc.uv.x - uMapParams.x + uMapParams.z, mc.uv.y), mc.dx, mc.dy)).rgb - uNightLights.xyz, 0.0);
  float dark = 1.0 - smoothstep(-0.14, 0.02, muS);
  color += uReady.y * uNightLights.w * dark * (1.0 - 0.8 * cloud) * lights;
  color += mix(day, vec3(0.5), cloud) * uSunColor * uSea.z;

  vec3 toGround = dir * uAtm.x - ro;
  float tGround = length(toGround);
  vec3 scatter;
  vec3 trans;
  atmScatter(ro, toGround / tGround, tGround, sunW, -dot(v, uSunDir), scatter, trans);
  color = color * trans + scatter * sun;
  // The fill light of the caller: the ground and the clouds show their day colours, with the loss of light of a point
  // with the Sun and the camera above it. The lights of the cities stay: the fill light is added to them.
  color += mix(day, vec3(mix(0.74, 0.97, cloud)), cloud) * atmTwoWay() * uSunColor * nightFill(shadow * softCos(mu0, 0.03));
  gl_FragColor = vec4(color, 1.0);
  ${FRAG_TAIL}
}
`;

/** Builds the Earth. Each map is optional: a missing map removes its layer. */
export function buildEarth(ctx: BuildContext, notes: string[]): Built {
  const m = ctx.maps.manifest;
  const day = findTexture(m, ctx.id, 'color');
  const night = findTexture(m, ctx.id, 'night');
  const clouds = findTexture(m, ctx.id, 'clouds');
  const radii = new THREE.Vector3(ctx.radiusKm, ctx.radiusKm, ctx.polarRadiusKm);
  const ready = new THREE.Vector3(0, 0, 0);
  const cloud = new THREE.Vector4(0, CLOUD_SHADOW_REACH, CLOUD_SHADOW_DEPTH, 0);
  const uniforms: Record<string, THREE.IUniform> = {
    uDay: { value: ctx.maps.blank },
    uNight: { value: ctx.maps.blank },
    uClouds: { value: ctx.maps.blank },
    uMapParams: {
      value: new THREE.Vector4(
        day ? longitudeOffset(day) : 0.5,
        latitudeFactor('graphic', ctx.radiusKm, ctx.polarRadiusKm),
        night ? longitudeOffset(night) : 0.5,
        clouds ? longitudeOffset(clouds) : 0.5,
      ),
    },
    uReady: { value: ready },
    uMeanColor: { value: colorVector(ctx.color, 0.5) },
    uCloud: { value: cloud },
    uSea: { value: new THREE.Vector4(SEA_ROUGHNESS, GLINT_STRENGTH, NIGHT_FILL * 0.5, 0) },
    uNightLights: { value: new THREE.Vector4(NIGHT_FLOOR[0], NIGHT_FLOOR[1], NIGHT_FLOOR[2], NIGHT_GAIN) },
    uRadii: { value: radii },
    uSunDir: ctx.frame.uSunDir,
    uCamPos: ctx.frame.uCamPos,
    uSunColor: ctx.frame.uSunColor,
    uCasters: ctx.frame.uCasters,
    uSunAngR: ctx.frame.uSunAngR,
    uNightFill: ctx.frame.uNightFill,
    ...atmosphereUniforms(ATMOSPHERE_EARTH, ctx.radiusKm, ctx.polarRadiusKm),
  };
  const high = ctx.quality === 'high';
  const defines: Record<string, number> = { ATM_SAMPLES: high ? 6 : 3, MAP_ANISOTROPY: ctx.maps.anisotropy };
  if (high && clouds) defines.CLOUD_SHADOW = 1;
  const material = new THREE.ShaderMaterial({
    ...shaderBase(`${ctx.id}/surface`),
    defines,
    uniforms,
    vertexShader: VERT_UNIT_SPHERE,
    fragmentShader: FRAGMENT,
  });
  const globe = new Globe(`${ctx.id}/surface`, material, radii, ctx.quality);
  ctx.root.add(globe.mesh);

  // The maps that the body shows, or will show when they are ready. A file that does not load leaves the list.
  const shown = { day: day !== null, night: night !== null, clouds: clouds !== null };
  // A file that did not load: one note says so, and one note says what the body does not show.
  const fail = (what: string, missing: string): void => {
    notes.push(`${what}-load-failed`, missing);
  };
  if (day) {
    ctx.maps.load(day, { srgb: true, wrapU: true }, (t) => {
      if (!t) {
        shown.day = false;
        return fail('map', 'surface-plain');
      }
      uniforms.uDay.value = t;
      ready.x = 1;
    });
  } else {
    notes.push('surface-plain');
  }
  if (night) {
    ctx.maps.load(night, { srgb: true, wrapU: true }, (t) => {
      if (!t) {
        shown.night = false;
        return fail('night-map', 'no-night-lights');
      }
      uniforms.uNight.value = t;
      ready.y = 1;
    });
  } else {
    notes.push('no-night-lights');
  }
  if (clouds) {
    ctx.maps.load(clouds, { srgb: false, wrapU: true }, (t) => {
      if (!t) {
        shown.clouds = false;
        return fail('cloud-map', 'no-clouds');
      }
      uniforms.uClouds.value = t;
      ready.z = 1;
    });
  } else {
    notes.push('no-clouds');
  }

  const shell = makeAtmosphereShell(`${ctx.id}/atmosphere`, ATMOSPHERE_EARTH, ctx.radiusKm, ctx.polarRadiusKm, ctx.quality, ctx.frame);
  ctx.root.add(shell.mesh);
  notes.push('atmosphere-procedural');

  const drift = {
    update(): void {
      // The shader adds this value to the map position: a negative value moves the clouds to the east.
      cloud.x = -((ctx.frame.uTime.value / CLOUD_TURN_SECONDS) % 1);
    },
    triangles: (): number => 0,
    trianglesMax: (): number => 0,
    dispose(): void {},
  };
  return {
    parts: [globe, shell, drift],
    // The air and the glint are always parts of the code, so the Earth is 'mixed' while it shows a real map.
    // The values follow the maps that did load.
    get provenance(): Built['provenance'] {
      return shown.day || shown.night || shown.clouds ? 'mixed' : 'procedural';
    },
    notes,
    extentKm: atmosphereTop(ATMOSPHERE_EARTH, ctx.radiusKm),
    variant: 'default',
    codeTextures: 0,
    get samplesPerPixel(): number {
      return (shown.day ? 1 : 0) + (shown.night ? 1 : 0) + (shown.clouds ? (high ? 2 : 1) : 0);
    },
  };
}

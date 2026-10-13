/**
 * The star background: the real star map of the manifest on a sphere at infinity.
 *
 * The local axes of the object are the ICRF axes (+X: right ascension 0, +Z: north celestial pole).
 * The map has right ascension 0 at the image centre and right ascension grows to the left
 * (conventions of public/textures/manifest.json).
 * The shader finds the map position for each pixel from the view direction, so the map has no seam and
 * no pinch at the poles. The vertex shader ignores the position of the camera and the depth range.
 * If the manifest has no star map, the sphere is black: the code does not invent stars.
 */
import * as THREE from 'three';
import { shaderBase } from './core';
import { acquireSphere, releaseSphere } from './geometry';
import { FRAG_HEAD, FRAG_TAIL, GLSL_MAP } from './glsl';
import { findTexture, loadMap, makeBlankTexture, textureUrl } from './manifest';
import type { Starfield, StarfieldOptions } from './types';

/** Brightness factor of the star map for the default look. The stars stay dim so that the planets stand out. */
const STAR_GAIN = 0.62;
/** Power curve of the map. A value above 1 makes the faint glow of the Milky Way darker and keeps the bright stars. */
const STAR_CURVE = 1.5;

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDir;
void main() {
  vDir = position;
  // Rotation only: the stars are at infinity, so the camera position has no effect.
  vec4 mv = modelViewMatrix * vec4(position, 0.0);
  gl_Position = projectionMatrix * vec4(mv.xyz, 1.0);
  #include <logdepthbuf_vertex>
  // The middle of the depth range: the near plane and the far plane never cut the sphere. The material does not test the depth.
  gl_Position.z = 0.0;
}
`;

const FRAGMENT = /* glsl */ `
${FRAG_HEAD}
${GLSL_MAP}
uniform sampler2D uStars;
uniform vec3 uStarParams;     // x: brightness, y: power curve, z: 1 = the map is ready
varying vec3 vDir;
void main() {
  #include <logdepthbuf_fragment>
  // The map is seen from the inside and right ascension grows to the left: mirror the y axis.
  vec3 dir = normalize(vDir) * vec3(1.0, -1.0, 1.0);
  MapCoord mc = mapCoord(dir, 0.5, 1.0);
  vec3 stars = mapSample(uStars, mc).rgb;
  stars = pow(stars, vec3(uStarParams.y)) * (uStarParams.x * uStarParams.z);
  gl_FragColor = vec4(stars, 1.0);
  ${FRAG_TAIL}
}
`;

/** Creates the star background. Add `object` to the scene. It needs no update. */
export function createStarfield(opt: StarfieldOptions): Starfield {
  const entry = findTexture(opt.manifest, 'STARS', 'stars');
  const blank = makeBlankTexture();
  const params = new THREE.Vector3(STAR_GAIN, STAR_CURVE, 0);
  const uStars: THREE.IUniform = { value: blank };
  // The anisotropy of the star map. The shader limits the stretch of the map near the celestial poles to this value,
  // so the stars near a pole stay sharp points (see GLSL_MAP).
  const anisotropy = opt.quality === 'high' ? 4 : 1;
  const material = new THREE.ShaderMaterial({
    ...shaderBase('stars'),
    defines: { MAP_ANISOTROPY: anisotropy },
    uniforms: { uStars, uStarParams: { value: params } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = acquireSphere(32, 16);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'stars';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;

  let texture: THREE.Texture | null = null;
  let disposed = false;
  let cancel: (() => void) | null = null;
  if (entry) {
    // No edge repair: the star map is large, and its edge lines are black sky.
    cancel = loadMap(textureUrl(entry, opt.quality, opt.baseUrl), { srgb: true, wrapU: true, anisotropy, repair: false }, (loaded) => {
      if (loaded) {
        texture = loaded;
        uStars.value = loaded;
        params.z = 1;
      }
      opt.onLoad?.();
    });
  } else {
    queueMicrotask(() => {
      if (!disposed) opt.onLoad?.();
    });
  }

  return {
    object: mesh,
    provenance: entry ? 'map' : 'none',
    setBrightness(value: number): void {
      params.x = STAR_GAIN * Math.max(0, value);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancel?.();
      texture?.dispose();
      blank.dispose();
      material.dispose();
      releaseSphere(geometry);
      mesh.removeFromParent();
    },
  };
}

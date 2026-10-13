/**
 * Shader text that the materials of this module share.
 *
 * Rules for all shaders of the module:
 * - Light and view vectors are in the body axes (+Z north pole, +X prime meridian). The module turns the Sun
 *   direction and the camera position into these axes on the CPU, in double precision. The shaders never use
 *   world coordinates, so a body far from the origin of the scene has no precision problem.
 * - Each shader has the three.js chunks of the logarithmic depth buffer and ends with the tone mapping and
 *   colour space chunks. The result is correct with and without a logarithmic depth buffer, and with and
 *   without a tone mapping pass after the scene.
 * - `uSunColor` is the radiance of a white diffuse surface that faces the Sun (before tone mapping).
 */

/** Start of every fragment shader. */
export const FRAG_HEAD = /* glsl */ `
#include <common>
#include <dithering_pars_fragment>
#include <logdepthbuf_pars_fragment>
`;

/** End of every fragment shader. The colour is in gl_FragColor. */
export const FRAG_TAIL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <dithering_fragment>
`;

/**
 * Vertex shader of a mesh that is a unit sphere with a scale (an ellipsoid).
 * vUnit is the point on the unit sphere. The fragment shader finds the normal and the map position from it.
 */
export const VERT_UNIT_SPHERE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vUnit;
void main() {
  vUnit = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

/** Hash and noise functions. They need no sine, so they give the same result on all GPUs. */
export const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// Value noise, 0 to 1.
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
                mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
                mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(a, b, u.z);
}
// Sum of octaves of value noise, 0 to 1.
float fbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p);
    norm += amp;
    p = p * 2.03 + vec3(17.1, 3.7, 9.2);
    amp *= 0.5;
  }
  return sum / norm;
}
`;

/**
 * Lookup in a longitude-latitude map from a direction in the body axes.
 * The gradients come from the derivatives of the direction, so the lookup has no seam at 180 degrees
 * and no pinch at the poles.
 */
export const GLSL_MAP = /* glsl */ `
struct MapCoord {
  vec2 uv;
  vec2 dx;
  vec2 dy;
};
// dir: unit vector. uOffset: 0.5 - (longitude of the image centre) / 360.
// latK: 1 for the latitude of the unit sphere, c/a for planetocentric latitude, a/c for planetographic latitude.
MapCoord mapCoord(vec3 dir, float uOffset, float latK) {
  float rho2 = max(dot(dir.xy, dir.xy), 1e-10);
  float rho = sqrt(rho2);
  float zk = dir.z * latK;
  vec3 ddx = dFdx(dir);
  vec3 ddy = dFdy(dir);
  MapCoord m;
  float lon = rho2 > 1e-9 ? atan(dir.y, dir.x) : 0.0;
  m.uv = vec2(lon * RECIPROCAL_PI2 + uOffset, atan(zk, rho) * RECIPROCAL_PI + 0.5);
  float iu = RECIPROCAL_PI2 / rho2;
  float iv = RECIPROCAL_PI / (rho2 + zk * zk);
  float rhoX = dot(dir.xy, ddx.xy) / rho;
  float rhoY = dot(dir.xy, ddy.xy) / rho;
  m.dx = vec2((dir.x * ddx.y - dir.y * ddx.x) * iu, (rho * ddx.z * latK - zk * rhoX) * iv);
  m.dy = vec2((dir.x * ddy.y - dir.y * ddy.x) * iu, (rho * ddy.z * latK - zk * rhoY) * iv);
  return m;
}
vec4 mapSample(sampler2D map, MapCoord m) {
  return textureGrad(map, m.uv, m.dx, m.dy);
}
// Map position only. Use it with the gradients of a MapCoord of a near direction.
vec2 mapUv(vec3 dir, float uOffset, float latK) {
  float rho2 = dot(dir.xy, dir.xy);
  float lon = rho2 > 1e-9 ? atan(dir.y, dir.x) : 0.0;
  return vec2(lon * RECIPROCAL_PI2 + uOffset, atan(dir.z * latK, sqrt(rho2)) * RECIPROCAL_PI + 0.5);
}
`;

/** Areas of a map with no data. The shader shows them in one flat colour. */
export const GLSL_NODATA = /* glsl */ `
uniform vec4 uNoData;         // x: 1 = black has no data, y: 1 = a grey band has no data, z: low limit of the band, w: high limit (linear light)
uniform vec3 uNoDataColor;
// 1 where the map has data, 0 where it has none. tex: colour of the map.
float mapHasData(vec3 tex) {
  float level = max3(tex);
  float data = mix(1.0, smoothstep(0.002, 0.012, level), uNoData.x);
  float band = smoothstep(uNoData.z - 0.04, uNoData.z, level) * (1.0 - smoothstep(uNoData.w, uNoData.w + 0.04, level));
  return data * (1.0 - uNoData.y * band);
}
`;

/** Number of shadow casters that a shader accepts. */
export const MAX_CASTERS = 4;

/** Diffuse laws and the soft shadow of another body. */
export const GLSL_LIGHT = /* glsl */ `
uniform vec4 uCasters[${MAX_CASTERS}];   // xyz: centre in the body axes (km), w: radius (km), 0 = not used
uniform float uSunAngR;                  // angular radius of the Sun (rad)

// Dusty surface with no atmosphere: mix of the Lambert law and the Lommel-Seeliger law.
// ls = 0 gives a matt ball. ls = 1 gives the flat disc of the full Moon.
float dustyDiffuse(float mu0, float mu, float ls) {
  float m0 = max(mu0, 0.0);
  float seeliger = 2.0 * m0 / (m0 + max(mu, 0.0) + 0.02);
  return mix(m0, seeliger, ls);
}

// Cosine of the Sun angle with a soft step over the terminator. w is the half-width of the step.
float softCos(float mu0, float w) {
  if (mu0 >= w) return mu0;
  if (mu0 <= -w) return 0.0;
  float t = mu0 + w;
  return t * t / (4.0 * w);
}

// Part of the sunlight (0 to 1) that reaches the point p (body axes, km). s: unit vector to the Sun.
float casterShadow(vec3 p, vec3 s) {
  float light = 1.0;
  for (int i = 0; i < ${MAX_CASTERS}; i++) {
    vec4 c = uCasters[i];
    if (c.w <= 0.0) continue;
    vec3 w = c.xyz - p;
    float t = dot(w, s);
    if (t <= 0.0) continue;
    float d = length(w - t * s);
    float pen = max(t * uSunAngR, 0.03 * c.w);            // half-width of the penumbra
    float depth = min(1.0, (c.w * c.w) / (pen * pen));    // largest part of the Sun disc that the caster can hide
    light *= 1.0 - depth * (1.0 - smoothstep(abs(c.w - pen), c.w + pen, d));
  }
  return light;
}
`;

/**
 * Single scattering in an atmosphere with one scale height around a sphere.
 *
 * The caller scales the polar axis so that the ground is a sphere of radius uAtm.x ("sphere space").
 * The optical path to the Sun uses a closed approximation of the Chapman function
 * (C. Schueler, "An Approximation to the Chapman Grazing-Incidence Function for Atmospheric Scattering", GPU Pro 3, 2012),
 * so the shader needs no second loop. A shader that includes this text must define ATM_SAMPLES.
 */
export const GLSL_ATMOSPHERE = /* glsl */ `
uniform vec4 uAtm;        // x: ground radius (km), y: scale height (km), z: top radius (km), w: equatorial radius / polar radius
uniform vec3 uAtmExt;     // extinction at the ground, 1/km, for red, green, blue
uniform vec3 uAtmRay;     // scattering of the gas (Rayleigh phase function) at the ground, 1/km
uniform vec3 uAtmMie;     // scattering of the haze (forward phase function) at the ground, 1/km
uniform vec2 uAtmHaze;    // x: asymmetry g of the haze, y: factor for light that scatters more than one time
uniform vec3 uSkyFill;    // light of the sky on the ground, as a part of the light that the air takes from the Sun beam

float atmPhaseGas(float c) {
  return 0.75 * (1.0 + c * c);
}
float atmPhaseHaze(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}

// Density-weighted path (km) from a point at distance r from the centre to the Sun.
// mu: cosine of the Sun zenith angle at the point. lit: 0 if the ground hides the Sun.
float atmSunColumn(float r, float mu, out float lit) {
  float R = uAtm.x;
  float H = uAtm.y;
  float c = sqrt(PI_HALF * r / H);
  float rho = exp(-max(r - R, 0.0) / H);
  float up = rho * c / ((c - 1.0) * abs(mu) + 1.0);
  lit = 1.0;
  if (mu >= 0.0) return H * up;
  float r0 = r * sqrt(max(1.0 - mu * mu, 0.0));       // nearest distance of the Sun ray to the centre
  lit = smoothstep(R - 0.3 * H, R + 0.3 * H, r0);
  float r0c = max(r0, R - H);
  float c0 = sqrt(PI_HALF * r0c / H);
  return H * max(2.0 * exp(-(r0c - R) / H) * c0 - up, 0.0);
}

// Sunlight that reaches the ground at a point with Sun zenith cosine mu.
vec3 atmSunAtGround(float mu) {
  float lit;
  float col = atmSunColumn(uAtm.x, mu, lit);
  return lit * exp(-uAtmExt * col);
}
// Light of the sky on the ground. direct: result of atmSunAtGround.
vec3 atmSkyAtGround(float mu, vec3 direct) {
  float t = clamp((mu + 0.14) / 0.28, 0.0, 1.0);
  return uSkyFill * (1.0 - direct) * (t * t * (0.14 + max(mu, 0.0)));
}

// ro: ray start minus planet centre, rd: unit ray direction, both in sphere space.
// tGround: distance to the ground along the ray, or a negative number if the ray does not hit the ground.
// sun: unit vector to the Sun in sphere space. cosScatter: cosine of the angle between the ray and the Sun direction.
// scatter: light that the air adds (for uSunColor = 1). trans: part of the light behind the air that remains.
void atmScatter(vec3 ro, vec3 rd, float tGround, vec3 sun, float cosScatter, out vec3 scatter, out vec3 trans) {
  float R = uAtm.x;
  float H = uAtm.y;
  scatter = vec3(0.0);
  trans = vec3(1.0);
  float tca = -dot(ro, rd);
  vec3 q = ro + rd * tca;                              // point of the ray that is nearest to the centre
  float h2 = uAtm.z * uAtm.z - dot(q, q);
  if (h2 <= 0.0) return;
  float halfChord = sqrt(h2);
  float t0 = max(tca - halfChord, 0.0);
  float t1 = tca + halfChord;
  if (tGround > 0.0) t1 = min(t1, tGround);
  if (t1 <= t0) return;
  float ds = (t1 - t0) / float(ATM_SAMPLES);
  float colView = 0.0;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ATM_SAMPLES; i++) {
    float t = t0 + (float(i) + 0.5) * ds;
    vec3 p = q + rd * (t - tca);
    float r = length(p);
    float rho = exp(-max(r - R, 0.0) / H);
    float lit;
    float colSun = atmSunColumn(r, dot(p, sun) / r, lit);
    vec3 T = exp(-uAtmExt * (colView + 0.5 * rho * ds + colSun));
    sum += T * (rho * lit * ds);
    colView += rho * ds;
  }
  vec3 phase = uAtmRay * atmPhaseGas(cosScatter) + uAtmMie * atmPhaseHaze(cosScatter, uAtmHaze.x);
  scatter = 0.25 * uAtmHaze.y * phase * sum;
  trans = exp(-uAtmExt * colView);
}
`;

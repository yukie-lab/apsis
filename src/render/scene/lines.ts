/**
 * Lines of the 3D scene: orbits and trajectories.
 *
 * - A line has a constant width on the screen (pixels).
 * - Each vertex is stored as two 32-bit parts (high and low). The shader subtracts the origin of the scene, which
 *   has the same two parts, from each part. The result has a precision of some centimetres at the distance of
 *   Neptune, thus a trajectory goes exactly through its spacecraft at any zoom, with no update of the vertex data
 *   when the camera moves.
 * - Each vertex has a time. The shader uses it for the colors of the path before and after the time of the view,
 *   and for the fade of an orbit behind its body.
 * - A line is a sequence of straight segments between its vertices. The object that moves on the line (a body, the
 *   spacecraft) is between two vertices, thus not exactly on the segment. The scene draws that part again with a
 *   second line that has a vertex at the object (see `setHidden`).
 */
import * as THREE from 'three';

/** Largest number of encounter spans of one line that can fade independently. */
export const MAX_SPANS = 24;

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aStartHigh;
attribute vec3 aStartLow;
attribute vec3 aEndHigh;
attribute vec3 aEndLow;
attribute vec3 aInfo;          // x, y: time at the start and at the end (seconds after the time base). z: span index, or -1
attribute vec2 aEdge;          // weight at the start and at the end (see setPoints)
uniform vec3 uOriginHigh;
uniform vec3 uOriginLow;
uniform vec2 uViewport;        // size of the drawing buffer, pixels
uniform float uWidth;          // pixels
uniform float uNear;
uniform float uSpanAlpha[${MAX_SPANS}];
uniform float uOutsideAlpha;
uniform vec2 uHidden;          // first and last segment that is not drawn
varying float vTime;
varying float vAcross;
varying float vAlpha;
void main() {
  vec3 s = (aStartHigh - uOriginHigh) + (aStartLow - uOriginLow);
  vec3 e = (aEndHigh - uOriginHigh) + (aEndLow - uOriginLow);
  vec4 sv = viewMatrix * vec4(s, 1.0);
  vec4 ev = viewMatrix * vec4(e, 1.0);
  float t0 = aInfo.x;
  float t1 = aInfo.y;
  float w0 = aEdge.x;
  float w1 = aEdge.y;
  // Cut the segment at the near plane: a point behind the camera has no position on the screen.
  float zn = -uNear;
  float segment = float(gl_InstanceID);
  bool hidden = (sv.z > zn && ev.z > zn) || (segment >= uHidden.x && segment <= uHidden.y);
  if (!hidden && sv.z > zn) { float k = (zn - sv.z) / (ev.z - sv.z); sv = mix(sv, ev, k); t0 = mix(t0, t1, k); w0 = mix(w0, w1, k); }
  else if (!hidden && ev.z > zn) { float k = (zn - ev.z) / (sv.z - ev.z); ev = mix(ev, sv, k); t1 = mix(t1, t0, k); w1 = mix(w1, w0, k); }
  vec4 sc = projectionMatrix * sv;
  vec4 ec = projectionMatrix * ev;
  vec2 dir = (ec.xy / ec.w - sc.xy / sc.w) * uViewport;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(1.0, 0.0);
  vec4 clip = position.x < 0.5 ? sc : ec;
  // One more pixel than the width: the fragment shader makes a soft edge of it.
  clip.xy += vec2(-dir.y, dir.x) * position.y * (uWidth + 1.0) / uViewport * clip.w;
  gl_Position = hidden ? vec4(2.0, 2.0, 2.0, 1.0) : clip;
  vTime = position.x < 0.5 ? t0 : t1;
  vAcross = position.y;
  int span = int(aInfo.z + 0.5);
  float w = position.x < 0.5 ? w0 : w1;
  vAlpha = aInfo.z < -0.5 ? uOutsideAlpha * w : mix(uOutsideAlpha, uSpanAlpha[span], w);
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColorPast;
uniform vec3 uColorFuture;
uniform float uNow;            // time of the view, seconds after the time base
uniform float uOpacity;
uniform float uWidth;
uniform vec2 uAge;             // x: period of the fade (0: no fade), y: brightness of the oldest part
uniform float uGap;            // the line has a gap for this time before and after the time of the view (0: no gap)
varying float vTime;
varying float vAcross;
varying float vAlpha;
void main() {
  #include <logdepthbuf_fragment>
  float alpha = clamp(0.5 * (uWidth + 1.0) * (1.0 - abs(vAcross)), 0.0, 1.0) * uOpacity * vAlpha;
  if (uGap > 0.0) alpha *= smoothstep(0.55 * uGap, uGap, abs(vTime - uNow));
  if (alpha < 0.004) discard;
  vec3 c = vTime <= uNow ? uColorPast : uColorFuture;
  if (uAge.x > 0.0) c *= mix(1.0, uAge.y, fract((uNow - vTime) / uAge.x));
  gl_FragColor = vec4(c, alpha);
  #include <colorspace_fragment>
}
`;

const FLOATS = 17;
const hi = Math.fround;

export interface PathLineOptions {
  /** Color of the part before the time of the view (and of a line with no time). */
  color: THREE.ColorRepresentation;
  /** Color of the part after the time of the view (default: the same color). */
  futureColor?: THREE.ColorRepresentation;
  /** Width, CSS pixels. */
  width: number;
  /** Orbit of a body: period of the fade in seconds, and the brightness of the part that is one period old. */
  age?: { period: number; floor: number };
  renderOrder?: number;
  /** A line whose vertices change frequently: number of vertices for which the line keeps one buffer. */
  dynamic?: number;
}

export class PathLine {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private geometry: THREE.InstancedBufferGeometry;
  private buffer: THREE.InstancedInterleavedBuffer | null = null;
  private readonly dynamic: number;
  private timeBase = 0;
  private readonly widthCss: number;
  /** Alpha of each span and of the part outside of all spans. */
  readonly spanAlpha: number[] = new Array<number>(MAX_SPANS).fill(1);

  constructor(opt: PathLineOptions) {
    this.widthCss = opt.width;
    this.dynamic = opt.dynamic ?? 0;
    this.material = new THREE.ShaderMaterial({
      name: 'path-line',
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uOriginHigh: { value: new THREE.Vector3() },
        uOriginLow: { value: new THREE.Vector3() },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uWidth: { value: opt.width },
        uNear: { value: 1e-4 },
        uSpanAlpha: { value: this.spanAlpha },
        uOutsideAlpha: { value: 1 },
        uHidden: { value: new THREE.Vector2(-1, -1) },
        uColorPast: { value: new THREE.Color(opt.color) },
        uColorFuture: { value: new THREE.Color(opt.futureColor ?? opt.color) },
        uNow: { value: 0 },
        uOpacity: { value: 1 },
        uAge: { value: new THREE.Vector2(opt.age?.period ?? 0, opt.age?.floor ?? 1) },
        uGap: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.geometry = PathLine.emptyGeometry();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = opt.renderOrder ?? 20;
    this.mesh.visible = false;
  }

  private static emptyGeometry(): THREE.InstancedBufferGeometry {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 0, 1, 0, 1, -1, 0, 1, 1, 0]), 3));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    g.instanceCount = 0;
    return g;
  }

  /**
   * Set the vertices of the line.
   * points: x, y, z of each vertex (km, world axes of the scene) relative to the reference point of the line.
   * times: time of each vertex (et), or null. spans: span index of the segment that starts at each vertex (-1: none),
   * or null. timeBase: the time that the shader subtracts from the times (default: the time of the first vertex).
   * The times near the time base have the best precision.
   * edges: two weights for each segment (at its start and at its end), or null (all weights are 1). A segment of
   * a span has the alpha of the span multiplied by the weight (weight 0: the alpha of the line outside of the spans).
   * A segment of no span has its alpha multiplied by the weight. The weights make the soft ends of a line.
   */
  setPoints(points: ArrayLike<number>, count: number, times: ArrayLike<number> | null = null, spans: ArrayLike<number> | null = null, timeBase?: number, edges: ArrayLike<number> | null = null): void {
    const n = Math.max(0, count - 1);
    // A dynamic line writes into its buffer. Other lines get a new buffer.
    const reuse = this.buffer !== null && this.dynamic > 0 && n * FLOATS <= this.buffer.array.length;
    const data = reuse ? (this.buffer!.array as Float32Array) : new Float32Array(Math.max(n, this.dynamic) * FLOATS);
    this.timeBase = timeBase ?? (times && count > 0 ? times[0] : 0);
    for (let i = 0; i < n; i++) {
      const o = i * FLOATS, a = 3 * i, b = 3 * (i + 1);
      for (let k = 0; k < 3; k++) {
        const p = points[a + k], q = points[b + k];
        const ph = hi(p), qh = hi(q);
        data[o + k] = ph; data[o + 3 + k] = p - ph;
        data[o + 6 + k] = qh; data[o + 9 + k] = q - qh;
      }
      data[o + 12] = times ? times[i] - this.timeBase : 0;
      data[o + 13] = times ? times[i + 1] - this.timeBase : 0;
      const s = spans ? spans[i] : -1;
      data[o + 14] = s >= 0 && s < MAX_SPANS ? s : -1;
      data[o + 15] = edges ? edges[2 * i] : 1;
      data[o + 16] = edges ? edges[2 * i + 1] : 1;
    }
    if (reuse) {
      this.buffer!.needsUpdate = true;
      this.geometry.instanceCount = n;
      this.mesh.visible = n > 0 && (this.material.uniforms.uOpacity.value as number) > 0.003;
      return;
    }
    // A new geometry: the graphics card frees the buffer of the old one.
    this.geometry.dispose();
    const g = PathLine.emptyGeometry();
    const buffer = new THREE.InstancedInterleavedBuffer(data, FLOATS);
    if (this.dynamic > 0) buffer.setUsage(THREE.DynamicDrawUsage);
    this.buffer = buffer;
    g.setAttribute('aStartHigh', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    g.setAttribute('aStartLow', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    g.setAttribute('aEndHigh', new THREE.InterleavedBufferAttribute(buffer, 3, 6));
    g.setAttribute('aEndLow', new THREE.InterleavedBufferAttribute(buffer, 3, 9));
    g.setAttribute('aInfo', new THREE.InterleavedBufferAttribute(buffer, 3, 12));
    g.setAttribute('aEdge', new THREE.InterleavedBufferAttribute(buffer, 2, 15));
    g.instanceCount = n;
    this.geometry = g;
    this.mesh.geometry = g;
    this.mesh.visible = n > 0;
  }

  /** Origin of the scene minus the reference point of the line, km, world axes. */
  setOrigin(x: number, y: number, z: number): void {
    const u = this.material.uniforms;
    const xh = hi(x), yh = hi(y), zh = hi(z);
    (u.uOriginHigh.value as THREE.Vector3).set(xh, yh, zh);
    (u.uOriginLow.value as THREE.Vector3).set(x - xh, y - yh, z - zh);
  }
  /** Time of the view, et. */
  setNow(et: number): void { this.material.uniforms.uNow.value = et - this.timeBase; }
  setOpacity(v: number): void {
    this.material.uniforms.uOpacity.value = v;
    this.mesh.visible = v > 0.003 && this.geometry.instanceCount > 0;
  }
  setOutsideAlpha(v: number): void { this.material.uniforms.uOutsideAlpha.value = v; }
  /** Do not draw the segments from `first` to `last` (index of the vertex at which a segment starts). -1, -1: draw all. */
  setHidden(first: number, last: number): void { (this.material.uniforms.uHidden.value as THREE.Vector2).set(first, last); }
  setAge(period: number, floor: number): void { (this.material.uniforms.uAge.value as THREE.Vector2).set(period, floor); }
  /** Do not draw the line for this time (s) before and after the time of the view: the line does not go through the 3D model of the spacecraft. */
  setGap(seconds: number): void { this.material.uniforms.uGap.value = seconds; }
  /** Call each frame: size of the drawing buffer in pixels, pixel ratio and near distance of the camera. */
  setView(widthPx: number, heightPx: number, pixelRatio: number, near: number): void {
    const u = this.material.uniforms;
    (u.uViewport.value as THREE.Vector2).set(widthPx, heightPx);
    u.uWidth.value = this.widthCss * pixelRatio;
    u.uNear.value = near;
  }
  get count(): number { return this.geometry.instanceCount; }
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

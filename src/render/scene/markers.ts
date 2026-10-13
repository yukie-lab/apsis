/**
 * Position marks of the 3D scene: a dot for a body that is too small to see, a diamond for the spacecraft, small
 * marks for the events of a flight. A mark has a constant size on the screen: it does not show the size of the object.
 */
import * as THREE from 'three';

export type MarkShape = 'dot' | 'ring' | 'diamond';
const SHAPE: Record<MarkShape, number> = { dot: 0, ring: 1, diamond: 2 };

const VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute vec3 aStyle;         // x: size (CSS pixels), y: shape, z: alpha
uniform float uPixelRatio;
varying vec3 vColor;
varying vec2 vStyle;
void main() {
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  gl_PointSize = aStyle.x * uPixelRatio;
  vColor = aColor;
  vStyle = aStyle.yz;
  #include <logdepthbuf_vertex>
}
`;

const FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vColor;
varying vec2 vStyle;
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float a;
  if (vStyle.x < 0.5) {
    // Dot: a bright core and a soft edge.
    a = smoothstep(1.0, 0.35, r);
  } else if (vStyle.x < 1.5) {
    a = smoothstep(1.0, 0.9, r) * smoothstep(0.55, 0.68, r);
  } else {
    float d = abs(p.x) + abs(p.y);
    a = max(smoothstep(1.0, 0.92, d) * smoothstep(0.6, 0.7, d), smoothstep(0.3, 0.2, d));
  }
  a *= vStyle.y;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

export class Markers {
  readonly points: THREE.Points;
  private readonly position: THREE.BufferAttribute;
  private readonly color: THREE.BufferAttribute;
  private readonly style: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private n = 0;
  private readonly tmp = new THREE.Color();

  constructor(private readonly capacity = 256) {
    const g = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(3 * capacity), 3);
    this.color = new THREE.BufferAttribute(new Float32Array(3 * capacity), 3);
    this.style = new THREE.BufferAttribute(new Float32Array(3 * capacity), 3);
    for (const a of [this.position, this.color, this.style]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.position);
    g.setAttribute('aColor', this.color);
    g.setAttribute('aStyle', this.style);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      name: 'markers', vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms: { uPixelRatio: { value: 1 } },
      transparent: true, depthWrite: false, toneMapped: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
  }
  begin(pixelRatio: number): void { this.n = 0; this.material.uniforms.uPixelRatio.value = pixelRatio; }
  /** Position relative to the origin of the scene, km. Color: CSS color text. Size: CSS pixels. */
  add(x: number, y: number, z: number, color: string, size: number, shape: MarkShape, alpha = 1): void {
    if (this.n >= this.capacity || alpha <= 0.01) return;
    const k = 3 * this.n++;
    const c = this.tmp.set(color);
    this.position.array[k] = x; this.position.array[k + 1] = y; this.position.array[k + 2] = z;
    this.color.array[k] = c.r; this.color.array[k + 1] = c.g; this.color.array[k + 2] = c.b;
    this.style.array[k] = size; this.style.array[k + 1] = SHAPE[shape]; this.style.array[k + 2] = alpha;
  }
  end(): void {
    this.points.geometry.setDrawRange(0, this.n);
    this.position.needsUpdate = true; this.color.needsUpdate = true; this.style.needsUpdate = true;
  }
  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}

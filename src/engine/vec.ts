/** Three-dimensional vector helpers. Vectors are plain number triples. */
export type Vec3 = [number, number, number];
export interface State { r: Vec3; v: Vec3 }
export type Mat3 = [Vec3, Vec3, Vec3]; // rows

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const unit = (a: Vec3): Vec3 => {
  const n = norm(a);
  return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
};
export const lincomb = (a: Vec3, sa: number, b: Vec3, sb: number): Vec3 => [
  a[0] * sa + b[0] * sb,
  a[1] * sa + b[1] * sb,
  a[2] * sa + b[2] * sb,
];
export const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Angle between two vectors, rad, range 0..pi. */
export const angle = (a: Vec3, b: Vec3): number => {
  const c = cross(a, b);
  return Math.atan2(norm(c), dot(a, b));
};
export const mulMV = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
export const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
export const mulMM = (a: Mat3, b: Mat3): Mat3 => {
  const bt = transpose(b);
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])],
  ];
};
/** Rotation of a vector about a unit axis by an angle (rad), right-hand rule. */
export const rotateAbout = (v: Vec3, axis: Vec3, ang: number): Vec3 => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const kxv = cross(axis, v);
  const kd = dot(axis, v) * (1 - c);
  return [v[0] * c + kxv[0] * s + axis[0] * kd, v[1] * c + kxv[1] * s + axis[1] * kd, v[2] * c + kxv[2] * s + axis[2] * kd];
};
export const DEG = Math.PI / 180;
export const TWO_PI = 2 * Math.PI;
/** Wrap an angle to the range 0..2pi. */
export const wrap2pi = (a: number): number => {
  const x = a % TWO_PI;
  return x < 0 ? x + TWO_PI : x;
};

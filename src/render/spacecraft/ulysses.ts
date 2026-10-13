/**
 * Ulysses-class solar polar probe (original procedural look-alike).
 *
 * A wide, low box bus in gold and black blankets (about 3.2 m x 3.3 m, 2.1 m high with the dish),
 * a 1.65 m white dish on the top deck, one radioisotope generator on a short outrigger at -X, a
 * 5.6 m radial boom with magnetometers at +X, two wire antennas along +Y and -Y (72 m tip to tip)
 * and one 7.5 m axial boom antenna along -Z.
 *
 * Axes: +Z = dish boresight and spin axis. The spacecraft spins at about 5 rpm.
 *
 * Bounding radius: `radius` of this model covers the bus, the dish, the generator and the radial
 * boom only (about 7.3 m). The two wire antennas (36 m each) and the axial boom antenna are in
 * assemblies with `inRadius = false`. They reach far outside the sphere of that radius. A camera
 * that frames the model by `radius` thus stays close to the bus.
 */
import type { Material } from 'three';
import type { Builder, Ctx, ModelSpec } from './builder';
import { disc, extrude, flatPolygon, lathe, plane, polar, polygon, sphere, vadd } from './geometry';
import type { P2, V3 } from './geometry';
import { barrel, bolts, cable, cassegrain, coverPlate, dish, flange, hinge, louvers, lowGain, plugs, quilt, rtg, strutRing, thrusterPod } from './parts';

const DEG = Math.PI / 180;
const HX = 1.6; // half size of the main platform along X
const HY = 1.65; // half size of the main platform along Y
const CH = 0.32; // corner chamfer of the main platform
const ZT = 0.45; // top deck
const ZM = -0.35; // underside of the main platform
const ZL = -0.68; // underside of the lower module
const LX = 1.1; // half sizes and chamfer of the lower module
const LY = 1.16;
const LC = 0.26;
const WIRE_TIP = 36; // distance of a wire antenna tip from the spin axis (72 m tip to tip)
const AXIAL_LEN = 7.5;
const BOOM_LEN = 5.6;

/** Rectangle with cut corners, counter-clockwise. */
function chamfered(hx: number, hy: number, ch: number): P2[] {
  return [[hx, -hy + ch], [hx, hy - ch], [hx - ch, hy], [-hx + ch, hy], [-hx, hy - ch], [-hx, -hy + ch], [-hx + ch, -hy], [hx - ch, -hy]];
}

const GOLD_TINTS = [0xffffff, 0xf4dcb4, 0xfbeacc, 0xeed2a2] as const;
const BLACK_TINTS = [0xffffff, 0xe2e2ee, 0xd2d2dc] as const;
const WHITE_TINTS = [0xffffff, 0xf0eee8] as const;

/**
 * Row of blankets on a face, from local -X to local +X. Each entry is [width, material]. Every
 * blanket is a quilt of panels with fixing buttons.
 */
function blanketRow(f: Ctx, h: number, row: readonly (readonly [number, Material])[], seed: number): void {
  const m = f.mat;
  let total = 0;
  for (const p of row) total += p[0];
  let x = -total / 2;
  for (let k = 0; k < row.length; k++) {
    const [w, mat] = row[k];
    const tints = mat === m.foilBlack ? BLACK_TINTS : mat === m.clothWhite ? WHITE_TINTS : GOLD_TINTS;
    quilt(f.move(x + w / 2, 0, 0.002), w - 0.02, h, { cols: Math.max(1, Math.round(w / 0.42)), rows: 2, mat, tints, buttons: true, seed: seed + k * 3 });
    x += w;
  }
}

export function buildUlysses(b: Builder): ModelSpec {
  const m = b.mat;
  const bus = b.assembly('bus').ctx();
  const ZC = (ZT + ZM) / 2;
  const SH = ZT - ZM;

  // -------------------------------------------------------------------------------------------
  // Bus: main platform and a smaller lower module
  // -------------------------------------------------------------------------------------------
  bus.add(extrude(chamfered(HX, HY, CH), ZM, ZT, 0.03), m.foilGold, { tint: 0xe6c48e });
  bus.add(extrude(chamfered(LX, LY, LC), ZL, ZM + 0.02, 0.025), m.foilBlack);

  blanketRow(bus.face([1, 0, 0], HX).move(0, ZC, 0), SH - 0.08, [[0.84, m.foilGold], [0.98, m.foilBlack], [0.84, m.foilGold]], 2);
  blanketRow(bus.face([-1, 0, 0], HX).move(0, ZC, 0), SH - 0.08, [[0.9, m.foilGold], [0.86, m.clothWhite], [0.9, m.foilGold]], 12);
  blanketRow(bus.face([0, 1, 0], HY).move(0, ZC, 0), SH - 0.08, [[0.7, m.foilBlack], [1.16, m.foilGold], [0.7, m.foilBlack]], 22);
  blanketRow(bus.face([0, -1, 0], HY).move(0, ZC, 0), SH - 0.08, [[1.04, m.foilGold], [0.48, m.foilAmber], [1.04, m.foilBlack]], 32);

  for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    const mid: V3 = [sx * (HX - CH / 2), sy * (HY - CH / 2), ZC];
    const n: V3 = [sx * Math.SQRT1_2, sy * Math.SQRT1_2, 0];
    const f = bus.aim(mid, vadd(mid, n));
    quilt(f.move(0, 0, 0.002), CH * Math.SQRT2 - 0.06, SH - 0.08, { cols: 1, rows: 2, mat: m.foilAmber, tints: [0xffffff, 0xe6d0b0], buttons: true, seed: 40 + sx + 2 * sy });
    if (sx === sy) {
      // Thruster cluster on a bracket: two axial and two tangential thrusters.
      const p = vadd(mid, [n[0] * 0.2, n[1] * 0.2, 0.16]);
      bus.strut(vadd(mid, [0, 0, 0.16]), p, 0.035, m.aluminium, 8);
      bus.strut(vadd(mid, [0, 0, -0.1]), p, 0.014, m.aluminium, 6);
      const tan: V3 = [-n[1], n[0], 0];
      thrusterPod(bus.at(p), [[0, 0, 1], [0, 0, -1], tan, [-tan[0], -tan[1], 0]], 0.026, m.foilGold);
    } else {
      // Sun sensor.
      f.move(0, 0.18, 0.045).box(0.12, 0.1, 0.07, m.aluminium, 0.008);
      f.move(0, 0.18, 0.0815).add(plane(0.07, 0.05), m.glass);
    }
  }

  // Top deck: a quilted blanket in three parts, and a raised bay under the dish.
  const top = bus.move(0, 0, ZT);
  quilt(top.move(0, 0, 0.002), 2 * (HX - CH) - 0.02, 2 * HY - 0.1, { cols: 5, rows: 6, buttons: true, seed: 51 });
  for (const sx of [-1, 1]) {
    quilt(top.move(sx * (HX - CH / 2 - 0.02), 0, 0.002), CH - 0.06, 2 * (HY - CH) - 0.04, { cols: 1, rows: 5, buttons: true, seed: 55 + sx });
  }
  top.add(extrude(polygon(8, 0.98, 22.5 * DEG), 0.01, 0.13, 0.025), m.foilBlack);
  top.add(lathe([[0.9, 0.13], [0.94, 0.13, 1], [0.94, 0.145, 1], [0.9, 0.145]], 8, { phi0: 22.5 * DEG }), m.titanium);
  // Two plasma analysers at the +X edge of the deck.
  for (const sy of [-1, 1]) {
    const a = top.move(1.3, sy * 0.72, 0.016);
    a.move(0, 0, 0.09).box(0.3, 0.24, 0.18, m.foilGold, 0.014, 0xf0d4a4);
    a.move(0.02, 0, 0.18).rotX(Math.PI / 2).cyl(0.09, -0.1, 0.1, m.aluminium, 18, 0.006);
    a.move(0.02, 0, 0.272).add(plane(0.03, 0.15), m.paintBlack);
    cable(top, [[1.16, sy * 0.72, 0.03], [1.04, sy * 0.6, 0.035], [0.92, sy * 0.4, 0.04]], 0.01, m.harness);
  }
  // Nutation dampers and their bracket.
  for (const y of [-0.5, 0.5]) top.move(-1.3, y - 0.3, 0.076).rotX(Math.PI / 2).cyl(0.035, -0.3, 0.3, m.aluminium, 12, 0.006);
  top.move(-1.3, -0.3, 0.046).box(0.12, 1.3, 0.04, m.aluminium, 0.006);
  // Equipment boxes with connectors, a radiator with louvers and a mirror radiator.
  const boxes: readonly (readonly [number, number, number, number, number, Material, number])[] = [
    [-0.72, -1.24, 0.44, 0.34, 0.16, m.foilBlack, 0xffffff],
    [0.86, 1.26, 0.52, 0.3, 0.2, m.foilGold, 0xf4d8a8],
    [-0.5, 1.3, 0.3, 0.26, 0.12, m.foilSilver, 0xffffff],
    [1.22, 0, 0.22, 0.36, 0.14, m.foilBlack, 0xe6e6f0],
  ];
  for (const [x, y, w, d, h, mat, tint] of boxes) {
    const e = top.move(x, y, 0.016);
    e.move(0, 0, h / 2).box(w, d, h, mat, 0.016, tint);
    for (const cx of [-0.08, 0, 0.08]) e.move(cx, -Math.sign(y || 1) * (d / 2 + 0.012), h * 0.5).rotX(Math.PI / 2).cyl(0.016, -0.014, 0.014, m.aluminium, 10, 0.002);
    cable(top, [[x, y - Math.sign(y || 1) * (d / 2 + 0.03), 0.016 + h * 0.5], [x * 0.9, y * 0.82, 0.04], [x * 0.72, y * 0.66, 0.035], [x * 0.56, y * 0.52, 0.06]], 0.011, m.harness);
  }
  louvers(top.move(0.15, -1.3, 0.02), 0.62, 0.42, 9);
  top.move(-1.0, 0.95, 0.026).box(0.5, 0.42, 0.016, m.paintWhite, 0.004);
  top.move(-1.0, 0.95, 0.0355).add(plane(0.46, 0.38), m.mirror, { uv: [1.5, 1.25] });
  // Second low-gain antenna on a mast, and lifting points at the corners.
  top.at([1.26, -1.3, 0.016]).cyl(0.05, 0, 0.03, m.aluminium, 14);
  lowGain(top.at([1.26, -1.3, 0.04]), 0.9, 0.34);
  for (const [x, y] of [[1.2, 1.45], [-1.2, 1.45], [-1.2, -1.45], [1.2, -1.45]] as const) {
    top.move(x, y, 0.036).box(0.09, 0.09, 0.05, m.aluminium, 0.006);
    top.move(x, y, 0.061).rotY(Math.PI / 2).add(lathe([[0.016, -0.01], [0.034, -0.01, 1], [0.034, 0.01, 1], [0.016, 0.01, 1], [0.016, -0.01]], 12), m.aluminium);
  }
  // Radiators with louvers on the two Y walls.
  louvers(bus.face([0, 1, 0], HY).move(0.98, ZC + 0.02, 0.02), 0.5, 0.5, 9);
  louvers(bus.face([0, -1, 0], HY).move(-0.95, ZC + 0.02, 0.02), 0.5, 0.5, 9);

  // Lower module: louvers on the X faces, gold panels on the Y faces, launch adapter ring below.
  const ZLC = (ZL + ZM) / 2;
  for (const sx of [-1, 1]) {
    const f = bus.face([sx, 0, 0], LX).move(0, ZLC, 0);
    louvers(f.move(-0.44, 0, 0.004), 0.72, 0.25, 6);
    louvers(f.move(0.44, 0, 0.004), 0.72, 0.25, 6);
  }
  for (const sy of [-1, 1]) {
    const f = bus.face([0, sy, 0], LY).move(0, ZLC, 0);
    quilt(f.move(0, 0, 0.002), 1.7, ZM - ZL - 0.06, { cols: 4, rows: 1, buttons: true, seed: sy > 0 ? 61 : 67 });
  }
  bus.move(0, 0, ZL - 0.004).add(flatPolygon(chamfered(LX - 0.03, LY - 0.03, LC), 0, false), m.foilGold, { tint: 0xd9b27c, uv: [4.2, 4.4] });
  const aft = bus.move(0, 0, ZL).rotX(Math.PI); // local +Z = model -Z, local +Y = model -Y
  // Blankets on the underside of the lower module, and a dark blanket inside the adapter ring.
  quilt(aft.move(0, 0, 0.006), 2 * (LX - LC) - 0.02, 2 * LY - 0.1, { cols: 4, rows: 5, tints: [0xf0d2a2, 0xe2c08c, 0xf6dcb0, 0xd9b680], buttons: true, seed: 71 });
  for (const sx of [-1, 1]) {
    quilt(aft.move(sx * (LX - LC / 2 - 0.02), 0, 0.006), LC - 0.06, 2 * (LY - LC) - 0.04, { cols: 1, rows: 4, tints: [0xe2c08c, 0xf0d2a2], buttons: true, seed: 75 + sx });
  }
  aft.move(0, 0, 0.03).add(disc(0.6, 40), m.foilBlack, { uv: [2.4, 2.4] });
  flange(aft, 0.6, 0.66, 0.12, m.aluminium, 48);
  aft.add(lathe([[0.6, 0.12], [0.6, 0]], 48), m.aluminium);
  for (let k = 0; k < 24; k++) bolts(aft.rotZ((15 * k + 7.5) * DEG).move(0.63, 0, 0.12), [0, 0], [0, 0], 1);
  // Umbilical connector plates and a fill valve beside the ring.
  coverPlate(aft.move(-0.82, 0.62, 0.022), 0.26, 0.18, m.aluminium, 0xd0d0d4, 0.07);
  plugs(aft.move(-0.82, 0.62, 0.03), 3, 0.06);
  coverPlate(aft.move(0.2, -0.92, 0.022), 0.3, 0.16, m.aluminium, 0xd0d0d4, 0.07);
  plugs(aft.move(0.2, -0.92, 0.03), 4, 0.06);
  cable(aft, [[-0.82, 0.5, 0.03], [-0.7, 0.3, 0.035], [-0.66, 0.1, 0.03]], 0.01, m.harness);
  // Blankets on the underside of the main platform, around the lower module.
  const under = bus.move(0, 0, ZM).rotX(Math.PI);
  for (const sx of [-1, 1]) {
    quilt(under.move(sx * (LX + HX) / 2, 0, 0.002), HX - LX - 0.05, 2 * (HY - CH) - 0.04, { cols: 1, rows: 5, tints: [0xf0d2a2, 0xe2c08c, 0xf6dcb0], buttons: true, seed: 81 + sx });
  }
  for (const sy of [-1, 1]) {
    quilt(under.move(0, sy * (LY + HY) / 2, 0.002), 2 * (HX - CH) - 0.04, HY - LY - 0.05, { cols: 6, rows: 1, tints: [0xe2c08c, 0xf6dcb0, 0xf0d2a2, 0xd9b680], buttons: true, seed: 85 + sy });
  }
  // Two small boxes and a heater plate under the platform.
  under.move(1.34, 0.7, 0.07).box(0.3, 0.4, 0.1, m.foilBlack, 0.014);
  under.move(-1.34, -0.5, 0.06).box(0.26, 0.5, 0.08, m.foilSilver, 0.014);
  coverPlate(under.move(0.5, 1.4, 0.024), 0.5, 0.22, m.paintWhite, 0xe8e8e4, 0.08);
  for (let k = 0; k < 8; k++) aft.at(polar(0.7, (45 * k + 22.5) * DEG, 0.03)).rotZ((45 * k + 22.5) * DEG).box(0.1, 0.07, 0.06, m.titanium, 0.006);
  lowGain(aft.move(0.82, -0.78, 0), 0.9, 0.1);
  // Housing of the axial boom antenna.
  aft.cyl(0.13, 0, 0.17, m.foilGold, 20, 0.012, 0xe2bc84);
  aft.add(lathe([[0.06, 0.17], [0.03, 0.26, 1], [0.02, 0.26]], 14), m.aluminium);

  // -------------------------------------------------------------------------------------------
  // Instruments on the side walls
  // -------------------------------------------------------------------------------------------
  const ins = b.assembly('instruments').ctx();
  // Dust detector: an open drum with a grid, on the +Y wall.
  const dp: V3 = [0.95, HY + 0.02, 0.02];
  const dust = ins.aim(dp, vadd(dp, [0.15, 1, 0.3]));
  dust.add(lathe([[0, -0.08], [0.2, -0.08, 1], [0.2, 0.3, 1], [0.215, 0.3, 1], [0.215, 0.33, 1], [0.18, 0.33]], 28), m.foilGold, { tint: 0xf2d6a4 });
  dust.add(lathe([[0.18, 0.33], [0.18, 0.02, 1], [0, 0.02]], 28), m.paintBlack);
  dust.move(0, 0, 0.31).add(flatPolygon(polygon(28, 0.18)), m.meshGold, { uv: [4, 4] });
  // Particle telescopes on the -Y wall: three barrels on one bracket.
  const tp: V3 = [-0.7, -HY - 0.02, 0.05];
  const tel = ins.aim(tp, vadd(tp, [0, -1, 0]));
  tel.move(0, 0, 0.07).box(0.46, 0.3, 0.14, m.foilGold, 0.014, 0xf0d2a0);
  const looks: readonly V3[] = [[-0.5, 0.3, 1], [0, 0.55, 1], [0.5, 0.1, 1]];
  for (let k = 0; k < 3; k++) {
    const o: V3 = [-0.14 + 0.14 * k, 0, 0.14];
    barrel(tel.aim(o, vadd(o, looks[k])), 0.05, 0.17, m.paintWhite, 0.03);
  }
  // Cosmic ray package beside the boom root on the +X wall.
  const cp: V3 = [HX + 0.02, -0.85, 0.08];
  const cr = ins.aim(cp, vadd(cp, [1, 0, 0]));
  cr.move(0, 0, 0.11).box(0.44, 0.36, 0.22, m.foilBlack, 0.016);
  barrel(cr.move(-0.1, 0.05, 0.22), 0.06, 0.14, m.aluminium, 0);
  barrel(cr.aim([0.1, 0.02, 0.22], [0.25, 0.3, 0.9]), 0.045, 0.16, m.paintWhite, 0.02);
  // Energetic particle sensor on the -X wall, clear of the generator.
  const ep: V3 = [-HX - 0.02, 0.95, 0.1];
  const es = ins.aim(ep, vadd(ep, [-1, 0, 0]));
  es.move(0, 0, 0.08).box(0.3, 0.26, 0.16, m.foilGold, 0.014, 0xe9c890);
  barrel(es.aim([0, 0.04, 0.16], [0.3, 0.5, 1]), 0.04, 0.2, m.aluminium, 0);

  // -------------------------------------------------------------------------------------------
  // High-gain antenna on the top deck
  // -------------------------------------------------------------------------------------------
  const Z_DISH = ZT + 0.32;
  const hga = b.assembly('hga').ctx().move(0, 0, Z_DISH);
  const d = dish(hga, { diameter: 1.65, fd: 0.4, gores: 12, seams: 3, ribs: 12, ribDepth: 0.07, backRings: [0.62], seg: 56 });
  const feed = cassegrain(hga, d, { subDiameter: 0.25, struts: 3, strutAt: 0.82, strutR: 0.011, hornR: 0.07, hornLen: 0.2, phase: 30 * DEG });
  lowGain(hga.move(0, 0, feed.topZ), 0.75, 0.05);
  const zBack = (r: number): number => Z_DISH + d.z(r) - d.thickness - 0.045;
  const ZBAY = ZT + 0.13;
  strutRing(bus, 6, 0.66, ZBAY, 0.51, zBack(0.51), 0.016, m.aluminium, true);
  bus.add(lathe([[0.3, ZBAY], [0.22, Z_DISH - d.thickness, 1], [0.16, Z_DISH - d.thickness]], 24), m.foilGold, { tint: 0xe8c690 });
  bus.add(lathe([[0.62, ZBAY], [0.7, ZBAY, 1], [0.7, ZBAY + 0.025, 1], [0.62, ZBAY + 0.025]], 36), m.aluminium);

  // -------------------------------------------------------------------------------------------
  // Radioisotope generator on an outrigger at -X
  // -------------------------------------------------------------------------------------------
  const gen = b.assembly('generator').ctx();
  const GX = -(HX + 0.62);
  const GZ = 0.05;
  const g = gen.aim([GX, 0, GZ], [GX - 1, 0, GZ]); // local +Z = model -X, local +Y = model +Z
  rtg(g, { length: 1.14, coreR: 0.115, finR: 0.21, fins: 8, finT: 0.008, finSpan: 0.9, tubes: true });
  g.cyl(0.17, -0.1, -0.06, m.titanium, 24, 0.005);
  g.cyl(0.07, -0.06, -0.025, m.titanium, 14);
  for (let k = 0; k < 4; k++) {
    const a = (45 + 90 * k) * DEG;
    const cy = Math.cos(a);
    const cz = Math.sin(a);
    const wall: V3 = [-HX, cy * 0.62, GZ + cz * 0.4];
    const ring: V3 = [GX + 0.08, cy * 0.21, GZ + cz * 0.21];
    gen.strut(wall, ring, 0.018, m.titanium, 8);
    gen.at(wall).box(0.05, 0.1, 0.1, m.aluminium, 0.006);
  }
  gen.strut([-HX, 0.62 * Math.SQRT1_2, GZ + 0.4 * Math.SQRT1_2], [GX + 0.08, -0.21 * Math.SQRT1_2, GZ + 0.21 * Math.SQRT1_2], 0.01, m.titanium, 6);
  gen.strut([-HX, -0.62 * Math.SQRT1_2, GZ - 0.4 * Math.SQRT1_2], [GX + 0.08, 0.21 * Math.SQRT1_2, GZ - 0.21 * Math.SQRT1_2], 0.01, m.titanium, 6);
  cable(gen, [[GX + 0.02, 0.1, GZ - 0.12], [-HX - 0.3, 0.14, GZ - 0.24], [-HX - 0.01, 0.16, GZ - 0.3]], 0.016, m.harness);

  // -------------------------------------------------------------------------------------------
  // Radial boom at +X with the magnetometers and the burst sensors
  // -------------------------------------------------------------------------------------------
  const root: V3 = [HX + 0.02, 0.1, 0.05];
  const bm = b.assembly('radial_boom').ctx().aim(root, vadd(root, [1, 0, 0])); // local +Z = model +X, local +Y = model +Z
  const TIP = BOOM_LEN - 0.02;
  const MID = 2.7;
  bm.move(0, 0, 0.05).box(0.34, 0.26, 0.1, m.aluminium, 0.014);
  hinge(bm.move(0, 0, 0.13), 0.24, 0.03);
  bm.cyl(0.034, 0.13, MID, m.foilSilver, 14);
  bm.move(0, 0, MID).box(0.1, 0.1, 0.14, m.aluminium, 0.01);
  hinge(bm.move(0, 0.062, MID), 0.13, 0.02);
  bm.cyl(0.027, MID, TIP - 0.26, m.foilSilver, 12);
  const clamp = lathe([[0.027, -0.014], [0.04, -0.014, 1], [0.04, 0.014, 1], [0.027, 0.014, 1], [0.027, -0.014]], 12);
  for (let s = 0.5; s < TIP - 0.3; s += 0.44) bm.move(0, 0, s).inst('boomClamp', clamp, m.aluminium);
  const run: V3[] = [];
  for (let s = 0.16; s <= TIP - 0.3; s += 0.44) run.push([0.012 * Math.sin(s * 5), -0.046, s]);
  cable(bm, run, 0.008, m.harness);
  // Two burst sensors on a cross arm.
  const bs = bm.move(0, 0, 2.05);
  bs.rotY(Math.PI / 2).cyl(0.014, -0.16, 0.16, m.aluminium, 8);
  for (const sx of [-1, 1]) {
    bs.move(sx * 0.19, 0, 0).add(sphere(0.075, 18, 10), m.foilGold, { tint: 0xf2d8aa });
    bs.move(sx * 0.19, 0, 0).rotY((sx * Math.PI) / 2).cyl(0.05, 0.06, 0.085, m.aluminium, 14);
  }
  // Search coil: three thin rods at right angles.
  const sc = bm.move(0, 0, 3.6);
  sc.move(0, 0.06, 0).box(0.07, 0.07, 0.07, m.foilGold, 0.008);
  sc.move(0, 0.1, 0).rotY(Math.PI / 2).cyl(0.012, -0.18, 0.18, m.paintWhite, 8);
  sc.move(0, 0.1, 0).rotX(Math.PI / 2).cyl(0.012, -0.02, 0.2, m.paintWhite, 8);
  sc.move(0, 0.1, 0).cyl(0.012, -0.16, 0.16, m.paintWhite, 8);
  // Flux-gate magnetometer.
  const fg = bm.move(0, 0, 4.5);
  fg.move(0, 0.075, 0).box(0.13, 0.11, 0.13, m.foilGold, 0.012, 0xf0d0a0);
  fg.move(0, 0.15, 0).rotX(-Math.PI / 2).cyl(0.035, -0.02, 0.05, m.paintWhite, 12, 0.004);
  // Helium magnetometer at the tip.
  bm.add(lathe([[0.027, TIP - 0.26], [0.066, TIP - 0.22, 1], [0.066, TIP - 0.02, 1], [0.05, TIP, 1], [0, TIP]], 18), m.foilGold, { tint: 0xf6dcae });
  bm.add(lathe([[0.067, TIP - 0.14], [0.074, TIP - 0.14, 1], [0.074, TIP - 0.1, 1], [0.067, TIP - 0.1]], 18), m.aluminium);

  // -------------------------------------------------------------------------------------------
  // Wire antennas along +Y and -Y (outside the bounding radius, see the file header)
  // -------------------------------------------------------------------------------------------
  for (const sy of [-1, 1]) {
    const f = bus.face([0, sy, 0], HY).move(0, ZC - 0.08, 0);
    f.move(0, 0, 0.11).box(0.36, 0.32, 0.22, m.foilBlack, 0.016, 0xe8e8f4);
    f.cyl(0.05, 0.22, 0.3, m.aluminium, 14, 0.005);
    f.add(lathe([[0.02, 0.3], [0.032, 0.3, 1], [0.012, 0.36]], 12), m.aluminium);
  }
  const wires = b.assembly('wire_antennas');
  wires.inRadius = false;
  const wc = wires.ctx();
  for (const sy of [-1, 1]) {
    const y0 = sy * (HY + 0.34);
    const z = ZC - 0.08;
    wc.strut([0, y0, z], [0, sy * WIRE_TIP, z], 0.006, m.antennaWire, 6);
    wc.aim([0, sy * (WIRE_TIP - 0.1), z], [0, sy * WIRE_TIP, z]).cyl(0.03, 0, 0.1, m.aluminium, 10, 0.004);
  }

  // -------------------------------------------------------------------------------------------
  // Axial boom antenna along -Z (outside the bounding radius, see the file header)
  // -------------------------------------------------------------------------------------------
  const axial = b.assembly('axial_antenna');
  axial.inRadius = false;
  const ac = axial.ctx();
  const z0 = ZL - 0.25;
  ac.strut([0, 0, z0], [0, 0, z0 - AXIAL_LEN], 0.011, m.antennaWire, 8);
  ac.move(0, 0, z0 - AXIAL_LEN).add(sphere(0.02, 10, 6), m.antennaWire);

  return { boresight: [0, 0, 1], spin: { axis: [0, 0, 1], rate: (5 * 2 * Math.PI) / 60 } };
}

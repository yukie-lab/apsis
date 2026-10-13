/**
 * Pioneer 10 and 11 class probe (original procedural model).
 *
 * 2.74 m dish on a flat six-sided bus with a smaller experiment bay on one side, a feed on three
 * struts with the medium-gain horn on top, two generator booms (each with two finned generators),
 * and a thin 6.6 m magnetometer boom. The spacecraft spins about the dish axis.
 *
 * Axes: +Z = dish boresight and spin axis. Generator booms at azimuth +60 and -60 degrees,
 * magnetometer boom along -X.
 */
import type { Builder, Ctx, ModelSpec } from './builder';
import { disc, extrude, lathe, plane, polar, polygon, vadd, vlerp, vnorm, vscale } from './geometry';
import type { V3 } from './geometry';
import { barrel, cable, dish, horn, louvers, rtg, starTracker, strutRing, thruster, trussBoom } from './parts';

const DEG = Math.PI / 180;

export function buildPioneer(b: Builder): ModelSpec {
  const m = b.mat;

  // -------------------------------------------------------------------------------------------
  // Bus: flat hexagon with the experiment bay on the -X side
  // -------------------------------------------------------------------------------------------
  const bus = b.assembly('bus').ctx();
  const S = 0.71;
  const AP = S * Math.cos(30 * DEG);
  const H = 0.36;
  bus.add(extrude(polygon(6, S, 30 * DEG), -H / 2, H / 2, 0.018), m.foilGold);
  bus.add(extrude([[-AP + 0.01, -0.35], [-AP + 0.01, 0.35], [-1.1, 0.26], [-1.1, -0.26]], -H / 2 + 0.02, H / 2 - 0.02, 0.018), m.foilGold, { tint: 0xf0d4a2 });
  const side = (k: number): Ctx => {
    const a = 60 * k * DEG;
    const p = polar(AP, a, 0);
    return bus.aim(p, vadd(p, polar(1, a, 0)));
  };
  const tints = [0xffffff, 0xf2d8aa, 0xfbe8c8, 0xeaca96, 0xffffff, 0xf4dcb2];
  for (let k = 0; k < 6; k++) {
    if (k !== 3) side(k).move(0, 0, 0.004).box(0.6, 0.3, 0.02, k % 2 === 0 ? m.foilGold : m.foilSilver, 0.01, tints[k]);
    const a = (30 + 60 * k) * DEG;
    bus.strut(polar(S, a, -H / 2), polar(S, a, H / 2), 0.011, m.aluminium);
  }
  side(0).move(0.12, 0, 0.03).box(0.22, 0.16, 0.05, m.aluminium, 0.008);
  side(5).move(-0.1, 0.02, 0.03).box(0.26, 0.18, 0.045, m.foilBlack, 0.012);
  // Louvers under the bus and the low-gain antenna mast (it points to -Z).
  const under = bus.move(0, 0, -H / 2).rotX(Math.PI);
  under.move(0, 0, 0.004).add(disc(S * 0.84, 6, 0, true), m.foilSilver, { uv: [3, 3] });
  for (let k = 0; k < 6; k++) louvers(under.rotZ((60 * k + 30) * DEG).move(0.36, 0, 0.008), 0.3, 0.26, 6);
  under.cyl(0.09, 0, 0.06, m.aluminium, 16);
  under.cyl(0.02, 0.06, 0.62, m.aluminium, 10);
  under.add(lathe([[0.02, 0.5], [0.075, 0.52, 1], [0.03, 0.74], [0, 0.76]], 16), m.paintWhite);
  for (let k = 0; k < 3; k++) under.strut(polar(0.3, (k * 120 + 15) * DEG, 0), [0, 0, 0.4], 0.006, m.aluminium);

  // Instruments on the experiment bay and on the bus.
  const exp = bus.face([-1, 0, 0], 1.1); // local +X = model -Y, local +Y = model +Z
  for (const [x, y] of [[-0.11, 0.07], [0.11, 0.07], [-0.11, -0.09], [0.11, -0.09]] as const) {
    barrel(exp.move(x, y, 0.0).rotX(0.25 * Math.sign(y)).rotY(0.3 * Math.sign(x)), 0.07, 0.24, m.foilBlack, 0.05);
  }
  // Imaging instrument: a small telescope on a pivot at the side of the bay.
  const ipp = bus.at([-0.86, 0.42, -0.02]);
  ipp.box(0.16, 0.16, 0.2, m.foilGold, 0.014, 0xeccc98);
  barrel(ipp.aim([0, 0.06, 0], [-0.3, 1, -0.5]), 0.05, 0.36, m.aluminium, 0.06);
  const uvp = bus.at([-0.86, -0.42, 0.0]);
  uvp.box(0.18, 0.14, 0.18, m.foilBlack, 0.014);
  barrel(uvp.aim([0, -0.05, 0], [-0.4, -1, -0.3]), 0.04, 0.16, m.aluminium);
  starTracker(bus.aim(polar(AP + 0.02, 120 * DEG, 0), polar(3, 120 * DEG, -1.6)), 0.8, m.foilGold);
  bus.at([0.25, -0.3, -H / 2 - 0.07]).box(0.24, 0.2, 0.14, m.foilGold, 0.014, 0xe6c48c);
  bus.at([-0.2, 0.3, -H / 2 - 0.06]).box(0.2, 0.2, 0.12, m.foilBlack, 0.014);

  // -------------------------------------------------------------------------------------------
  // Dish, feed tripod and medium-gain horn
  // -------------------------------------------------------------------------------------------
  const Z_DISH = H / 2 + 0.09;
  const hga = b.assembly('hga').ctx().move(0, 0, Z_DISH);
  const D = 2.74;
  const d = dish(hga, { diameter: D, fd: 1.02 / D, gores: 18, seams: 3, back: m.foilSilver, ribs: 0, seg: 60 });
  // Detector panels on the back of the dish.
  for (let k = 0; k < 12; k++) {
    const a = (15 + 30 * k) * DEG;
    const r = 1.0;
    const slope = Math.atan(r / (2 * d.focal));
    hga.rotZ(a).move(r, 0, d.z(r) - d.thickness - 0.012).rotY(-slope).box(0.42, 0.3, 0.012, m.aluminium, 0.003, k % 2 === 0 ? 0xffffff : 0xdedede);
  }
  const zf = d.focal - 0.06;
  for (let k = 0; k < 3; k++) {
    const a = (90 + 120 * k) * DEG;
    const foot = polar(1.25, a, d.z(1.25));
    hga.strut(foot, polar(0.11, a, zf + 0.02), 0.014, m.aluminium, 8);
    hga.at(foot).cyl(0.035, -0.004, 0.025, m.aluminium, 12);
  }
  // Feed: a horn that looks down at the dish, a body, and the medium-gain horn that looks up.
  const fd = hga.move(0, 0, zf);
  fd.cyl(0.115, -0.02, 0.14, m.foilGold, 24, 0.012, 0xf2d6a6);
  horn(fd.rotX(Math.PI).move(0, 0, 0.02), 0.05, 0.13, 0.2, m.paintWhite);
  horn(fd.move(0, 0, 0.14), 0.045, 0.15, 0.3, m.paintWhite);
  cable(hga, [polar(1.2, 92 * DEG, d.z(1.2) + 0.02), polar(0.7, 91 * DEG, d.z(1.2) + 0.46), polar(0.16, 90 * DEG, zf + 0.03)], 0.007, m.harness);
  // Dish support struts from the corners of the bus.
  const zBack = (r: number): number => Z_DISH + d.z(r) - d.thickness - 0.02;
  strutRing(bus, 6, S - 0.02, H / 2, 0.92, zBack(0.92), 0.013, m.aluminium, true, 30 * DEG);
  bus.add(lathe([[0.36, H / 2], [0.3, Z_DISH - 0.02, 1], [0.25, Z_DISH - 0.02]], 20), m.foilGold, { tint: 0xe6c692 });

  // Thrusters and sun sensors on the rim of the dish.
  const rimZ = d.depth;
  for (const deg of [90, 270]) {
    const p = polar(D / 2 + 0.07, deg * DEG, rimZ - 0.02);
    hga.at(p).box(0.12, 0.12, 0.1, m.foilGold, 0.014);
    thruster(hga.at(p).move(0, 0, 0.09), 0.02);
    thruster(hga.at(p).rotX(Math.PI).move(0, 0, 0.09), 0.02);
    hga.strut(polar(D / 2 - 0.1, deg * DEG, d.z(D / 2 - 0.1) - 0.03), p, 0.011, m.aluminium);
  }
  for (const deg of [0, 180]) {
    const p = polar(D / 2 + 0.07, deg * DEG, rimZ - 0.02);
    const tan = polar(1, (deg + 90) * DEG, 0);
    hga.at(p).box(0.12, 0.12, 0.1, m.foilGold, 0.014);
    thruster(hga.aim(vadd(p, vscale(tan, 0.04)), vadd(p, tan)).move(0, 0, 0.05), 0.02);
    thruster(hga.aim(vadd(p, vscale(tan, -0.04)), vadd(p, vscale(tan, -1))).move(0, 0, 0.05), 0.02);
    hga.strut(polar(D / 2 - 0.1, deg * DEG, d.z(D / 2 - 0.1) - 0.03), p, 0.011, m.aluminium);
  }
  for (const deg of [40, 220]) {
    const p = polar(D / 2 + 0.04, deg * DEG, rimZ);
    hga.at(p).box(0.07, 0.07, 0.06, m.aluminium, 0.006);
    hga.at(p).move(0, 0, 0.031).add(plane(0.04, 0.04), m.glass);
  }

  // -------------------------------------------------------------------------------------------
  // Two generator booms: three rods each, two generators in a row at the end
  // -------------------------------------------------------------------------------------------
  const gen = b.assembly('generator_booms').ctx();
  for (const deg of [60, -60]) {
    const dir = polar(1, deg * DEG, 0);
    const R0 = 2.5;
    const gc = gen.aim(vscale(dir, R0), vscale(dir, R0 + 1));
    const feet: V3[] = [polar(S, (deg + 30) * DEG, H / 2 - 0.02), polar(S, (deg - 30) * DEG, H / 2 - 0.02), polar(AP, deg * DEG, -H / 2 + 0.02)];
    const heads: V3[] = [gc.point(polar(0.09, 210 * DEG, 0)), gc.point(polar(0.09, 330 * DEG, 0)), gc.point(polar(0.09, 90 * DEG, 0))];
    for (let k = 0; k < 3; k++) gen.strut(feet[k], heads[k], 0.013, m.aluminium, 8);
    for (const f of [0.35, 0.68]) {
      const q = [0, 1, 2].map((k) => vlerp(feet[k], heads[k], f));
      for (let k = 0; k < 3; k++) gen.strut(q[k], q[(k + 1) % 3], 0.008, m.aluminium);
    }
    gc.cyl(0.13, -0.02, 0.02, m.aluminium, 20, 0.006);
    for (let k = 0; k < 2; k++) {
      rtg(gc.move(0, 0, 0.05 + 0.34 * k).rotZ(k * 0.5), {
        length: 0.28,
        coreR: 0.085,
        finR: 0.255,
        fins: 6,
        finT: 0.012,
        finSpan: 0.94,
        finTaper: 0.06,
        body: m.paintGrey,
        finMat: m.aluminium,
        finTint: 0xd6d6d2,
      });
    }
    cable(gen, [polar(AP, deg * DEG, 0), vscale(dir, 1.4), gc.point([0, 0.02, -0.05])], 0.008, m.cable);
  }

  // -------------------------------------------------------------------------------------------
  // Magnetometer boom (-X): thin lattice, sensor at 6.6 m from the axis
  // -------------------------------------------------------------------------------------------
  const mb = b.assembly('magnetometer_boom').ctx().aim([-1.1, 0, 0], [-7, 0, 0]);
  mb.move(0, 0, 0.03).box(0.16, 0.14, 0.06, m.aluminium, 0.008);
  const ML = 6.6 - 1.1 - 0.3;
  trussBoom(mb.move(0, 0, 0.06), { length: ML, width: 0.1, endWidth: 0.06, bays: 26, longeron: 0.006, batten: 0.004, diagonal: 0.003, mat: m.aluminium, phase: 90 * DEG });
  for (const f of [0.34, 0.67]) mb.move(0, 0, 0.06 + ML * f).box(0.11, 0.11, 0.035, m.aluminium, 0.006);
  const tip = mb.move(0, 0, 0.06 + ML);
  tip.box(0.1, 0.1, 0.03, m.aluminium, 0.006);
  tip.cyl(0.07, 0.03, 0.27, m.paintWhite, 20, 0.012);
  tip.cyl(0.076, 0.1, 0.13, m.foilGold, 20, 0.004);
  tip.add(lathe([[0.03, 0.27], [0.1, 0.3, 1], [0.1, 0.31]], 20), m.aluminium);
  cable(mb, [[0.03, 0.05, 0.05], [0.04, 0.045, ML * 0.5], [0.02, 0.03, ML + 0.05]], 0.005, m.cable);

  // Boresight and spin axis are the same. About 4.8 revolutions per minute.
  const axis = vnorm([0, 0, 1]);
  return { boresight: axis, spin: { axis, rate: (2 * Math.PI * 4.8) / 60 } };
}

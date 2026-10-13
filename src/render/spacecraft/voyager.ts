/**
 * Voyager class deep-space probe (original procedural model).
 *
 * Ten-sided bus, 3.66 m white dish on top, science boom with the scan platform, three
 * radioisotope generators in a row on their boom, 13 m lattice magnetometer boom and two 10 m
 * whip antennas at a right angle to each other. A plain gold disc is on one side of the bus.
 *
 * Axes: +Z = dish boresight, +X = science boom, -X = generator boom.
 */
import type { Builder, Ctx, ModelSpec } from './builder';
import { cornerRadius, disc, extrude, lathe, plane, polar, polygon, sphere, vadd, vnorm, vscale } from './geometry';
import type { V3 } from './geometry';
import { barrel, cable, cassegrain, dish, louvers, lowGain, rtg, starTracker, strutRing, thrusterPod, trussBoom, whip } from './parts';

const DEG = Math.PI / 180;

export function buildVoyager(b: Builder): ModelSpec {
  const m = b.mat;

  // -------------------------------------------------------------------------------------------
  // Bus: ten bays around a central propellant tank
  // -------------------------------------------------------------------------------------------
  const bus = b.assembly('bus').ctx();
  const AF = 1.78;
  const H = 0.47;
  const RC = cornerRadius(10, AF);
  const AP = AF / 2;
  bus.add(extrude(polygon(10, RC - 0.01, 18 * DEG), -H / 2, H / 2, 0.01), m.foilBlack);
  const side = (k: number, z = 0): Ctx => {
    const a = 36 * k * DEG;
    const p = polar(AP - 0.008, a, z);
    return bus.aim(p, vadd(p, polar(1, a, 0)));
  };
  const bayTint = [0xffffff, 0xe6e6ee, 0xf6efe6, 0xdcdce4, 0xffffff, 0xeeeef6, 0xf2ece4, 0xe2e2ea, 0xffffff, 0xf0eae2];
  for (let k = 0; k < 10; k++) {
    const a = (18 + 36 * k) * DEG;
    const an = a + 36 * DEG;
    bus.strut(polar(RC, a, -H / 2 - 0.005), polar(RC, a, H / 2 + 0.005), 0.013, m.aluminium, 8);
    bus.strut(polar(RC, a, H / 2), polar(RC, an, H / 2), 0.011, m.aluminium, 6);
    bus.strut(polar(RC, a, -H / 2), polar(RC, an, -H / 2), 0.011, m.aluminium, 6);
    side(k).move(0, 0, 0.004).box(0.53, 0.41, 0.022, m.foilBlack, 0.01, bayTint[k]);
  }
  // Louver radiators on four bays.
  for (const k of [1, 4, 6, 9]) louvers(side(k).move(0, 0, 0.016), 0.42, 0.33, 8);
  // Plain gold disc in its mount.
  const rec = side(2).move(0, 0, 0.016);
  rec.cyl(0.172, 0, 0.012, m.aluminium, 40);
  rec.cyl(0.152, 0.012, 0.024, m.goldPlate, 40, 0.004);
  rec.cyl(0.024, 0.024, 0.03, m.goldPlate, 16, 0.002);
  for (let k = 0; k < 3; k++) rec.at(polar(0.176, (90 + 120 * k) * DEG, 0.008)).box(0.03, 0.03, 0.016, m.aluminium, 0.003);
  // Connector panels and small boxes on the other bays.
  side(8).move(0.08, 0.03, 0.03).box(0.26, 0.2, 0.05, m.foilGold, 0.012);
  side(8).move(-0.16, -0.08, 0.03).box(0.1, 0.14, 0.04, m.aluminium, 0.006);
  side(3).move(0, 0, 0.03).box(0.3, 0.24, 0.045, m.foilGold, 0.012, 0xf0e0c8);
  side(7).move(0.05, 0, 0.03).box(0.34, 0.22, 0.04, m.foilSilver, 0.012);

  // Top and bottom decks, central tank and its collar.
  bus.move(0, 0, H / 2 + 0.004).add(lathe([[RC * 0.9, 0], [0.3, 0.012], [0.3, 0]], 10, { phi0: 18 * DEG }), m.foilBlack);
  bus.add(sphere(0.36, 28, 14), m.foilGold, { tint: 0xf2d8b0 });
  bus.add(lathe([[0.43, -H / 2 + 0.01], [0.43, -H / 2 - 0.06, 1], [0.39, -H / 2 - 0.06, 1], [0.39, -H / 2 + 0.01]], 28), m.aluminium);
  bus.cyl(0.07, -0.44, -0.33, m.titanium, 14);

  // Attitude thrusters: four pods at the lower corners, two at the upper corners.
  for (const deg of [54, 126, 234, 306]) {
    const p = polar(RC + 0.09, deg * DEG, -H / 2 - 0.02);
    const out = polar(1, deg * DEG, 0);
    const tan = polar(1, (deg + 90) * DEG, 0);
    bus.strut(polar(RC, deg * DEG, -H / 2), p, 0.012, m.aluminium);
    thrusterPod(bus.at(p), [[0, 0, -1], tan, vscale(tan, -1), out], 0.02, m.foilBlack);
  }
  for (const deg of [90, 270]) {
    const p = polar(RC + 0.08, deg * DEG, H / 2 + 0.03);
    bus.strut(polar(RC, deg * DEG, H / 2), p, 0.012, m.aluminium);
    thrusterPod(bus.at(p), [polar(1, (deg + 90) * DEG, 0), polar(1, (deg - 90) * DEG, 0)], 0.02, m.foilBlack);
  }

  // Star trackers on the top deck, looking out to the side.
  for (const deg of [252, 288]) {
    const p = polar(RC - 0.2, deg * DEG, H / 2 + 0.1);
    starTracker(bus.aim(p, vadd(p, polar(1, deg * DEG, 0.35))), 0.9, m.foilGold);
  }

  // Flat calibration plate and radiator below the bus, on three struts.
  const plateC: V3 = [0.5, -0.62, -0.78];
  const plate = bus.aim(plateC, vadd(plateC, vnorm([0.5, -0.3, 0.8])));
  plate.box(0.56, 0.78, 0.018, m.paintWhite, 0.004);
  plate.move(0, 0, 0.012).add(plane(0.5, 0.72), m.mirror, { uv: [2, 3] });
  for (const q of [[-0.2, 0.3], [0.2, 0.3], [0, -0.3]] as const) {
    bus.strut(plate.point([q[0], q[1], -0.01]), polar(RC - 0.1, (q[0] < 0 ? 300 : 340) * DEG + q[1] * 0.2, -H / 2), 0.011, m.carbon);
  }

  // -------------------------------------------------------------------------------------------
  // High-gain antenna and its support
  // -------------------------------------------------------------------------------------------
  const Z_DISH = 0.43;
  const hga = b.assembly('hga').ctx().move(0, 0, Z_DISH);
  const d = dish(hga, { diameter: 3.66, fd: 0.34, gores: 24, seams: 4, ribs: 20, ribDepth: 0.11, backRings: [0.34, 0.6, 0.9] });
  const feed = cassegrain(hga, d, { subDiameter: 0.62, struts: 3, strutAt: 0.6, strutR: 0.016, hornR: 0.15, hornLen: 0.34, phase: 30 * DEG });
  lowGain(hga.move(0, 0, feed.topZ), 1.1, 0.06);
  // Sun sensor that looks through the dish.
  const ss = polar(1.28, 205 * DEG, d.z(1.28));
  hga.at(ss).box(0.1, 0.1, 0.07, m.foilGold, 0.01);
  hga.at(ss).move(0, 0, 0.035).add(disc(0.03, 12), m.glass);
  // Feed cable along one strut.
  const footA = polar(d.radius * 0.6, 30 * DEG, d.z(d.radius * 0.6) + 0.02);
  cable(hga, [[0.12, 0.05, 0.04], vadd(footA, [-0.25, -0.1, -0.03]), footA, polar(0.33, 30 * DEG, feed.subZ + 0.04)], 0.008, m.harness);

  const zBack = (r: number): number => Z_DISH + d.z(r) - d.thickness - 0.045;
  strutRing(bus, 10, RC - 0.02, H / 2, 1.1, zBack(1.1), 0.014, m.carbon, true, 18 * DEG);
  strutRing(bus, 5, 0.34, H / 2, 0.62, zBack(0.62), 0.014, m.carbon, true, 18 * DEG);
  bus.add(lathe([[0.3, H / 2], [0.24, Z_DISH - 0.03, 1], [0.2, Z_DISH - 0.03]], 20), m.foilGold, { tint: 0xe8d8c0 });

  // -------------------------------------------------------------------------------------------
  // Science boom with the scan platform (+X)
  // -------------------------------------------------------------------------------------------
  const sbAsm = b.assembly('science_boom');
  const sbRoot: V3 = [AP + 0.06, 0, 0.02];
  const sb = sbAsm.ctx().aim(sbRoot, vadd(sbRoot, [1, 0, 0.07]));
  // Local axes of the boom: +Z along the boom, +Y to the dish side, +X = model +Y.
  const BOOM = 2.2;
  trussBoom(sb, { length: BOOM, width: 0.36, endWidth: 0.24, bays: 6, longeron: 0.015, batten: 0.011, diagonal: 0.008, mat: m.carbon, cross: true, phase: 90 * DEG });
  sb.move(0, 0, -0.03).box(0.44, 0.34, 0.06, m.aluminium, 0.01);
  for (let i = 0; i <= 6; i += 2) sb.move(0, 0.1 - i * 0.008, (BOOM * i) / 6).box(0.05, 0.05, 0.05, m.aluminium, 0.006);
  cable(sb, [[0.04, -0.09, 0], [0.05, -0.08, 0.7], [0.03, -0.07, 1.5], [0.0, -0.06, BOOM]], 0.012, m.harness);

  // Plasma instrument: three cups to the dish side and one to the side.
  const pls = sb.move(0, 0.28, 0.95);
  pls.box(0.2, 0.16, 0.2, m.foilBlack, 0.015);
  sb.strut([0, 0.14, 0.95], [0, 0.24, 0.95], 0.02, m.aluminium);
  for (let k = 0; k < 3; k++) {
    const a = (90 + 120 * k) * DEG;
    const cup = pls.rotX(-Math.PI / 2).rotZ(a).rotY(0.35).move(0.07, 0, 0.08);
    cup.cyl(0.075, 0, 0.07, m.goldPlate, 20, 0.006);
    cup.move(0, 0, 0.071).add(disc(0.062, 20), m.ionGrid, { uv: [2, 2] });
  }
  const sideCup = pls.rotY(Math.PI / 2).move(0, -0.02, 0.1);
  sideCup.cyl(0.07, 0, 0.07, m.goldPlate, 20, 0.006);
  sideCup.move(0, 0, 0.071).add(disc(0.058, 20), m.ionGrid, { uv: [2, 2] });

  // Cosmic ray instrument: a body with small telescopes.
  const crs = sb.move(0.02, 0.25, 1.55);
  crs.box(0.2, 0.14, 0.22, m.foilBlack, 0.014, 0xe8e8f2);
  sb.strut([0, 0.12, 1.55], [0.02, 0.2, 1.55], 0.02, m.aluminium);
  for (const q of [[-0.06, 0.6], [0.06, 0.6], [-0.06, -0.6], [0.06, -0.6]] as const) {
    barrel(crs.move(q[0], 0.07, 0).rotX(-Math.PI / 2).rotY(q[1] * 0.5), 0.032, 0.11, m.aluminium);
  }
  barrel(crs.move(0, 0.02, 0.11), 0.04, 0.1, m.aluminium);

  // Low-energy particle instrument below the boom, with its turning head.
  const lecp = sb.move(0, -0.26, 1.9);
  lecp.box(0.17, 0.16, 0.2, m.foilGold, 0.014);
  sb.strut([0, -0.1, 1.9], [0, -0.2, 1.9], 0.02, m.aluminium);
  lecp.rotX(Math.PI / 2).cyl(0.055, 0.08, 0.16, m.aluminium, 16, 0.004);
  lecp.move(0, -0.2, 0).box(0.12, 0.08, 0.12, m.foilBlack, 0.01);
  barrel(lecp.move(0, -0.2, 0.06), 0.03, 0.07, m.aluminium);

  // Scan platform: two actuators, a platform body and the remote sensing instruments.
  const spAsm = b.assembly('scan_platform', sbAsm);
  const sp0 = spAsm.ctx().mul(sb.m).move(0, 0, BOOM);
  sp0.cyl(0.085, -0.02, 0.2, m.aluminium, 20, 0.006);
  sp0.move(0, 0, 0.26).box(0.2, 0.16, 0.12, m.foilGold, 0.012);
  sp0.move(0, 0, 0.36).rotY(Math.PI / 2).cyl(0.075, -0.16, 0.16, m.aluminium, 20, 0.006);
  // Pointing frame: +Z = line of sight (model +Y), +Y = dish side, +X = back along the boom.
  const pt = sp0.move(0, 0, 0.6).rotY(Math.PI / 2);
  pt.box(0.34, 0.2, 0.42, m.foilBlack, 0.015);
  pt.move(0, 0.115, 0).box(0.5, 0.03, 0.52, m.aluminium, 0.006);
  pt.move(0, -0.115, 0).box(0.5, 0.03, 0.52, m.aluminium, 0.006);
  // Narrow-angle camera (long barrel) and wide-angle camera.
  const nac = pt.move(-0.07, 0.25, -0.34);
  nac.move(0, 0, 0.1).box(0.24, 0.22, 0.26, m.foilBlack, 0.014);
  barrel(nac.move(0, 0, 0.2), 0.105, 0.72, m.paintWhite, 0.14);
  nac.move(0, 0, 0.55).add(lathe([[0.107, -0.02], [0.117, -0.02, 1], [0.117, 0.02, 1], [0.107, 0.02]], 20), m.aluminium);
  const wac = pt.move(0.17, 0.23, -0.12);
  wac.box(0.14, 0.14, 0.2, m.foilBlack, 0.012);
  barrel(wac.move(0, 0, 0.09), 0.055, 0.3, m.paintWhite, 0.08);
  // Infrared instrument: a wide gold telescope with a secondary mirror on three struts.
  const iris = pt.move(-0.02, -0.4, -0.12);
  iris.add(lathe([[0, 0], [0.2, 0, 1], [0.27, 0.12], [0.27, 0.36, 1], [0.262, 0.36]], 32), m.foilGold, { tint: 0xf4e2c0 });
  iris.add(lathe([[0.262, 0.36], [0.262, 0.2], [0.18, 0.1], [0, 0.07]], 32), m.goldPlate);
  iris.cyl(0.07, 0.3, 0.33, m.paintBlack, 16);
  for (let k = 0; k < 3; k++) {
    const a = (30 + 120 * k) * DEG;
    iris.strut(polar(0.262, a, 0.35), polar(0.06, a, 0.315), 0.007, m.paintBlack);
  }
  iris.move(0, 0, -0.1).box(0.26, 0.24, 0.2, m.foilBlack, 0.014);
  // Ultraviolet instrument (box with a rectangular shade) and a small photometer.
  const uvs = pt.move(0.24, -0.26, 0.02);
  uvs.box(0.13, 0.15, 0.46, m.foilGold, 0.012, 0xe8d0b0);
  uvs.move(0, 0, 0.28).box(0.11, 0.13, 0.12, m.paintBlack, 0.004);
  uvs.move(0, 0, 0.342).add(plane(0.085, 0.105), m.glass);
  const pps = pt.move(-0.24, 0.02, 0.1);
  pps.box(0.11, 0.11, 0.16, m.foilBlack, 0.01);
  barrel(pps.move(0, 0, 0.07), 0.045, 0.22, m.aluminium, 0.05);

  // -------------------------------------------------------------------------------------------
  // Generator boom (-X, canted to -Z)
  // -------------------------------------------------------------------------------------------
  const rb = b.assembly('generator_boom').ctx();
  const rRoot: V3 = [-(AP + 0.02), 0, -0.04];
  const rDir = vnorm([-0.92, 0, -0.39]);
  const rc = rb.aim(rRoot, vadd(rRoot, rDir));
  const S0 = 1.2;
  for (const [deg, zc] of [[162, 1], [198, 1], [162, -1], [198, -1]] as const) {
    const from = polar(RC, deg * DEG, (zc * H) / 2);
    const ringA = (zc > 0 ? 90 : 270) + (deg < 180 ? -42 : 42) * zc;
    rb.strut(from, rc.point(polar(0.15, ringA * DEG, S0)), 0.017, m.carbon, 8);
    rb.strut(from, rc.point(polar(0.1, (ringA + 180) * DEG, S0 * 0.52)), 0.011, m.carbon);
  }
  rc.move(0, 0, S0 * 0.52).box(0.24, 0.24, 0.03, m.aluminium, 0.006);
  rc.cyl(0.19, S0 - 0.03, S0 + 0.02, m.aluminium, 24, 0.006);
  rc.cyl(0.075, S0 * 0.52, S0, m.titanium, 14);
  let s = S0 + 0.06;
  for (let k = 0; k < 3; k++) {
    rtg(rc.move(0, 0, s).rotZ(k * 0.3), { length: 0.46, coreR: 0.132, finR: 0.203, fins: 6, finT: 0.009, finSpan: 0.9 });
    if (k < 2) rc.cyl(0.085, s + 0.46 + 0.02, s + 0.56 - 0.02, m.aluminium, 16);
    s += 0.56;
  }
  cable(rb, [polar(RC - 0.05, 180 * DEG, -0.1), rc.point([0.06, 0.05, 0.45]), rc.point([0.1, 0.12, S0 - 0.05]), rc.point([0.0, 0.22, S0 + 0.25])], 0.012, m.cable);

  // -------------------------------------------------------------------------------------------
  // Magnetometer boom: 13 m lattice mast from a canister
  // -------------------------------------------------------------------------------------------
  const mbAsm = b.assembly('magnetometer_boom');
  const mRoot: V3 = [-0.86, 0.36, 0.0];
  const mDir = vnorm([-0.93, 0.13, 0.34]);
  const mb = mbAsm.ctx().aim(mRoot, vadd(mRoot, mDir));
  mb.cyl(0.135, 0, 0.62, m.foilSilver, 24, 0.012);
  mb.cyl(0.15, 0.6, 0.66, m.aluminium, 24, 0.004);
  mb.cyl(0.15, -0.02, 0.02, m.aluminium, 24, 0.004);
  const mbFree = mbAsm.ctx();
  mbFree.strut(polar(RC, 162 * DEG, H / 2), mb.point([0.08, 0.1, 0.5]), 0.013, m.carbon);
  mbFree.strut(polar(RC, 126 * DEG, H / 2), mb.point([-0.08, 0.1, 0.45]), 0.013, m.carbon);
  mbFree.strut(polar(RC, 162 * DEG, -H / 2), mb.point([0.05, -0.12, 0.3]), 0.013, m.carbon);
  mbFree.strut(polar(RC, 126 * DEG, -H / 2), mb.point([-0.05, -0.12, 0.08]), 0.013, m.carbon);
  const MAST0 = 0.64;
  const MAST = 13.0 - 0.95;
  trussBoom(mb.move(0, 0, MAST0), { length: MAST, width: 0.2, bays: 54, longeron: 0.0065, batten: 0.0045, diagonal: 0.0028, mat: m.fibre, cross: true });
  for (const f of [0.52, 1]) {
    const q = mb.move(0, 0, MAST0 + MAST * f);
    q.box(0.24, 0.24, 0.012, m.aluminium, 0.003);
    q.move(0, 0, 0.07).box(0.1, 0.1, 0.13, m.foilGold, 0.012, 0xf0dcc0);
    q.move(0, 0, 0.07).rotX(Math.PI / 2).cyl(0.035, -0.09, 0.09, m.paintWhite, 14, 0.004);
  }
  for (const f of [0.03, 0.1]) {
    const q = mb.move(0.02, 0.0, MAST0 + MAST * f);
    q.box(0.09, 0.09, 0.12, m.foilBlack, 0.01);
  }

  // -------------------------------------------------------------------------------------------
  // Two 10 m whip antennas at a right angle to each other
  // -------------------------------------------------------------------------------------------
  const wa = b.assembly('whip_antennas').ctx();
  const wBase: V3 = [-0.62, 0, -0.3];
  wa.at(wBase).box(0.2, 0.3, 0.12, m.foilBlack, 0.014);
  wa.strut([-0.5, 0.12, -H / 2], vadd(wBase, [0, 0.1, 0.05]), 0.012, m.aluminium);
  wa.strut([-0.5, -0.12, -H / 2], vadd(wBase, [0, -0.1, 0.05]), 0.012, m.aluminium);
  for (const sy of [1, -1]) {
    const dir = vnorm([-0.37, 0.707 * sy, -0.6]);
    const p = vadd(wBase, [-0.04, 0.12 * sy, -0.04]);
    whip(wa.aim(p, vadd(p, dir)), 10, 0.009);
  }

  // Lower deck blanket and two small units on the upper deck.
  bus.move(0, 0, -H / 2 - 0.004).add(lathe([[0.3, 0], [RC * 0.9, 0]], 10, { phi0: 18 * DEG }), m.foilBlack);
  bus.at([0.2, 0.55, H / 2 + 0.05]).box(0.22, 0.16, 0.08, m.foilGold, 0.012, 0xe4c8a0);
  bus.at([-0.3, -0.5, H / 2 + 0.045]).cyl(0.07, -0.04, 0.05, m.foilSilver, 16, 0.006);

  return { boresight: [0, 0, 1], spin: null };
}

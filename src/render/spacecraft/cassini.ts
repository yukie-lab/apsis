/**
 * Cassini class Saturn orbiter (original procedural model).
 *
 * Tall stack about 6.8 m high: 4 m white dish at the top, twelve-sided electronics bus, gold
 * blanket body, lower equipment ring with three radioisotope generators and two main engines.
 * A 2.7 m cone probe is on one side, an 11 m lattice magnetometer boom on another, and three
 * thin plasma-wave antennas.
 *
 * Axes: +Z = dish boresight (top of the stack), -X = probe, +Y = magnetometer boom.
 */
import type { Builder, Ctx, ModelSpec } from './builder';
import { cornerRadius, disc, extrude, lathe, plane, polar, polygon, sphere, vadd, vnorm } from './geometry';
import type { V3 } from './geometry';
import { barrel, cable, cassegrain, dish, louvers, lowGain, nozzle, quilt, rtg, starTracker, strutRing, thrusterPod, trussBoom, whip } from './parts';

const DEG = Math.PI / 180;

export function buildCassini(b: Builder): ModelSpec {
  const m = b.mat;

  // -------------------------------------------------------------------------------------------
  // Central body: propulsion module shell, upper shell and lower equipment ring
  // -------------------------------------------------------------------------------------------
  const core = b.assembly('body').ctx();
  const RB = 0.86;
  core.add(lathe([[1.2, -2.24], [1.2, -2.12, 1], [RB, -1.5, 1], [RB, -0.42]], 44), m.foilGold, { tint: 0xf0d2a4 });
  core.add(lathe([[RB, -0.42], [RB, 0.72, 1], [0.97, 1.2]], 44), m.foilGold);
  core.add(lathe([[0, -2.24], [1.2, -2.24]], 44, { planarUv: true }), m.foilBlack);
  for (const z of [-1.5, -0.42, 0.72]) {
    core.add(lathe([[RB + 0.002, z - 0.03], [RB + 0.02, z - 0.03, 1], [RB + 0.02, z + 0.03, 1], [RB + 0.002, z + 0.03]], 44), m.aluminium);
  }
  core.add(lathe([[1.2, -2.26], [1.235, -2.26, 1], [1.235, -2.1, 1], [1.2, -2.1]], 44), m.aluminium);
  // Blanket panels with different tones break the large gold surface.
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    const p = polar(RB + 0.004, a, k % 2 === 0 ? -0.95 : 0.15);
    const tint = [0xffffff, 0xf2d6a8, 0xfbe6c4, 0xe8c896][k % 4];
    core.aim(p, vadd(p, polar(1, a, 0))).box(0.52, k % 2 === 0 ? 0.9 : 0.7, 0.02, m.foilGold, 0.01, tint);
  }
  // Pipes and harness along the body.
  cable(core, [polar(RB + 0.03, 200 * DEG, -1.45), polar(RB + 0.04, 203 * DEG, -0.5), polar(RB + 0.03, 198 * DEG, 0.6), polar(RB + 0.1, 200 * DEG, 1.15)], 0.016, m.harness);
  cable(core, [polar(RB + 0.03, 340 * DEG, -1.45), polar(RB + 0.04, 338 * DEG, -0.3), polar(RB + 0.05, 342 * DEG, 0.7), polar(RB + 0.11, 340 * DEG, 1.15)], 0.013, m.cable);
  core.strut(polar(RB + 0.03, 70 * DEG, -1.4), polar(RB + 0.03, 70 * DEG, 0.65), 0.012, m.aluminium);
  core.strut(polar(RB + 0.03, 110 * DEG, -1.4), polar(RB + 0.03, 110 * DEG, 0.65), 0.012, m.aluminium);

  // Pressure tanks on the sides of the body.
  const he = core.at([0.35, 1.2, -1.0]);
  he.add(sphere(0.38, 24, 12), m.foilGold, { tint: 0xe6c08c });
  core.strut([0.3, 0.8, -0.75], [0.35, 1.1, -0.75], 0.02, m.aluminium);
  core.strut([0.3, 0.8, -1.25], [0.35, 1.1, -1.25], 0.02, m.aluminium);
  const hz = core.at([0.3, -1.18, -1.15]);
  hz.add(sphere(0.33, 24, 12), m.foilBlack);
  core.strut([0.25, -0.8, -0.95], [0.3, -1.05, -0.95], 0.02, m.aluminium);
  core.strut([0.25, -0.8, -1.35], [0.3, -1.05, -1.35], 0.02, m.aluminium);

  // -------------------------------------------------------------------------------------------
  // Upper equipment module: twelve electronics bays
  // -------------------------------------------------------------------------------------------
  const AF = 1.96;
  const RC = cornerRadius(12, AF);
  const Z0 = 1.2;
  const Z1 = 1.68;
  core.add(extrude(polygon(12, RC - 0.01, 15 * DEG), Z0, Z1, 0.012), m.foilBlack);
  const bay = (k: number): Ctx => {
    const a = 30 * k * DEG;
    const p = polar(AF / 2 - 0.008, a, (Z0 + Z1) / 2);
    return core.aim(p, vadd(p, polar(1, a, 0)));
  };
  const bayTint = [0xffffff, 0xe4e4ee, 0xf4eee4, 0xdadae4];
  for (let k = 0; k < 12; k++) {
    const a = (15 + 30 * k) * DEG;
    core.strut(polar(RC, a, Z0), polar(RC, a, Z1), 0.012, m.aluminium, 8);
    core.strut(polar(RC, a, Z1), polar(RC, a + 30 * DEG, Z1), 0.011, m.aluminium);
    core.strut(polar(RC, a, Z0), polar(RC, a + 30 * DEG, Z0), 0.011, m.aluminium);
    bay(k).move(0, 0, 0.004).box(0.45, 0.4, 0.022, k % 5 === 2 ? m.foilGold : m.foilBlack, 0.01, bayTint[k % 4]);
  }
  for (const k of [1, 4, 7, 10]) louvers(bay(k).move(0, 0, 0.017), 0.36, 0.3, 7);
  core.add(lathe([[RC * 0.94, Z1 + 0.004], [0.5, Z1 + 0.02], [0.5, Z1]], 12, { phi0: 15 * DEG, planarUv: true }), m.foilBlack);
  core.add(lathe([[0.97, Z0], [RC * 0.94, Z0 - 0.004]], 12, { phi0: 15 * DEG, planarUv: true }), m.foilBlack);

  // -------------------------------------------------------------------------------------------
  // High-gain antenna
  // -------------------------------------------------------------------------------------------
  const Z_DISH = 1.87;
  const hga = b.assembly('hga').ctx().move(0, 0, Z_DISH);
  const d = dish(hga, { diameter: 4.0, fd: 0.37, gores: 32, seams: 5, ribs: 24, ribDepth: 0.12, backRings: [0.3, 0.62, 0.92] });
  const feed = cassegrain(hga, d, { subDiameter: 0.56, struts: 4, strutAt: 0.55, strutR: 0.017, hornR: 0.17, hornLen: 0.36, phase: 45 * DEG });
  lowGain(hga.move(0, 0, feed.topZ), 1.1, 0.05);
  // Small feed horns near the vertex.
  for (const a of [20, 110, 200, 290]) {
    const p = polar(0.36, a * DEG, d.z(0.36));
    hga.at(p).cyl(0.045, 0, 0.09, m.paintWhite, 12);
    hga.at(p).move(0, 0, 0.091).add(disc(0.036, 12), m.paintBlack);
  }
  const zBack = (r: number): number => Z_DISH + d.z(r) - d.thickness - 0.05;
  strutRing(core, 12, RC - 0.03, Z1, 1.24, zBack(1.24), 0.015, m.carbon, true, 15 * DEG);
  core.add(lathe([[0.5, Z1], [0.5, Z_DISH - 0.04, 1], [0.44, Z_DISH - 0.04]], 24), m.foilGold, { tint: 0xe8d2b0 });
  core.at([0.62, 0.3, Z1 + 0.07]).box(0.3, 0.42, 0.12, m.foilGold, 0.014, 0xf4dcb0);
  core.at([-0.55, -0.42, Z1 + 0.06]).box(0.34, 0.3, 0.1, m.foilBlack, 0.014);

  // -------------------------------------------------------------------------------------------
  // Cone probe on the -X side
  // -------------------------------------------------------------------------------------------
  const probeAsm = b.assembly('probe');
  const pr = probeAsm.ctx().aim([-RB, 0, -0.3], [-3, 0, -0.3]);
  pr.add(lathe([[0.62, -0.02], [0.62, 0.2, 1], [0.56, 0.2]], 32), m.aluminium);
  strutRing(pr, 6, 0.6, 0.02, 0.8, 0.36, 0.016, m.carbon);
  pr.add(
    lathe(
      [
        [0, 0.16], [0.5, 0.18], [0.76, 0.3], [1.0, 0.52], [1.3, 0.62], [1.35, 0.66, 1], [1.35, 0.7, 1],
        [1.2, 0.79], [0.9, 0.96], [0.6, 1.13], [0.36, 1.25], [0.16, 1.31], [0, 1.33],
      ],
      56,
      { planarUv: true },
    ),
    m.foilGold,
    { tint: 0xf6dcae },
  );
  for (const r of [0.45, 0.9]) {
    const z = 0.7 + ((1.35 - r) * (1.25 - 0.7)) / (1.35 - 0.36);
    pr.add(lathe([[r + 0.012, z - 0.01], [r, z + 0.012, 1], [r - 0.012, z + 0.016]], 56), m.foilAmber);
  }
  pr.add(lathe([[1.352, 0.655], [1.372, 0.655, 1], [1.372, 0.705, 1], [1.352, 0.705]], 56), m.aluminium);
  pr.move(0.5, 0.2, 0.33).box(0.22, 0.16, 0.1, m.foilAmber, 0.014);

  // -------------------------------------------------------------------------------------------
  // Lower equipment ring: generators, engines, thruster booms, reaction wheels
  // -------------------------------------------------------------------------------------------
  const low = b.assembly('lower').ctx();
  for (const deg of [0, 120, 240]) {
    const top = polar(1.56, deg * DEG, -1.92);
    const g = low.aim(top, vadd(top, [0, 0, -1]), polar(1, deg * DEG, 0));
    rtg(g, { length: 1.1, coreR: 0.11, finR: 0.21, fins: 8, finT: 0.007, tubes: true, finSpan: 0.9 });
    low.strut(polar(1.2, (deg - 12) * DEG, -2.0), vadd(top, [0, 0, 0.03]), 0.02, m.titanium, 8);
    low.strut(polar(1.2, (deg + 12) * DEG, -2.0), vadd(top, [0, 0, 0.03]), 0.02, m.titanium, 8);
    low.strut(polar(0.95, deg * DEG, -1.65), vadd(top, [0, 0, 0.05]), 0.018, m.titanium, 8);
    low.at(vadd(top, [0, 0, 0.05])).box(0.2, 0.2, 0.06, m.aluminium, 0.01);
    // Heat shade between the generator and the body.
    const sh = polar(1.3, deg * DEG, -2.55);
    low.aim(sh, vadd(sh, polar(1, deg * DEG, 0))).box(0.5, 0.95, 0.015, m.foilGold, 0.006, 0xf0d0a0);
    low.strut(polar(1.2, deg * DEG, -2.2), vadd(sh, [0, 0, 0.2]), 0.012, m.aluminium);
  }
  // Two main engines side by side.
  for (const sx of [-1, 1]) {
    const e = low.aim([0.31 * sx, 0, -2.2], [0.31 * sx, 0, -3.2]);
    nozzle(e, { exitR: 0.27, length: 0.62, throatR: 0.04, chamberR: 0.07, chamberLen: 0.16, seg: 32 });
    for (let k = 0; k < 3; k++) {
      const a = (90 + 120 * k) * DEG;
      low.strut([0.31 * sx + 0.24 * Math.cos(a), 0.24 * Math.sin(a), -2.24], [0.31 * sx + 0.08 * Math.cos(a), 0.08 * Math.sin(a), -2.4], 0.012, m.titanium);
    }
  }
  low.add(lathe([[0.7, -2.24], [0.74, -2.24, 1], [0.74, -2.34, 1], [0.7, -2.34]], 32), m.aluminium);
  // Four thruster booms.
  for (const deg of [50, 130, 230, 310]) {
    const tip = polar(2.0, deg * DEG, -2.12);
    low.strut(polar(1.2, (deg - 9) * DEG, -2.14), tip, 0.02, m.carbon, 8);
    low.strut(polar(1.2, (deg + 9) * DEG, -2.14), tip, 0.02, m.carbon, 8);
    low.strut(polar(1.0, deg * DEG, -1.75), tip, 0.016, m.carbon);
    const out = polar(1, deg * DEG, 0);
    const tan = polar(1, (deg + 90) * DEG, 0);
    thrusterPod(low.at(tip), [[0, 0, -1], [0, 0, 1], tan, [-tan[0], -tan[1], 0], out], 0.022);
  }
  // Reaction wheels and boxes around the ring.
  for (const deg of [70, 190, 290]) {
    const p = polar(1.02, deg * DEG, -1.86);
    low.aim(p, vadd(p, polar(0.6, deg * DEG, 0.8))).cyl(0.2, -0.02, 0.16, m.foilGold, 24, 0.02, 0xf0d6ac);
  }
  for (const deg of [20, 160, 260, 330]) {
    const p = polar(1.1, deg * DEG, -1.82);
    low.aim(p, vadd(p, polar(0.5, deg * DEG, 0.85))).box(0.3, 0.22, 0.16, m.foilBlack, 0.016);
  }

  // -------------------------------------------------------------------------------------------
  // Remote sensing pallet (-Y) and particle instruments (+X)
  // -------------------------------------------------------------------------------------------
  const sci = b.assembly('instruments').ctx();
  // Pallet frame: local +Z = line of sight (-Y), local +Y = up.
  const rs = sci.aim([0, -1.0, 1.02], [0, -3, 1.02]);
  rs.move(0, 0, 0.1).box(1.3, 0.9, 0.05, m.aluminium, 0.01);
  rs.move(0, 0, 0.06).box(1.2, 0.8, 0.04, m.foilGold, 0.012);
  quilt(rs.move(0, 0, 0.128), 1.26, 0.86, { cols: 4, rows: 3, mat: m.foilBlack, tints: [0xffffff, 0xe2e2ec, 0xd4d4de], thickness: 0.016, buttons: true, seed: 9 });
  sci.strut([0.45, -0.85, 0.9], [0.45, -1.08, 0.8], 0.02, m.aluminium);
  sci.strut([-0.45, -0.85, 0.9], [-0.45, -1.08, 0.8], 0.02, m.aluminium);
  sci.strut([0, -0.95, 1.25], [0, -1.08, 1.3], 0.02, m.aluminium);
  // Narrow-angle and wide-angle cameras.
  const nac = rs.move(-0.36, 0.2, 0.13);
  nac.move(0, 0, 0.12).box(0.26, 0.26, 0.24, m.foilBlack, 0.014);
  barrel(nac.move(0, 0, 0.22), 0.11, 0.7, m.paintWhite, 0.12);
  const wac = rs.move(-0.36, -0.2, 0.13);
  wac.move(0, 0, 0.1).box(0.2, 0.2, 0.2, m.foilBlack, 0.012);
  barrel(wac.move(0, 0, 0.18), 0.07, 0.34, m.paintWhite, 0.07);
  // Infrared telescope with its radiator plate.
  const cirs = rs.move(0.3, 0.14, 0.13);
  cirs.add(lathe([[0, 0], [0.22, 0, 1], [0.28, 0.1], [0.28, 0.42, 1], [0.27, 0.42]], 32), m.foilGold, { tint: 0xf6e0b8 });
  cirs.add(lathe([[0.27, 0.42], [0.27, 0.2], [0.18, 0.1], [0, 0.08]], 32), m.goldPlate);
  cirs.cyl(0.075, 0.34, 0.37, m.paintBlack, 16);
  for (let k = 0; k < 3; k++) cirs.strut(polar(0.27, (90 + 120 * k) * DEG, 0.41), polar(0.065, (90 + 120 * k) * DEG, 0.355), 0.007, m.paintBlack);
  rs.move(0.3, 0.52, 0.34).box(0.7, 0.02, 0.5, m.paintWhite, 0.004);
  rs.move(0.3, 0.535, 0.34).rotX(-Math.PI / 2).add(plane(0.66, 0.46), m.mirror, { uv: [3, 2] });
  // Mapping spectrometer and ultraviolet instrument.
  const vims = rs.move(0.05, -0.26, 0.13);
  vims.move(0, 0, 0.16).box(0.3, 0.24, 0.32, m.foilGold, 0.014, 0xe6c898);
  vims.move(0, 0, 0.36).box(0.2, 0.14, 0.1, m.paintBlack, 0.004);
  vims.move(0, 0, 0.412).add(plane(0.16, 0.1), m.glass);
  vims.move(0.2, -0.02, 0.2).rotY(Math.PI / 2).cyl(0.14, 0, 0.02, m.paintWhite, 20);
  const uvis = rs.move(0.46, -0.26, 0.13);
  uvis.move(0, 0, 0.24).box(0.18, 0.2, 0.48, m.foilBlack, 0.012);
  uvis.move(0, 0, 0.482).add(plane(0.12, 0.14), m.glass);
  // Star trackers above the pallet.
  starTracker(sci.aim([0.62, -0.85, 1.5], [1.4, -2, 2.2]), 0.9, m.foilGold);
  starTracker(sci.aim([-0.62, -0.85, 1.5], [-1.4, -2, 2.2]), 0.9, m.foilGold);

  // Particle instruments on the +X side.
  const fp = sci.aim([1.0, 0, 1.0], [3, 0, 1.0]);
  fp.move(0, 0, 0.08).box(0.9, 0.7, 0.05, m.aluminium, 0.01);
  quilt(fp.move(0, 0, 0.108), 0.86, 0.66, { cols: 3, rows: 2, thickness: 0.016, buttons: true, seed: 14 });
  sci.strut([0.85, 0.35, 0.85], [1.06, 0.35, 0.75], 0.018, m.aluminium);
  sci.strut([0.85, -0.35, 0.85], [1.06, -0.35, 0.75], 0.018, m.aluminium);
  fp.move(-0.25, 0.14, 0.24).box(0.3, 0.32, 0.28, m.foilGold, 0.014);
  fp.move(-0.25, 0.14, 0.4).rotX(Math.PI / 2).cyl(0.11, -0.12, 0.12, m.aluminium, 20, 0.006);
  fp.move(0.2, 0.16, 0.2).box(0.24, 0.22, 0.2, m.foilBlack, 0.014);
  barrel(fp.move(0.2, 0.16, 0.3), 0.05, 0.2, m.aluminium);
  fp.move(0.12, -0.2, 0.18).box(0.34, 0.2, 0.16, m.foilGold, 0.014, 0xe2c494);
  barrel(fp.move(-0.2, -0.2, 0.1).rotX(0.5), 0.07, 0.16, m.aluminium);
  // Dust instrument: a bucket on a turntable.
  const cda = sci.aim([0.75, -0.72, 0.55], [1.6, -1.6, 0.2]);
  cda.cyl(0.1, -0.2, 0.06, m.aluminium, 16);
  cda.add(lathe([[0, 0.06], [0.2, 0.06, 1], [0.2, 0.4, 1], [0.19, 0.4]], 28), m.foilGold, { tint: 0xf0d4a4 });
  cda.add(lathe([[0.19, 0.4], [0.19, 0.12, 1], [0, 0.12]], 28), m.goldPlate);

  // -------------------------------------------------------------------------------------------
  // Magnetometer boom (+Y): 11 m lattice mast
  // -------------------------------------------------------------------------------------------
  const mb = b.assembly('magnetometer_boom').ctx().aim([0, AF / 2, 1.44], [0, 12, 1.44]);
  mb.cyl(0.15, 0.0, 0.5, m.foilSilver, 24, 0.012);
  mb.cyl(0.165, 0.48, 0.53, m.aluminium, 24, 0.004);
  const MAST = 11.0 - AF / 2 - 0.55;
  trussBoom(mb.move(0, 0, 0.52), { length: MAST, width: 0.22, bays: 44, longeron: 0.007, batten: 0.005, diagonal: 0.003, mat: m.fibre, cross: true, phase: 90 * DEG });
  for (const f of [0.5, 1]) {
    const q = mb.move(0, 0, 0.52 + MAST * f);
    q.box(0.26, 0.26, 0.012, m.aluminium, 0.003);
    q.move(0, 0, 0.08).box(0.12, 0.12, 0.14, m.foilGold, 0.012, 0xf0dcc0);
    q.move(0, 0, 0.08).rotY(Math.PI / 2).cyl(0.04, -0.1, 0.1, m.paintWhite, 14, 0.004);
  }

  // -------------------------------------------------------------------------------------------
  // Three 10 m plasma-wave antennas
  // -------------------------------------------------------------------------------------------
  const pw = b.assembly('wave_antennas').ctx();
  const pwBase: V3 = [0.78, -0.86, 0.7];
  pw.at(pwBase).box(0.3, 0.3, 0.3, m.foilGold, 0.02, 0xe8cc9c);
  pw.strut([0.6, -0.6, 0.6], pwBase, 0.025, m.aluminium);
  pw.strut([0.55, -0.66, 0.9], pwBase, 0.02, m.aluminium);
  for (const dir of [[0.62, -0.38, 0.68], [0.62, -0.38, -0.68], [-0.25, -0.95, -0.15]] as const) {
    const u = vnorm(dir);
    const p = vadd(pwBase, [u[0] * 0.14, u[1] * 0.14, u[2] * 0.14]);
    whip(pw.aim(p, vadd(p, u)), 10, 0.009);
  }

  return { boresight: [0, 0, 1], spin: null };
}

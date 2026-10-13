/**
 * Galileo class Jupiter orbiter (original procedural model).
 *
 * Spun section: 4.8 m gold mesh umbrella dish (shown open) on a central tower, sun shades, an
 * eight-sided electronics bus, propellant tanks, two thruster booms, two generator booms and the
 * science boom that continues as an 11 m lattice magnetometer boom.
 * Despun section below: scan platform, relay dish and the cone atmospheric probe at the base.
 *
 * Axes: +Z = dish boresight (top). The model is a dual-spin spacecraft: the group
 * "galileo/spun" can turn about +Z while the group "galileo/despun" stays fixed.
 */
import type { Builder, Ctx, ModelSpec } from './builder';
import { cornerRadius, extrude, lathe, parabola, plane, polar, polygon, ring, sphere, vadd, vnorm, vscale } from './geometry';
import type { P2, V3 } from './geometry';
import { barrel, cable, dish, lowGain, nozzle, rtg, strutRing, thrusterPod, trussBoom, whip } from './parts';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export function buildGalileo(b: Builder): ModelSpec {
  const m = b.mat;
  const spunAsm = b.assembly('spun');
  const sp = spunAsm.ctx();

  // -------------------------------------------------------------------------------------------
  // Mesh umbrella antenna on its tower
  // -------------------------------------------------------------------------------------------
  const ZH = 0.78;
  const R = 2.4;
  const F = 1.75;
  const zr = (r: number): number => (r * r) / (4 * F);
  const RIBS = 18;
  const hga = b.assembly('hga', spunAsm).ctx().move(0, 0, ZH);
  hga.add(lathe(parabola(0.22, R, F, 10), RIBS, { unitUv: true }), m.meshGold, { uv: [54, 9] });
  const outline: P2[] = [];
  const NR = 10;
  for (let k = 0; k <= NR; k++) {
    const r = 0.2 + ((R - 0.2) * k) / NR;
    outline.push([r, zr(r) - (0.06 - 0.035 * (k / NR))]);
  }
  for (let k = NR; k >= 0; k--) {
    const r = 0.2 + ((R - 0.2) * k) / NR;
    outline.push([r, zr(r) + 0.006]);
  }
  const rib = extrude(outline, -0.008, 0.008);
  for (let k = 0; k < RIBS; k++) {
    const a = (TAU * k) / RIBS;
    hga.rotZ(a).rotX(Math.PI / 2).inst('umbrellaRib', rib, m.carbon);
    hga.strut(polar(R, a, zr(R)), polar(R, a + TAU / RIBS, zr(R)), 0.007, m.goldPlate, 5);
    hga.strut(polar(R * 0.5, a, zr(R * 0.5)), polar(R * 0.5, a + TAU / RIBS, zr(R * 0.5)), 0.004, m.goldPlate, 4, false);
  }
  hga.add(lathe([[0, -0.16], [0.2, -0.16, 1], [0.26, -0.08], [0.26, 0.06, 1], [0.1, 0.12], [0.1, 0.1]], 24), m.aluminium);
  hga.add(lathe([[0.1, 0.1], [0.085, 1.5]], 16), m.foilGold, { tint: 0xe6c690 });
  for (let k = 0; k < 4; k++) {
    const z = 0.3 + 0.32 * k;
    hga.add(lathe([[0.087, z], [0.105, z, 1], [0.105, z + 0.03, 1], [0.087, z + 0.03]], 16), m.aluminium);
  }
  // Subreflector under the tip shade, on three thin struts.
  hga.add(lathe([[0, 1.14], [0.14, 1.17], [0.26, 1.24], [0.3, 1.3, 1], [0.3, 1.32, 1], [0.1, 1.42]], 28), m.paintWhite);
  for (let k = 0; k < 3; k++) {
    const a = (30 + 120 * k) * DEG;
    hga.strut(polar(0.25, a, 0.06), polar(0.29, a, 1.3), 0.008, m.aluminium);
  }
  hga.add(lathe([[0, 1.5], [0.42, 1.5, 1], [0.42, 1.525, 1], [0, 1.53]], 28, { planarUv: true }), m.foilBlack);
  hga.move(0, 0, 1.498).add(ring(0.085, 0.42, 28, 0, false), m.foilSilver, { uv: [2, 2] });
  lowGain(hga.move(0, 0, 1.53), 1.2, 0.08);

  // -------------------------------------------------------------------------------------------
  // Bus shade, eight-sided bus, propulsion module (all in the spun section)
  // -------------------------------------------------------------------------------------------
  const RS = 1.32;
  sp.add(lathe([[RS, 0.6], [0.28, 0.66]], 36, { planarUv: true }), m.foilBlack);
  sp.add(lathe([[0.28, 0.63], [RS, 0.585]], 36, { planarUv: true }), m.foilSilver);
  sp.add(lathe([[RS - 0.004, 0.58], [RS + 0.016, 0.58, 1], [RS + 0.016, 0.605, 1], [RS - 0.004, 0.605]], 36), m.aluminium);
  for (let k = 0; k < 12; k++) {
    const a = (TAU * k) / 12;
    sp.strut(polar(0.3, a, 0.615), polar(RS, a, 0.578), 0.012, m.aluminium);
  }
  sp.add(lathe([[0.3, 0.5], [0.26, ZH - 0.15]], 20), m.foilBlack);

  const AF = 1.46;
  const RC = cornerRadius(8, AF);
  sp.add(extrude(polygon(8, RC - 0.01, 22.5 * DEG), 0, 0.5, 0.012), m.foilBlack);
  const bay = (k: number, z = 0.25): Ctx => {
    const a = 45 * k * DEG;
    const p = polar(AF / 2 - 0.008, a, z);
    return sp.aim(p, vadd(p, polar(1, a, 0)));
  };
  const bayTint = [0xffffff, 0xe2e2ec, 0xf4eee6, 0xd8d8e2];
  for (let k = 0; k < 8; k++) {
    const a = (22.5 + 45 * k) * DEG;
    sp.strut(polar(RC, a, 0), polar(RC, a, 0.5), 0.012, m.aluminium, 8);
    sp.strut(polar(RC, a, 0.5), polar(RC, a + 45 * DEG, 0.5), 0.011, m.aluminium);
    sp.strut(polar(RC, a, 0), polar(RC, a + 45 * DEG, 0), 0.011, m.aluminium);
    bay(k).move(0, 0, 0.004).box(0.52, 0.43, 0.022, k === 3 ? m.foilGold : m.foilBlack, 0.01, bayTint[k % 4]);
  }
  bay(1).move(0, 0, 0.02).box(0.3, 0.24, 0.04, m.foilSilver, 0.012);
  bay(5).move(0.05, 0, 0.02).box(0.26, 0.3, 0.04, m.foilGold, 0.012, 0xe8c890);
  bay(7).move(0, 0, 0.02).box(0.34, 0.2, 0.035, m.aluminium, 0.006);

  // Propulsion module: four propellant tanks, two pressure tanks, frame.
  sp.cyl(0.3, -0.86, 0.0, m.foilBlack, 24, 0, 0xd8d8e0);
  for (let k = 0; k < 4; k++) {
    const a = (45 + 90 * k) * DEG;
    sp.at(polar(0.55, a, -0.4)).add(sphere(0.34, 24, 12), m.foilBlack, { tint: k % 2 === 0 ? 0xffffff : 0xe6e0d6 });
    sp.at(polar(0.55, a, -0.4)).add(lathe([[0.342, -0.025], [0.356, -0.025, 1], [0.356, 0.025, 1], [0.342, 0.025]], 24), m.aluminium);
    sp.strut(polar(RC - 0.05, a + 45 * DEG, 0), polar(0.86, a + 45 * DEG, -0.78), 0.016, m.aluminium, 8);
    sp.strut(polar(0.86, a + 45 * DEG, -0.78), polar(0.86, a + 135 * DEG, -0.78), 0.014, m.aluminium);
    sp.strut(polar(0.86, a + 45 * DEG, -0.78), polar(0.3, a + 45 * DEG, -0.84), 0.014, m.aluminium);
  }
  for (const a of [0, 180]) sp.at(polar(0.78, a * DEG, -0.55)).add(sphere(0.17, 18, 9), m.foilGold, { tint: 0xe6c48c });

  // Two thruster booms.
  for (const deg of [90, 270]) {
    const tip = polar(2.05, deg * DEG, -0.72);
    sp.strut(polar(0.84, (deg - 14) * DEG, -0.78), tip, 0.022, m.carbon, 8);
    sp.strut(polar(0.84, (deg + 14) * DEG, -0.78), tip, 0.022, m.carbon, 8);
    sp.strut(polar(RC - 0.05, deg * DEG, 0), tip, 0.016, m.carbon);
    const tan = polar(1, (deg + 90) * DEG, 0);
    const out = polar(1, deg * DEG, 0);
    thrusterPod(sp.at(tip), [[0, 0, -1], [0, 0, 1], tan, vscale(tan, -1), out], 0.022, m.foilBlack);
    cable(sp, [polar(0.86, deg * DEG, -0.76), polar(1.4, (deg + 2) * DEG, -0.72), vadd(tip, vscale(out, -0.08))], 0.01, m.harness);
  }

  // -------------------------------------------------------------------------------------------
  // Two generator booms
  // -------------------------------------------------------------------------------------------
  const genAsm = b.assembly('generator_booms', spunAsm);
  for (const deg of [128, 232]) {
    const g0 = genAsm.ctx();
    const dir = vnorm([Math.cos(deg * DEG), Math.sin(deg * DEG), -0.2]);
    const base = polar(RC - 0.03, deg * DEG, 0.3);
    const head = vadd(base, vscale(dir, 2.95));
    const gc = g0.aim(head, vadd(head, dir));
    g0.strut(polar(RC, (deg - 20) * DEG, 0.45), gc.point([0, 0.1, 0]), 0.022, m.carbon, 8);
    g0.strut(polar(RC, (deg + 20) * DEG, 0.45), gc.point([0, 0.1, 0]), 0.022, m.carbon, 8);
    g0.strut(polar(RC, deg * DEG, 0.02), gc.point([0, -0.1, 0]), 0.022, m.carbon, 8);
    g0.strut(polar(RC, (deg - 20) * DEG, 0.45), vadd(base, vscale(dir, 1.5)), 0.012, m.carbon);
    g0.strut(polar(RC, (deg + 20) * DEG, 0.45), vadd(base, vscale(dir, 1.5)), 0.012, m.carbon);
    gc.box(0.3, 0.3, 0.05, m.aluminium, 0.008);
    gc.move(0, 0, 0.04).box(0.62, 0.62, 0.012, m.foilBlack, 0.004);
    rtg(gc.move(0, 0, 0.1).rotZ(22.5 * DEG), { length: 1.1, coreR: 0.11, finR: 0.21, fins: 8, finT: 0.007, finSpan: 0.9, tubes: true });
    cable(g0, [polar(RC, (deg + 4) * DEG, 0.2), vadd(base, vscale(dir, 1.4)), gc.point([0.05, -0.08, 0.02])], 0.011, m.cable);
  }

  // -------------------------------------------------------------------------------------------
  // Science boom and 11 m magnetometer boom (+X)
  // -------------------------------------------------------------------------------------------
  const sbAsm = b.assembly('science_boom', spunAsm);
  const sbRoot: V3 = [AF / 2, 0, 0.26];
  const sb = sbAsm.ctx().aim(sbRoot, vadd(sbRoot, [1, 0, 0]));
  const SB = 2.3;
  trussBoom(sb, { length: SB, width: 0.4, endWidth: 0.3, bays: 5, longeron: 0.016, batten: 0.012, diagonal: 0.009, mat: m.carbon, cross: true, phase: 90 * DEG });
  sb.move(0, 0, -0.02).box(0.5, 0.42, 0.05, m.aluminium, 0.01);
  // Particle and dust instruments along the science boom.
  const epd = sb.move(0, 0.34, 1.0);
  epd.box(0.24, 0.2, 0.26, m.foilBlack, 0.016);
  epd.rotX(-Math.PI / 2).cyl(0.07, 0.1, 0.2, m.aluminium, 16, 0.006);
  barrel(epd.move(0, 0.2, 0).rotY(Math.PI / 2), 0.035, 0.12, m.aluminium);
  sb.strut([0, 0.14, 1.0], [0, 0.26, 1.0], 0.022, m.aluminium);
  const pls = sb.move(0.02, -0.3, 1.5);
  pls.box(0.26, 0.22, 0.3, m.foilGold, 0.016, 0xeccc98);
  pls.move(0, -0.13, 0).rotX(Math.PI / 2).cyl(0.09, 0, 0.05, m.aluminium, 20, 0.006);
  sb.strut([0, -0.12, 1.5], [0.02, -0.2, 1.5], 0.022, m.aluminium);
  const dds = sb.move(-0.3, 0.05, 1.95).rotY(-Math.PI / 2).rotX(0.4);
  dds.add(lathe([[0, 0], [0.2, 0, 1], [0.2, 0.34, 1], [0.19, 0.34]], 28), m.foilBlack);
  dds.add(lathe([[0.19, 0.34], [0.19, 0.06, 1], [0, 0.06]], 28), m.goldPlate);
  sb.move(0.28, 0.02, 2.0).box(0.22, 0.2, 0.24, m.foilBlack, 0.014, 0xe4e0d8);
  cable(sb, [[0.05, -0.1, 0], [0.06, -0.09, 0.8], [0.04, -0.08, 1.6], [0, -0.06, SB]], 0.013, m.harness);
  // Mast canister and lattice mast.
  sb.cyl(0.16, SB, SB + 0.62, m.foilBlack, 24, 0.012);
  sb.cyl(0.175, SB + 0.6, SB + 0.65, m.aluminium, 24, 0.004);
  const MAST0 = SB + 0.64;
  const MAST = 11.0 - AF / 2 - MAST0;
  trussBoom(sb.move(0, 0, MAST0), { length: MAST, width: 0.22, bays: 34, longeron: 0.007, batten: 0.005, diagonal: 0.003, mat: m.fibre, cross: true, phase: 90 * DEG });
  for (const f of [0.6, 1]) {
    const q = sb.move(0, 0, MAST0 + MAST * f);
    q.box(0.26, 0.26, 0.012, m.aluminium, 0.003);
    q.move(0, 0, 0.08).box(0.12, 0.12, 0.14, m.foilBlack, 0.012);
    q.move(0, 0, 0.08).rotY(Math.PI / 2).cyl(0.04, -0.1, 0.1, m.paintWhite, 14, 0.004);
  }
  // Plasma-wave dipole across the tip of the mast.
  const tip = sb.move(0, 0, MAST0 + MAST + 0.2);
  tip.box(0.14, 0.14, 0.1, m.foilGold, 0.012, 0xe8c890);
  whip(tip.aim([0.06, 0, 0], [1, 0, 0]), 3.3, 0.007);
  whip(tip.aim([-0.06, 0, 0], [-1, 0, 0]), 3.3, 0.007);

  // -------------------------------------------------------------------------------------------
  // Despun section: scan platform, relay dish, engine and probe
  // -------------------------------------------------------------------------------------------
  const despunAsm = b.assembly('despun');
  const ds = despunAsm.ctx();
  ds.cyl(0.36, -1.0, -0.86, m.aluminium, 28, 0.01);
  ds.add(extrude(polygon(8, 0.6, 22.5 * DEG), -1.66, -1.0, 0.014), m.foilBlack, { tint: 0xe8e8f0 });
  for (let k = 0; k < 8; k++) {
    const a = 45 * k * DEG;
    const p = polar(0.6 * Math.cos(22.5 * DEG) - 0.006, a, -1.33);
    ds.aim(p, vadd(p, polar(1, a, 0))).move(0, 0, 0.004).box(0.38, 0.54, 0.02, k % 3 === 1 ? m.foilGold : m.foilBlack, 0.01, k % 2 === 0 ? 0xffffff : 0xdcdce6);
  }
  // Scan platform on an arm (-X): actuators, platform and four instruments that look along -Y.
  ds.strut([-0.5, 0.12, -1.2], [-1.25, 0, -1.3], 0.03, m.carbon, 8);
  ds.strut([-0.5, -0.12, -1.2], [-1.25, 0, -1.3], 0.03, m.carbon, 8);
  ds.strut([-0.5, 0, -1.55], [-1.25, 0, -1.3], 0.022, m.carbon, 8);
  const act = ds.at([-1.25, 0, -1.3]);
  act.cyl(0.09, -0.14, 0.14, m.aluminium, 20, 0.008);
  act.move(-0.2, 0, 0).rotX(Math.PI / 2).cyl(0.08, -0.16, 0.16, m.aluminium, 20, 0.008);
  const pt = act.move(-0.5, 0, 0).rotX(Math.PI / 2); // local +Z = model -Y
  pt.box(0.5, 0.5, 0.3, m.foilBlack, 0.016);
  const ssi = pt.move(0.05, 0.36, -0.35);
  ssi.move(0, 0, 0.1).box(0.26, 0.24, 0.24, m.foilBlack, 0.014);
  barrel(ssi.move(0, 0, 0.2), 0.13, 0.86, m.foilBlack, 0.16);
  ssi.move(0, 0, 0.75).add(lathe([[0.132, -0.02], [0.142, -0.02, 1], [0.142, 0.02, 1], [0.132, 0.02]], 24), m.aluminium);
  const nims = pt.move(0.0, -0.4, -0.1);
  nims.box(0.34, 0.26, 0.5, m.foilGold, 0.016, 0xe6c690);
  barrel(nims.move(0.06, 0, 0.24), 0.08, 0.2, m.foilGold, 0.08);
  nims.move(-0.26, 0, 0.05).rotY(-Math.PI / 2).add(lathe([[0.06, 0], [0.24, 0.26, 1], [0.23, 0.26]], 24), m.paintWhite);
  nims.move(-0.26, 0, 0.05).rotY(-Math.PI / 2).add(lathe([[0.23, 0.26], [0.055, 0.01, 1], [0, 0.01]], 24), m.mirror, { uv: [0.5, 0.5] });
  const uvs = pt.move(-0.34, 0.1, 0.0);
  uvs.box(0.14, 0.18, 0.5, m.foilBlack, 0.012, 0xe0e0ea);
  uvs.move(0, 0, 0.252).add(plane(0.09, 0.12), m.glass);
  const ppr = pt.move(0.34, -0.05, 0.05);
  ppr.box(0.14, 0.14, 0.2, m.foilGold, 0.012);
  barrel(ppr.move(0, 0, 0.09), 0.05, 0.2, m.aluminium, 0.05);
  // Relay dish on an arm, looking down and out.
  const relayBase: V3 = [0.75, 0.55, -1.72];
  ds.strut([0.4, 0.3, -1.3], relayBase, 0.025, m.carbon, 8);
  ds.strut([0.45, 0.15, -1.6], relayBase, 0.02, m.carbon, 8);
  const relay = ds.aim(relayBase, vadd(relayBase, [0.45, 0.35, -0.82]));
  relay.cyl(0.07, -0.1, 0.06, m.aluminium, 16);
  const rd = dish(relay.move(0, 0, 0.06), { diameter: 1.1, fd: 0.4, gores: 12, seams: 2, back: m.foilBlack, ribs: 8, ribDepth: 0.04, thickness: 0.014, seg: 40 });
  for (let k = 0; k < 3; k++) {
    const a = (90 + 120 * k) * DEG;
    relay.strut(polar(0.5, a, 0.06 + rd.z(0.5)), polar(0.03, a, 0.06 + rd.focal * 0.95), 0.007, m.aluminium);
  }
  relay.move(0, 0, 0.06 + rd.focal * 0.9).cyl(0.045, 0, 0.09, m.paintWhite, 14);

  // Main engine inside the probe adapter, and the probe on a ring of struts.
  nozzle(ds.aim([0, 0, -1.6], [0, 0, -3]), { exitR: 0.14, length: 0.22, throatR: 0.03, chamberR: 0.05, chamberLen: 0.08, seg: 24 });
  strutRing(ds, 8, 0.52, -1.66, 0.46, -1.96, 0.016, m.aluminium, true, 22.5 * DEG);
  const probeAsm = b.assembly('probe', despunAsm);
  const pr = probeAsm.ctx().aim([0, 0, -1.76], [0, 0, -3]);
  pr.add(
    lathe(
      [
        [0, -0.02], [0.3, 0.0], [0.47, 0.1], [0.56, 0.2], [0.635, 0.33, 1], [0.635, 0.36, 1],
        [0.5, 0.5], [0.36, 0.64], [0.24, 0.76], [0.13, 0.84], [0, 0.875],
      ],
      44,
      { planarUv: true },
    ),
    m.foilAmber,
    { tint: 0xf4d4a0 },
  );
  pr.add(lathe([[0.637, 0.325], [0.655, 0.325, 1], [0.655, 0.365, 1], [0.637, 0.365]], 44), m.aluminium);
  pr.add(lathe([[0.47, 0.19], [0.5, 0.19, 1], [0.5, 0.22, 1], [0.47, 0.22]], 44), m.aluminium);
  pr.add(lathe([[0.372, 0.635], [0.36, 0.652, 1], [0.348, 0.66]], 44), m.foilGold);

  return { boresight: [0, 0, 1], spin: null };
}

/**
 * Mars rover mission in the cruise configuration (original procedural model).
 *
 * A biconic aeroshell about 4.5 m in diameter (tiled heat shield and white backshell) hangs under
 * a ring-shaped cruise stage. The cruise stage has solar cells on its top face, radiator panels
 * around its rim, two propellant tanks, two thruster clusters, a star scanner and a horn
 * antenna. The stack spins about its axis.
 *
 * Axes: +Z = top of the cruise stage (solar cells and antenna face +Z); the heat shield is at -Z.
 */
import type { Builder, ModelSpec } from './builder';
import { arcProfile, disc, flatPolygon, lathe, plane, polar, sphere, vadd } from './geometry';
import type { P2, ProfilePoint } from './geometry';
import { cable, flange, horn, lowGain, starTracker, strutRing, thrusterPod } from './parts';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export function buildMarsCruise(b: Builder): ModelSpec {
  const m = b.mat;

  // -------------------------------------------------------------------------------------------
  // Aeroshell: 70 degree sphere-cone heat shield and biconic backshell
  // -------------------------------------------------------------------------------------------
  const aero = b.assembly('aeroshell').ctx();
  const ZN = -1.6;
  const RN = 1.125;
  const RMAX = 2.25;
  const sphereAt = (a: number): ProfilePoint => [RN * Math.sin(a), ZN + RN * (1 - Math.cos(a))];
  const tangent = sphereAt(20 * DEG);
  const coneAt = (r: number): ProfilePoint => [r, tangent[1] + (r - tangent[0]) * Math.tan(20 * DEG)];
  const ZS = coneAt(2.19)[1];
  // Three zones of tiles: one round tile on the nose, 12 tiles around in the inner zone and 24
  // tiles around in the outer zone. The tiles thus keep a similar size from the nose to the shoulder.
  const NOSE = 16 * DEG;
  const RSPLIT = 0.95;
  const nose: ProfilePoint[] = [];
  for (let k = 0; k <= 4; k++) nose.push(sphereAt((NOSE * k) / 4));
  const inner: ProfilePoint[] = [sphereAt(NOSE), sphereAt(18 * DEG), tangent, coneAt(0.66), coneAt(RSPLIT)];
  const outer: ProfilePoint[] = [];
  for (let k = 0; k <= 5; k++) outer.push(coneAt(RSPLIT + ((2.19 - RSPLIT) * k) / 5));
  outer.push(...arcProfile(2.19, ZS + 0.06, 0.06, -70 * DEG, 0, 3).slice(1));
  aero.add(lathe(nose, 36, { planarUv: true }), m.ablator, { uv: [0.18, 0.18, 0.125, 0.125] });
  aero.add(lathe(inner, 72, { unitUv: true }), m.ablator, { uv: [3, 0.5, 0.25, 0.25] });
  aero.add(lathe(outer, 72, { unitUv: true }), m.ablator, { uv: [6, 1, 0.5, 0] });
  aero.add(lathe([[nose[4][0] - 0.006, nose[4][1] - 0.002], [nose[4][0] + 0.006, nose[4][1] - 0.002]], 36), m.paintBlack);
  const ZB = ZS + 0.06;
  // Backshell: lower cone, upper cone, parachute can.
  const R1 = 1.3;
  const Z1 = ZB + (RMAX - R1) / Math.tan(36.5 * DEG);
  const R2 = 0.5;
  const Z2 = Z1 + (R1 - R2) / Math.tan(59 * DEG);
  aero.add(lathe([[RMAX, ZB], [RMAX, ZB + 0.05, 1], [R1, Z1]], 72, { unitUv: true }), m.shellWhite, { uv: [10, 2.5] });
  aero.add(lathe([[R1, Z1], [R2, Z2]], 72, { unitUv: true }), m.shellWhite, { uv: [7, 1.25] });
  aero.add(lathe([[RMAX + 0.004, ZB - 0.03], [RMAX + 0.02, ZB - 0.03, 1], [RMAX + 0.02, ZB + 0.08, 1], [RMAX - 0.03, ZB + 0.085]], 72), m.foilSilver);
  aero.add(lathe([[R1 + 0.03, Z1 - 0.04], [R1 + 0.012, Z1 + 0.012, 1], [R1 - 0.05, Z1 + 0.035]], 72), m.foilSilver);
  const ZC = 1.3;
  aero.add(lathe([[R2, Z2], [0.44, Z2 + 0.03, 1], [0.44, ZC - 0.05], [0.38, ZC, 1], [0, ZC]], 40), m.foilSilver, { tint: 0xe8e8e8 });
  aero.add(lathe([[0.442, Z2 + 0.12], [0.455, Z2 + 0.12, 1], [0.455, Z2 + 0.22, 1], [0.442, Z2 + 0.22]], 40), m.foilGold);
  lowGain(aero.move(0, 0, ZC), 1.0, 0.03);
  // Thruster ports and small hatches on the lower cone.
  const slope = 36.5 * DEG;
  for (let k = 0; k < 8; k++) {
    const a = (TAU * (k + 0.5)) / 8 + (k % 2 === 0 ? 0.09 : -0.09);
    const r = 1.9;
    const z = ZB + (RMAX - r) / Math.tan(slope);
    const p = polar(r, a, z);
    const n = vadd(p, [Math.cos(a) * Math.cos(slope), Math.sin(a) * Math.cos(slope), Math.sin(slope)]);
    const port = aero.aim(p, n);
    flange(port, 0.07, 0.1, 0.012, m.aluminium, 20);
    port.move(0, 0, 0.004).add(disc(0.07, 20), m.nozzleInner);
  }
  for (let k = 0; k < 6; k++) {
    const a = (TAU * k) / 6 + 0.3;
    const r = 1.55;
    const z = ZB + (RMAX - r) / Math.tan(slope);
    const p = polar(r, a, z);
    const n = vadd(p, [Math.cos(a) * Math.cos(slope), Math.sin(a) * Math.cos(slope), Math.sin(slope)]);
    aero.aim(p, n).move(0, 0, 0.004).box(0.22, 0.16, 0.012, m.foilSilver, 0.004, k % 2 === 0 ? 0xffffff : 0xd8d8d8);
  }

  // Plates where the truss of the cruise stage stands on the upper cone, a band of tape and two
  // flat antenna patches.
  const slope2 = 59 * DEG;
  for (let k = 0; k < 12; k++) {
    const a = (TAU * (k + 0.5)) / 12;
    const r = 0.98;
    const p = polar(r, a, Z1 + (R1 - r) / Math.tan(slope2));
    const n = vadd(p, [Math.cos(a) * Math.cos(slope2), Math.sin(a) * Math.cos(slope2), Math.sin(slope2)]);
    aero.aim(p, n).cyl(0.07, 0, 0.014, m.titanium, 12, 0.003);
  }
  aero.add(lathe([[1.72, ZB + (RMAX - 1.72) / Math.tan(slope) + 0.004], [1.66, ZB + (RMAX - 1.66) / Math.tan(slope) + 0.004]], 72), m.foilAmber);
  for (const deg of [75, 255]) {
    const r = 1.1;
    const p = polar(r, deg * DEG, Z1 + (R1 - r) / Math.tan(slope2));
    const n = vadd(p, [Math.cos(deg * DEG) * Math.cos(slope2), Math.sin(deg * DEG) * Math.cos(slope2), Math.sin(slope2)]);
    const patch = aero.aim(p, n);
    patch.move(0, 0, 0.006).box(0.34, 0.2, 0.014, m.paintGrey, 0.004);
    patch.move(0, 0, 0.0135).add(plane(0.3, 0.16), m.foilGold, { tint: 0xf0d2a0 });
  }

  // -------------------------------------------------------------------------------------------
  // Cruise stage: ring structure, radiators, tanks
  // -------------------------------------------------------------------------------------------
  const cs = b.assembly('cruise_stage').ctx();
  const RO = 2.0;
  const RI = 0.74;
  const Z0 = 1.02;
  const ZT = 1.48;
  cs.add(lathe([[RI, ZT], [RI, Z0]], 48), m.foilGold, { tint: 0xe8c690 });
  cs.add(lathe([[RI + 0.02, Z0 + 0.02], [RI + 0.02, ZT]], 48), m.foilGold);
  cs.add(lathe([[RO - 0.03, Z0], [RO - 0.03, ZT]], 60), m.foilGold, { tint: 0xf2d6a6 });
  cs.add(lathe([[RO - 0.05, ZT], [RO - 0.05, Z0]], 60), m.foilAmber);
  cs.add(lathe([[RO, ZT], [RI, ZT]], 60, { unitUv: true }), m.foilBlack, { uv: [24, 2.5] });
  cs.add(lathe([[RI, Z0], [RI + 0.16, Z0]], 48), m.aluminium);
  cs.add(lathe([[RO - 0.16, Z0], [RO - 0.03, Z0]], 60), m.aluminium);
  cs.add(lathe([[RO - 0.03, ZT - 0.03], [RO + 0.012, ZT - 0.03, 1], [RO + 0.012, ZT + 0.004, 1], [RO - 0.03, ZT + 0.004]], 60), m.aluminium);
  // Radial ribs inside the open ring.
  for (let k = 0; k < 12; k++) {
    const a = (TAU * k) / 12;
    cs.rotZ(a).move((RI + RO) / 2, 0, (Z0 + ZT) / 2).box(RO - RI - 0.06, 0.02, ZT - Z0 - 0.02, m.aluminium, 0.003);
  }
  // Ten radiator panels around the rim.
  for (let k = 0; k < 10; k++) {
    const a = (TAU * (k + 0.5)) / 10;
    if (k === 2 || k === 7) continue;
    const p = polar(RO + 0.012, a, (Z0 + ZT) / 2 - 0.02);
    const rad = cs.aim(p, vadd(p, polar(1, a, 0)));
    rad.box(1.02, 0.4, 0.016, m.paintWhite, 0.004);
    rad.move(0, 0, 0.0095).add(plane(0.96, 0.34), m.mirror, { uv: [3, 1] });
  }
  // Two propellant tanks and equipment boxes in the ring, pipes between them.
  for (const deg of [90, 270]) {
    cs.at(polar(1.36, deg * DEG, 1.2)).add(sphere(0.27, 24, 12), m.titanium);
    cs.at(polar(1.36, deg * DEG, 1.2)).add(lathe([[0.272, -0.02], [0.285, -0.02, 1], [0.285, 0.02, 1], [0.272, 0.02]], 24), m.aluminium);
  }
  for (const deg of [20, 150, 200, 330]) {
    const p = polar(1.38, deg * DEG, 1.14);
    cs.aim(p, vadd(p, [0, 0, -1]), polar(1, deg * DEG, 0)).box(0.4, 0.3, 0.22, deg % 40 === 0 ? m.foilBlack : m.foilGold, 0.016);
  }
  cable(cs, [polar(1.2, 95 * DEG, 1.03), polar(1.25, 130 * DEG, 1.05), polar(1.2, 170 * DEG, 1.04), polar(1.25, 215 * DEG, 1.05), polar(1.2, 265 * DEG, 1.03)], 0.014, m.aluminium);
  cable(cs, [polar(1.5, 275 * DEG, 1.04), polar(1.55, 310 * DEG, 1.05), polar(1.5, 350 * DEG, 1.04), polar(1.55, 30 * DEG, 1.05), polar(1.5, 85 * DEG, 1.04)], 0.012, m.harness);
  // Interface truss between the cruise stage and the backshell.
  const zOn = (r: number): number => Z1 + (R1 - r) / Math.tan(59 * DEG);
  strutRing(cs, 12, RI + 0.06, Z0, 0.98, zOn(0.98) + 0.02, 0.018, m.titanium, true);
  cs.add(lathe([[0.95, zOn(0.95) + 0.005], [1.02, zOn(1.02) + 0.005, 1], [1.02, zOn(1.02) + 0.04, 1], [0.95, zOn(0.95) + 0.045]], 48), m.aluminium);

  // -------------------------------------------------------------------------------------------
  // Top face: solar cells in six sectors, launch adapter ring, sensors and antenna
  // -------------------------------------------------------------------------------------------
  const top = b.assembly('top_deck').ctx().move(0, 0, ZT);
  const sector = (half: number, r0: number, r1: number): P2[] => {
    const pts: P2[] = [];
    for (let k = 0; k <= 3; k++) {
      const a = -half + (2 * half * k) / 3;
      pts.push([r0 * Math.sin(a), r0 * Math.cos(a)]);
    }
    for (let k = 8; k >= 0; k--) {
      const a = -half + (2 * half * k) / 8;
      pts.push([r1 * Math.sin(a), r1 * Math.cos(a)]);
    }
    return pts;
  };
  const cells = flatPolygon(sector(25.5 * DEG, 0.98, RO - 0.075), 0, true);
  const backing = flatPolygon(sector(28.5 * DEG, 0.9, RO - 0.036), 0, true);
  for (let k = 0; k < 6; k++) {
    const sc = top.rotZ((TAU * k) / 6);
    sc.move(0, 0, 0.004).add(backing, m.carbon, { uv: [4, 3] });
    sc.move(0, 0, 0.008).add(cells, m.solarCells, { uv: [5.5, 3.25, k * 0.25, 0] });
  }
  // Harness and a small junction box on each spoke between two cell sectors.
  for (let k = 0; k < 6; k++) {
    const sp = top.rotZ((TAU * (k + 0.5)) / 6);
    sp.strut([0, 0.94, 0.012], [0, RO - 0.1, 0.012], 0.011, m.harness, 6);
    sp.move(0.045, 1.42, 0.02).box(0.07, 0.3, 0.03, m.foilGold, 0.008, k % 2 === 0 ? 0xffffff : 0xe8c890);
    for (const r of [1.05, 1.3, 1.62, 1.86]) sp.move(0, r, 0.012).box(0.05, 0.02, 0.03, m.aluminium, 0.004);
  }
  flange(top, RI - 0.02, RI + 0.1, 0.07, m.aluminium, 48);
  top.add(lathe([[RI + 0.06, 0.07], [RI + 0.0, 0.2, 1], [RI - 0.03, 0.2]], 48), m.aluminium);
  // Horn antenna and star scanner on the adapter ring; sun sensors around the deck.
  const hornBase = polar(RI + 0.3, 30 * DEG, 0.01);
  top.at(hornBase).cyl(0.07, 0, 0.1, m.aluminium, 16);
  horn(top.at(hornBase).move(0, 0, 0.1), 0.05, 0.15, 0.3, m.paintWhite);
  const scan = polar(RI + 0.32, 210 * DEG, 0.01);
  starTracker(top.aim(vadd(scan, [0, 0, 0.1]), vadd(scan, polar(0.8, 210 * DEG, 1))), 1.0, m.foilGold);
  for (let k = 0; k < 6; k++) {
    const p = polar(RO - 0.03, (TAU * (k + 0.5)) / 6, 0.03);
    top.at(p).box(0.07, 0.07, 0.06, m.aluminium, 0.006);
    top.at(p).move(0, 0, 0.031).add(plane(0.04, 0.04), m.glass);
  }

  // Two thruster clusters on short booms at the rim.
  for (const deg of [36 * 2 + 18, 36 * 7 + 18]) {
    const p = polar(RO + 0.2, deg * DEG, (Z0 + ZT) / 2);
    cs.strut(polar(RO - 0.03, (deg - 6) * DEG, Z0 + 0.05), p, 0.02, m.aluminium, 8);
    cs.strut(polar(RO - 0.03, (deg + 6) * DEG, Z0 + 0.05), p, 0.02, m.aluminium, 8);
    cs.strut(polar(RO - 0.03, deg * DEG, ZT - 0.05), p, 0.02, m.aluminium, 8);
    const tan = polar(1, (deg + 90) * DEG, 0);
    const up = Math.SQRT1_2;
    thrusterPod(cs.at(p), [[tan[0] * up, tan[1] * up, up], [-tan[0] * up, -tan[1] * up, up], [tan[0] * up, tan[1] * up, -up], [-tan[0] * up, -tan[1] * up, -up]], 0.026, m.foilGold);
  }

  // About 2 revolutions per minute about the axis of the stack.
  return { boresight: [0, 0, 1], spin: { axis: [0, 0, 1], rate: (2 * Math.PI * 2) / 60 } };
}

/**
 * Juno class Jupiter orbiter (original procedural model).
 *
 * Six-sided bus with six propellant tanks between two decks, an armoured electronics vault and a
 * 2.5 m dish on top, and three very long solar wings (each about 9 m by 2.65 m, in panels). One
 * wing has three panels and ends in a magnetometer boom. The spacecraft spins about the dish axis.
 *
 * Axes: +Z = dish boresight and spin axis. The wings are at azimuth 90, 210 and 330 degrees.
 */
import type { Builder, Ctx, ModelSpec } from './builder';
import { cornerRadius, extrude, flatPolygon, lathe, plane, polar, polygon, sphere, vadd } from './geometry';
import type { V3 } from './geometry';
import { barrel, bolts, cable, cassegrain, coverPlate, dish, hinge, lowGain, nozzle, plugs, quilt, solarPanel, starTracker, strutRing, thrusterPod, whip } from './parts';

const DEG = Math.PI / 180;
const AF = 2.9;
const AP = AF / 2;
const RC = cornerRadius(6, AF);
const ZT = 0.8;
const ZW = 0.55;

function wing(b: Builder, name: string, azimuth: number, panels: number, boom: boolean): void {
  const m = b.mat;
  const w = b.assembly(name).ctx().rotZ((azimuth - 90) * DEG).move(0, 0, ZW);
  const GAP = 0.36;
  const L = 2.2;
  const PITCH = L + 0.06;
  // Root fittings, yoke struts and the two long diagonal braces.
  for (const sx of [-1, 1]) {
    w.move(0.62 * sx, AP + 0.03, 0).box(0.16, 0.08, 0.12, m.aluminium, 0.01);
    w.strut([0.62 * sx, AP + 0.04, 0], [0.8 * sx, AP + GAP, -0.01], 0.024, m.carbon, 8);
    w.strut([0.2 * sx, AP + 0.04, 0], [0.8 * sx, AP + GAP, -0.01], 0.016, m.carbon, 8);
    hinge(w.move(0.8 * sx, AP + GAP, -0.012), 0.14, 0.018);
    w.strut([0.9 * sx, AP - 0.02, -ZW - ZT + 0.05], [0.95 * sx, AP + GAP + L + 0.03, -0.04], 0.02, m.carbon, 8);
  }
  for (let k = 0; k < panels; k++) {
    const width = k === 0 ? 2.02 : 2.65;
    const y = AP + GAP + L / 2 + PITCH * k;
    solarPanel(w.move(0, y, 0), {
      w: width,
      h: L,
      cols: k === 0 ? 24 : 32,
      rows: 28,
      blocksX: 2,
      blocksY: 2,
      ribsX: 4,
      ribsY: 3,
      thickness: 0.026,
    });
    if (k > 0) {
      for (const x of [-0.85, 0, 0.85]) hinge(w.move(x, y - L / 2 - 0.03, -0.012), 0.16, 0.017);
    }
    // Harness along the back of the wing.
    cable(w, [[0.3, y - L / 2 + 0.05, -0.05], [0.34, y, -0.055], [0.3, y + L / 2 - 0.05, -0.05]], 0.012, m.cable);
  }
  if (!boom) return;

  // Magnetometer boom at the end of the wing: a tapered frame with two sensor stations.
  const y0 = AP + GAP + PITCH * panels;
  const BL = 3.6;
  const half = (f: number): number => 0.5 - 0.24 * f;
  for (const x of [-0.6, 0.6]) hinge(w.move(x, y0 - 0.03, -0.012), 0.16, 0.017);
  w.strut([-0.75, y0, -0.01], [0.75, y0, -0.01], 0.022, m.carbon, 8);
  for (const sx of [-1, 1]) {
    w.strut([half(0) * sx, y0, -0.01], [half(1) * sx, y0 + BL, -0.01], 0.026, m.carbon, 8);
    w.strut([0.75 * sx, y0, -0.01], [half(0.3) * sx, y0 + BL * 0.3, -0.01], 0.014, m.carbon);
  }
  const bays = 6;
  for (let i = 1; i <= bays; i++) {
    const f = i / bays;
    const fp = (i - 1) / bays;
    w.strut([-half(f), y0 + BL * f, -0.01], [half(f), y0 + BL * f, -0.01], 0.016, m.carbon);
    const s = i % 2 === 0 ? 1 : -1;
    w.strut([-half(fp) * s, y0 + BL * fp, -0.01], [half(f) * s, y0 + BL * f, -0.01], 0.011, m.carbon);
  }
  w.move(0, y0 + BL / 2, -0.01).box(0.24, BL - 0.1, 0.045, m.foilBlack, 0.012);
  for (const f of [0.52, 0.96]) {
    const st = w.move(0, y0 + BL * f, 0.03);
    st.box(0.42, 0.34, 0.1, m.foilGold, 0.016, 0xf0d6a8);
    st.move(0.1, 0, 0.1).box(0.11, 0.11, 0.1, m.paintWhite, 0.01);
    barrel(st.move(-0.1, 0.06, 0.05).rotX(-0.35), 0.035, 0.13, m.paintBlack, 0.04);
    barrel(st.move(-0.1, -0.06, 0.05).rotX(0.35), 0.035, 0.13, m.paintBlack, 0.04);
  }
}

export function buildJuno(b: Builder): ModelSpec {
  const m = b.mat;
  const body = b.assembly('body').ctx();
  const side = (k: number, z = 0): Ctx => {
    const a = (30 + 60 * k) * DEG;
    const p = polar(AP, a, z);
    return body.aim(p, vadd(p, polar(1, a, 0)));
  };

  // -------------------------------------------------------------------------------------------
  // Two decks, central cylinder, six tanks, corner posts
  // -------------------------------------------------------------------------------------------
  const hex = polygon(6, RC, 0);
  body.add(extrude(hex, ZT - 0.06, ZT, 0.012), m.foilBlack);
  body.add(extrude(hex, -ZT, -ZT + 0.06, 0.012), m.foilBlack);
  body.cyl(0.56, -ZT + 0.05, ZT - 0.05, m.foilBlack, 28, 0, 0xd8d8e4);
  for (let k = 0; k < 6; k++) {
    const a = 60 * k * DEG;
    body.at(polar(1.06, a, 0)).add(sphere(0.47, 24, 12), m.foilBlack, { tint: k % 2 === 0 ? 0xffffff : 0xe6e0d8 });
    body.at(polar(1.06, a, 0)).add(lathe([[0.472, -0.03], [0.485, -0.03, 1], [0.485, 0.03, 1], [0.472, 0.03]], 24), m.aluminium);
    body.strut(polar(RC - 0.03, a, -ZT + 0.05), polar(RC - 0.03, a, ZT - 0.05), 0.022, m.aluminium, 8);
    body.strut(polar(RC - 0.03, a, -ZT + 0.05), polar(RC - 0.03, a + 60 * DEG, ZT - 0.05), 0.012, m.carbon);
  }
  // Closed blanket panels on the three wing sides.
  const BLACKS = [0xffffff, 0xe4e4ee, 0xd6d6de] as const;
  for (const k of [1, 3, 5]) quilt(side(k).move(0, 0, -0.024), RC - 0.12, 2 * ZT - 0.14, { cols: 3, rows: 3, mat: m.foilBlack, tints: BLACKS, thickness: 0.03, buttons: true, seed: 3 + k });
  // Upper deck blanket: six sectors with tape seams and fixing buttons.
  for (let k = 0; k < 6; k++) {
    const a0 = 60 * k * DEG;
    const a1 = 60 * (k + 1) * DEG;
    const p0 = polar(RC - 0.05, a0, 0);
    const p1 = polar(RC - 0.05, a1, 0);
    body.move(0, 0, ZT + 0.003).add(flatPolygon([[0, 0], [p0[0], p0[1]], [p1[0], p1[1]]]), m.foilBlack, { tint: BLACKS[k % 3], uv: [3, 3, k * 0.37, k * 0.61] });
    body.strut(polar(0.45, a0, ZT + 0.004), polar(RC - 0.06, a0, ZT + 0.004), 0.008, m.aluminium, 4, false, 0x8c8c90);
    bolts(body.rotZ(a0 + 4 * DEG).move(0, 0, ZT + 0.003), [0.75, 0], [1.45, 0], 3);
  }
  // Microwave antennas: one large patch array on a side, a group of smaller ones on another side.
  const a1 = side(0);
  a1.move(0, 0, 0.0).box(1.6, 1.56, 0.05, m.paintGrey, 0.006);
  a1.move(0, 0, 0.028).add(plane(1.52, 1.48), m.dishWhite, { uv: [2.5, 2.5], tint: 0xdcd6c8 });
  const a2 = side(2);
  quilt(a2.move(0, 0, -0.024), RC - 0.12, 2 * ZT - 0.14, { cols: 3, rows: 3, mat: m.foilBlack, tints: BLACKS, thickness: 0.03, seed: 17 });
  a2.move(-0.36, 0.3, 0.03).box(0.8, 0.8, 0.045, m.paintGrey, 0.006);
  a2.move(-0.36, 0.3, 0.055).add(plane(0.74, 0.74), m.dishWhite, { uv: [2.5, 2.5], tint: 0xdcd6c8 });
  for (let k = 0; k < 3; k++) {
    a2.move(0.42, 0.52 - 0.3 * k, 0.03).box(0.62, 0.22, 0.04, m.paintGrey, 0.006);
    a2.move(0.42, 0.52 - 0.3 * k, 0.052).add(plane(0.58, 0.18), m.dishWhite, { uv: [4, 1], tint: 0xd6d0c2 });
  }
  const horn6 = a2.move(-0.3, -0.42, 0.02);
  horn6.add(lathe([[0.1, 0], [0.19, 0.2, 1], [0.18, 0.2]], 24), m.aluminium);
  horn6.add(lathe([[0.18, 0.2], [0.09, 0.01, 1], [0, 0.01]], 24), m.paintBlack);
  // The open side: camera, star tracker and boxes between the tanks.
  const open = side(4);
  open.move(0.2, 0.5, -0.1).box(0.24, 0.2, 0.22, m.foilGold, 0.014, 0xeed09c);
  barrel(open.move(0.2, 0.5, 0.0), 0.05, 0.1, m.paintBlack);
  starTracker(open.move(-0.3, 0.45, -0.1).rotX(-0.5), 0.9, m.foilGold);
  open.move(-0.1, -0.5, -0.12).box(0.4, 0.26, 0.2, m.foilBlack, 0.014);
  open.move(0.4, -0.45, -0.1).box(0.2, 0.3, 0.18, m.foilGold, 0.014, 0xe0bc88);

  // -------------------------------------------------------------------------------------------
  // Upper deck: vault, dish, small sensors, forward thruster towers
  // -------------------------------------------------------------------------------------------
  // Electronics vault: a thick metal box with bolted walls, a blanket skirt, connectors and harness.
  const VH = 0.41;
  body.move(0, 0, ZT + 0.3).box(2 * VH, 2 * VH, 0.6, m.titanium, 0.02);
  for (const [x, y] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]] as const) body.strut([x * 1.45, y * 1.45, ZT], [x * 1.3, y * 1.3, ZT + 0.5], 0.014, m.aluminium);
  for (let k = 0; k < 4; k++) {
    const a = (k * 90) * DEG;
    const wall = body.face([Math.cos(a), Math.sin(a), 0], VH).move(0, ZT + 0.3, 0);
    coverPlate(wall.move(0, 0.07, 0), 0.7, 0.38, m.titanium, k % 2 === 0 ? 0xd9d6d0 : 0xc4c8cc, 0.075);
    quilt(wall.move(0, -0.215, 0), 0.8, 0.15, { cols: 3, rows: 1, mat: m.foilBlack, tints: BLACKS, thickness: 0.018, buttons: true, seed: 21 + k });
    if (k % 2 === 0) {
      wall.move(0.12, 0.07, 0.008).box(0.3, 0.2, 0.02, m.aluminium, 0.004);
      plugs(wall.move(-0.2, 0.16, 0.008), 3, 0.05);
      plugs(wall.move(-0.2, 0.08, 0.008), 3, 0.05);
    } else {
      plugs(wall.move(0, 0.16, 0.008), 6, 0.05);
      wall.move(0, 0.0, 0.008).box(0.46, 0.12, 0.03, m.paintBlack, 0.006);
    }
  }
  bolts(body.move(0, 0, ZT + 0.6), [-VH + 0.04, VH - 0.04], [VH - 0.04, VH - 0.04], 9);
  bolts(body.move(0, 0, ZT + 0.6), [-VH + 0.04, -VH + 0.04], [VH - 0.04, -VH + 0.04], 9);
  cable(body, [[VH + 0.008, -0.2, ZT + 0.44], [VH + 0.07, -0.21, ZT + 0.3], [VH + 0.1, -0.3, ZT + 0.08], [VH + 0.3, -0.5, ZT + 0.012]], 0.013, m.harness);
  cable(body, [[-0.15, VH + 0.008, ZT + 0.44], [-0.16, VH + 0.07, ZT + 0.3], [-0.3, VH + 0.12, ZT + 0.08], [-0.6, VH + 0.3, ZT + 0.012]], 0.011, m.cable);
  const Z_DISH = ZT + 0.78;
  const hga = b.assembly('hga').ctx().move(0, 0, Z_DISH);
  const d = dish(hga, { diameter: 2.5, fd: 0.4, gores: 20, seams: 3, back: m.foilBlack, ribs: 0, seg: 56 });
  const feed = cassegrain(hga, d, { subDiameter: 0.4, struts: 3, strutAt: 0.7, strutR: 0.014, hornR: 0.1, hornLen: 0.24, phase: 30 * DEG });
  lowGain(hga.move(0, 0, feed.topZ), 0.9, 0.05);
  const zBack = (r: number): number => Z_DISH + d.z(r) - d.thickness - 0.03;
  strutRing(body, 6, 0.5, ZT + 0.6, 0.8, zBack(0.8), 0.016, m.carbon, true);
  strutRing(body, 6, 1.3, ZT, 1.0, zBack(1.0), 0.016, m.carbon, true, 30 * DEG);
  body.add(lathe([[0.26, ZT + 0.6], [0.2, Z_DISH - 0.03, 1], [0.15, Z_DISH - 0.03]], 20), m.foilBlack);
  // Particle sensors on the edge of the upper deck.
  for (const deg of [30, 150, 270]) {
    const p = polar(AP - 0.16, deg * DEG, ZT);
    body.at(p).cyl(0.11, 0, 0.14, m.foilGold, 20, 0.01, 0xf0d4a0);
    body.at(p).cyl(0.13, 0.14, 0.2, m.aluminium, 20, 0.008);
    const q = polar(AP - 0.2, (deg + 24) * DEG, ZT + 0.06);
    body.at(q).box(0.2, 0.16, 0.12, m.foilBlack, 0.014);
    barrel(body.aim(q, vadd(q, polar(1, (deg + 24) * DEG, 0.5))).move(0, 0, 0.06), 0.035, 0.08, m.aluminium);
  }
  // Thruster towers: two up from the upper deck, two down from the lower deck.
  const tower = (deg: number, up: number): void => {
    const base = polar(RC - 0.12, deg * DEG, up * ZT);
    const tip: V3 = [base[0] * 1.02, base[1] * 1.02, up * (ZT + 1.25)];
    for (let k = 0; k < 3; k++) {
      const a = deg * DEG + (k * 120 + 60) * DEG;
      const foot: V3 = [base[0] + 0.14 * Math.cos(a), base[1] + 0.14 * Math.sin(a), up * ZT];
      body.strut(foot, [tip[0], tip[1], tip[2] - up * 0.1], 0.016, m.carbon, 8);
    }
    body.at([tip[0], tip[1], up * (ZT + 0.6)]).box(0.1, 0.1, 0.06, m.aluminium, 0.006);
    const tan = polar(1, (deg + 90) * DEG, 0);
    thrusterPod(body.at(tip), [[0, 0, up], tan, [-tan[0], -tan[1], 0], polar(1, deg * DEG, 0)], 0.024, m.foilBlack);
  };
  tower(60, 1);
  tower(240, 1);
  tower(120, -1);
  tower(300, -1);

  // -------------------------------------------------------------------------------------------
  // Lower deck: main engine with its cover, antennas and instruments
  // -------------------------------------------------------------------------------------------
  const aft = body.move(0, 0, -ZT).rotX(Math.PI);
  aft.add(lathe([[0.34, 0], [0.34, 0.3, 1], [0.32, 0.3]], 28), m.foilBlack);
  aft.add(lathe([[0.32, 0.3], [0.32, 0.02, 1]], 28), m.foilGold, { tint: 0xd8b078 });
  aft.add(lathe([[0.32, 0.02], [0, 0.02]], 28, { planarUv: true }), m.foilGold, { tint: 0xd8b078 });
  nozzle(aft.move(0, 0, -0.12), { exitR: 0.16, length: 0.3, throatR: 0.03, chamberR: 0.055, chamberLen: 0.1, seg: 28 });
  aft.move(0.36, 0, 0.3).rotY(1.1).move(0.34, 0, 0).cyl(0.34, -0.012, 0.012, m.foilBlack, 28, 0.004);
  aft.move(0.37, 0, 0.26).box(0.06, 0.16, 0.08, m.aluminium, 0.006);
  // Toroidal low-gain antenna on a mast.
  const tl = aft.at(polar(0.95, 200 * DEG, 0));
  tl.cyl(0.03, 0, 0.9, m.aluminium, 12);
  tl.add(lathe([[0.03, 0.9], [0.13, 0.94], [0.13, 1.08], [0.03, 1.12]], 20), m.paintWhite);
  tl.cyl(0.035, 1.12, 1.2, m.aluminium, 12);
  // Instruments on the lower deck.
  const ji = aft.at(polar(1.0, 60 * DEG, 0));
  ji.move(0, 0, 0.12).box(0.36, 0.3, 0.24, m.foilGold, 0.016, 0xe8c890);
  barrel(ji.move(0.05, 0, 0.2).rotY(0.6), 0.06, 0.16, m.paintBlack);
  ji.move(-0.2, 0, 0.2).box(0.02, 0.34, 0.3, m.paintWhite, 0.004);
  const uv = aft.at(polar(1.05, 330 * DEG, 0));
  uv.move(0, 0, 0.1).box(0.5, 0.22, 0.2, m.foilBlack, 0.014);
  uv.move(0.26, 0, 0.1).rotY(Math.PI / 2).add(plane(0.12, 0.14), m.glass);
  aft.at(polar(0.9, 110 * DEG, 0)).move(0, 0, 0.09).box(0.34, 0.4, 0.18, m.foilBlack, 0.014, 0xe0dcd4);
  // Lower deck blanket: six sectors with tape seams and fixing buttons, like the upper deck.
  for (let k = 0; k < 6; k++) {
    const a0 = 60 * k * DEG;
    const a1 = 60 * (k + 1) * DEG;
    const p0 = polar(RC - 0.05, a0, 0);
    const p1 = polar(RC - 0.05, a1, 0);
    aft.move(0, 0, 0.003).add(flatPolygon([[0, 0], [p0[0], p0[1]], [p1[0], p1[1]]]), m.foilBlack, { tint: BLACKS[(k + 1) % 3], uv: [3, 3, k * 0.41, k * 0.29] });
    aft.strut(polar(0.4, a0, 0.004), polar(RC - 0.06, a0, 0.004), 0.008, m.aluminium, 4, false, 0x8c8c90);
    bolts(aft.rotZ(a0 + 4 * DEG).move(0, 0, 0.003), [0.75, 0], [1.45, 0], 3);
  }
  // Plasma-wave antenna: two thin elements in a V, and a search coil.
  const wv = aft.at(polar(1.25, 270 * DEG, 0.08));
  wv.box(0.2, 0.2, 0.16, m.foilGold, 0.014, 0xeccc98);
  whip(wv.aim([0, 0, 0.06], [1.2, -0.9, 0.9]), 2.8, 0.008);
  whip(wv.aim([0, 0, 0.06], [-1.2, -0.9, 0.9]), 2.8, 0.008);
  aft.at(polar(1.2, 250 * DEG, 0.1)).rotY(Math.PI / 2).cyl(0.02, -0.25, 0.25, m.paintWhite, 10);

  cable(body, [polar(0.6, 100 * DEG, ZT + 0.01), polar(0.5, 80 * DEG, ZT + 0.06), polar(0.43, 60 * DEG, ZT + 0.3), polar(0.3, 40 * DEG, ZT + 0.62)], 0.014, m.harness);

  // -------------------------------------------------------------------------------------------
  // Three solar wings
  // -------------------------------------------------------------------------------------------
  wing(b, 'wing_a', 90, 3, true);
  wing(b, 'wing_b', 210, 4, false);
  wing(b, 'wing_c', 330, 4, false);

  // About 2 revolutions per minute about the dish axis.
  return { boresight: [0, 0, 1], spin: { axis: [0, 0, 1], rate: (2 * Math.PI * 2) / 60 } };
}

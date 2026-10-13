/**
 * "Apsis" deep-space bus: an ORIGINAL design for the missions that the user makes.
 * It is not a copy of a real spacecraft.
 *
 * Eight-sided bus (2 m high) with gold and black blanket panels, a 2 m dish on a strut mount, two
 * solar wings of three panels each on yokes, a gridded ion engine on a gimbal inside the launch
 * adapter ring, eight chemical thruster pods, a lattice instrument boom, mirror radiators and
 * louvers, a science telescope and two star trackers.
 *
 * Axes: +Z = dish boresight, wings along +X and -X, science side +Y, instrument boom along -Y,
 * ion engine at -Z.
 */
import type { Builder, Ctx, ModelSpec } from './builder';
import { extrude, flatPolygon, lathe, plane, polar, polygon, sphere, vadd } from './geometry';
import type { P2, V3 } from './geometry';
import { barrel, cable, cassegrain, dish, flange, hinge, horn, louvers, lowGain, nozzle, quilt, solarPanel, starTracker, strutRing, thrusterPod, trussBoom } from './parts';

const DEG = Math.PI / 180;
const HW = 0.85; // half width across the main faces
const CH = 0.25; // size of the corner chamfer
const ZB = 1.0; // half height of the bus
const ZW = 0.2; // height of the wing axis

function wing(b: Builder, name: string, turn: number): void {
  const m = b.mat;
  const w = b.assembly(name).ctx().rotZ(turn).move(0, 0, ZW);
  // Drive drum at the bus wall, then the yoke.
  w.rotY(Math.PI / 2).cyl(0.1, HW, HW + 0.13, m.aluminium, 24, 0.01);
  w.rotY(Math.PI / 2).cyl(0.06, HW + 0.13, HW + 0.24, m.titanium, 20, 0.006);
  const X0 = 1.78;
  const apex: V3 = [HW + 0.22, 0, 0];
  for (const sy of [-1, 1]) {
    w.strut(apex, [X0, 0.72 * sy, -0.012], 0.022, m.carbon, 8);
    hinge(w.move(X0, 0.72 * sy, -0.012).rotZ(Math.PI / 2), 0.14, 0.018);
  }
  w.strut([X0 - 0.38, 0.32, -0.008], [X0 - 0.38, -0.32, -0.008], 0.016, m.carbon, 8);
  w.at(apex).box(0.1, 0.16, 0.08, m.aluminium, 0.01);
  cable(w, [[HW + 0.2, 0.05, -0.03], [X0 - 0.4, 0.34, -0.035], [X0 + 0.04, 0.66, -0.045]], 0.01, m.cable);
  const PW = 1.3;
  const PH = 2.3;
  const PITCH = PW + 0.05;
  for (let k = 0; k < 3; k++) {
    const x = X0 + 0.02 + PW / 2 + PITCH * k;
    solarPanel(w.move(x, 0, 0), { w: PW, h: PH, cols: 20, rows: 36, blocksX: 2, blocksY: 3, ribsX: 3, ribsY: 4, thickness: 0.024 });
    if (k > 0) {
      for (const y of [-0.8, 0, 0.8]) hinge(w.move(x - PW / 2 - 0.025, y, -0.012).rotZ(Math.PI / 2), 0.14, 0.016);
    }
    cable(w, [[x - PW / 2 + 0.03, 0.62, -0.05], [x, 0.66, -0.055], [x + PW / 2 - 0.03, 0.62, -0.05]], 0.009, m.cable);
    // Hold-down points on the cell side.
    for (const [hx, hy] of [[-0.3, -0.6], [0.3, -0.6], [-0.3, 0.6], [0.3, 0.6]] as const) {
      w.move(x + hx, hy, 0.012).cyl(0.03, 0, 0.006, m.aluminium, 8);
    }
  }
}

export function buildApsis(b: Builder): ModelSpec {
  const m = b.mat;
  const bus = b.assembly('bus').ctx();

  // -------------------------------------------------------------------------------------------
  // Bus: eight-sided body with blanket panels
  // -------------------------------------------------------------------------------------------
  const E = HW - CH;
  const outline: P2[] = [[HW, -E], [HW, E], [E, HW], [-E, HW], [-HW, E], [-HW, -E], [-E, -HW], [E, -HW]];
  bus.add(extrude(outline, -ZB, ZB, 0.02), m.foilBlack);
  const face = (dir: V3, dist = HW): Ctx => bus.face(dir, dist);
  const BLACKS = [0xffffff, 0xe2e2ee, 0xd2d2dc] as const;
  // +X and -X: gold panels above, black below.
  for (const sx of [-1, 1]) {
    const f = face([sx, 0, 0]);
    quilt(f.move(0, 0.42, 0), 1.12, 1.08, { cols: 3, rows: 3, buttons: true, seed: 3 + sx });
    quilt(f.move(0, -0.56, 0), 1.12, 0.8, { cols: 3, rows: 2, mat: m.foilBlack, tints: BLACKS, buttons: true, seed: 6 + sx });
    f.move(0, -0.13, 0.012).box(1.14, 0.03, 0.014, m.aluminium, 0.003);
    f.move(-0.36 * sx, -0.5, 0.02).box(0.26, 0.4, 0.04, m.foilGold, 0.014, 0xe8c890);
  }
  // +Y: science side. -Y: radiator side.
  const sci = face([0, 1, 0]);
  quilt(sci, 1.12, 1.9, { cols: 2, rows: 4, mat: m.foilBlack, tints: BLACKS, buttons: true, seed: 11 });
  louvers(sci.move(0.3, -0.62, 0.02), 0.44, 0.52, 10);
  louvers(sci.move(-0.3, -0.62, 0.02), 0.44, 0.52, 10);
  const radSide = face([0, -1, 0]);
  quilt(radSide, 1.12, 1.9, { cols: 2, rows: 4, mat: m.foilBlack, tints: BLACKS, buttons: true, seed: 13 });
  radSide.move(0, -0.28, 0.022).box(1.02, 1.2, 0.016, m.paintWhite, 0.004);
  radSide.move(0, -0.28, 0.0315).add(plane(0.98, 1.16), m.mirror, { uv: [3, 3.5] });
  louvers(radSide.move(-0.28, 0.62, 0.02), 0.42, 0.4, 8);
  louvers(radSide.move(0.28, 0.62, 0.02), 0.42, 0.4, 8);
  // Chamfer faces: gold strips, sun sensors, thruster pods at the top and at the bottom.
  for (let k = 0; k < 4; k++) {
    const a = (45 + 90 * k) * DEG;
    const dir: V3 = [Math.cos(a), Math.sin(a), 0];
    const dist = (HW + E) / Math.SQRT2;
    const f = face(dir, dist);
    quilt(f, 0.3, 1.9, { cols: 1, rows: 4, tints: k % 2 === 0 ? [0xf6deb6, 0xeed2a2] : [0xe8c690, 0xf4dcb4], buttons: true, seed: 20 + k });
    f.move(0, 0.3, 0.03).box(0.08, 0.08, 0.05, m.aluminium, 0.006);
    f.move(0, 0.3, 0.056).add(plane(0.05, 0.05), m.glass);
    const tan: V3 = [-Math.sin(a), Math.cos(a), 0];
    for (const sz of [-1, 1]) {
      const p: V3 = [dir[0] * (dist + 0.1), dir[1] * (dist + 0.1), sz * 0.86];
      bus.strut([dir[0] * dist, dir[1] * dist, sz * 0.86], p, 0.02, m.aluminium, 8);
      thrusterPod(bus.at(p), [[0, 0, sz], tan, [-tan[0], -tan[1], 0], dir], 0.022, m.foilBlack);
    }
  }
  // Edge trims.
  for (let k = 0; k < 8; k++) {
    const p = outline[k];
    const q = outline[(k + 1) % 8];
    for (const z of [-ZB, ZB]) bus.strut([p[0], p[1], z], [q[0], q[1], z], 0.008, m.titanium, 4, false);
    bus.strut([p[0], p[1], -ZB], [p[0], p[1], ZB], 0.007, m.titanium, 4, false);
  }
  // Decks.
  const deck = outline.map((p): P2 => [p[0] * 0.95, p[1] * 0.95]);
  bus.move(0, 0, ZB + 0.004).add(flatPolygon(deck), m.foilGold, { tint: 0xf2d8ac, uv: [3, 3] });
  bus.move(0, 0, -ZB - 0.004).add(flatPolygon(deck, 0, false), m.foilBlack, { uv: [3, 3] });
  // Blanket panels on the two decks: a wide centre part and two side strips.
  const DECK = [0xf2d8ac, 0xe6c692, 0xf8e2bc] as const;
  const topDeck = bus.move(0, 0, ZB + 0.006);
  quilt(topDeck, 2 * E - 0.02, 2 * HW - 0.08, { cols: 3, rows: 4, tints: DECK, buttons: true, seed: 31 });
  for (const sx of [-1, 1]) quilt(topDeck.move((sx * (HW + E)) / 2, 0, 0), HW - E - 0.05, 2 * E - 0.04, { cols: 1, rows: 3, tints: DECK, buttons: true, seed: 33 + sx });
  const lowDeck = bus.move(0, 0, -ZB - 0.006).rotX(Math.PI);
  quilt(lowDeck, 2 * E - 0.02, 2 * HW - 0.08, { cols: 3, rows: 4, mat: m.foilBlack, tints: BLACKS, buttons: true, seed: 37 });
  for (const sx of [-1, 1]) quilt(lowDeck.move((sx * (HW + E)) / 2, 0, 0), HW - E - 0.05, 2 * E - 0.04, { cols: 1, rows: 3, mat: m.foilBlack, tints: BLACKS, buttons: true, seed: 39 + sx });

  // -------------------------------------------------------------------------------------------
  // Science side: telescope, wide camera, spectrometer, two star trackers
  // -------------------------------------------------------------------------------------------
  const ins = b.assembly('instruments').ctx();
  const sf = ins.face([0, 1, 0], HW + 0.02); // local +Z = model +Y, local +Y = model +Z, local +X = model -X
  const tel = sf.move(0.2, 0.5, 0);
  tel.move(0, 0, 0.12).box(0.36, 0.36, 0.24, m.foilGold, 0.018, 0xf2d6a6);
  barrel(tel.move(0, 0, 0.22), 0.15, 0.5, m.paintWhite, 0.2);
  tel.move(0, 0, 0.5).add(lathe([[0.152, -0.02], [0.165, -0.02, 1], [0.165, 0.02, 1], [0.152, 0.02]], 28), m.aluminium);
  tel.move(0.2, 0, 0.3).box(0.02, 0.4, 0.5, m.paintWhite, 0.004);
  tel.move(0.2105, 0, 0.3).rotY(Math.PI / 2).add(plane(0.46, 0.36), m.mirror, { uv: [2, 1.5] });
  const cam = sf.move(-0.3, 0.6, 0);
  cam.move(0, 0, 0.08).box(0.2, 0.2, 0.16, m.foilBlack, 0.014);
  barrel(cam.move(0, 0, 0.15), 0.065, 0.2, m.paintWhite, 0.06);
  const spec = sf.move(-0.28, 0.16, 0);
  spec.move(0, 0, 0.1).box(0.34, 0.26, 0.2, m.foilGold, 0.016, 0xe4c28c);
  spec.move(0.02, 0, 0.21).box(0.14, 0.1, 0.06, m.paintBlack, 0.004);
  spec.move(0.02, 0, 0.242).add(plane(0.1, 0.07), m.glass);
  starTracker(ins.aim([0.55, HW + 0.06, 0.82], [1.6, 2.4, 2.2]), 1.0, m.foilGold);
  starTracker(ins.aim([-0.55, HW + 0.06, 0.82], [-1.6, 2.4, 2.2]), 1.0, m.foilGold);
  ins.at([0.55, HW + 0.03, 0.8]).box(0.2, 0.08, 0.2, m.aluminium, 0.01);
  ins.at([-0.55, HW + 0.03, 0.8]).box(0.2, 0.08, 0.2, m.aluminium, 0.01);

  // -------------------------------------------------------------------------------------------
  // Top deck: dish on a strut mount, horn antenna, low-gain antenna
  // -------------------------------------------------------------------------------------------
  const Z_DISH = ZB + 0.44;
  const hga = b.assembly('hga').ctx().move(0, 0, Z_DISH);
  const d = dish(hga, { diameter: 2.0, fd: 0.38, gores: 16, seams: 3, back: m.carbon, ribs: 16, ribDepth: 0.09, ribMat: m.carbon, backRings: [0.55, 0.93], seg: 64 });
  const feed = cassegrain(hga, d, { subDiameter: 0.34, struts: 3, strutAt: 0.66, strutR: 0.011, hornR: 0.085, hornLen: 0.2, phase: 90 * DEG, strutMat: m.carbon });
  lowGain(hga.move(0, 0, feed.topZ), 0.8, 0.04);
  const zBack = (r: number): number => Z_DISH + d.z(r) - d.thickness - 0.05;
  strutRing(bus, 6, 0.5, ZB, 0.55, zBack(0.55), 0.018, m.carbon, true);
  bus.add(lathe([[0.5, ZB], [0.56, ZB, 1], [0.56, ZB + 0.03, 1], [0.5, ZB + 0.03]], 32), m.aluminium);
  bus.add(lathe([[0.12, ZB], [0.1, Z_DISH - 0.02, 1], [0.07, Z_DISH - 0.02]], 16), m.foilGold, { tint: 0xe6c690 });
  bus.at([0.3, -0.2, ZB + 0.06]).box(0.22, 0.26, 0.12, m.foilGold, 0.014, 0xe8ca96);
  cable(bus, [[0.3, -0.08, ZB + 0.1], [0.2, -0.02, ZB + 0.2], [0.11, 0, ZB + 0.3]], 0.012, m.harness);
  const mg = bus.at([-0.62, 0.62, ZB]);
  mg.cyl(0.035, 0, 0.16, m.aluminium, 12);
  horn(mg.move(0, 0, 0.16), 0.04, 0.12, 0.26, m.paintWhite);
  lowGain(bus.at([0.62, -0.62, ZB]), 1.0, 0.2);

  // -------------------------------------------------------------------------------------------
  // Propulsion: launch adapter ring, gimballed ion engine, pressure tanks, four axial engines
  // -------------------------------------------------------------------------------------------
  const prop = b.assembly('propulsion').ctx().move(0, 0, -ZB).rotX(Math.PI); // local +Z = model -Z
  flange(prop, 0.58, 0.63, 0.1, m.aluminium, 48);
  prop.add(lathe([[0.58, 0.1], [0.58, 0.0]], 48), m.aluminium);
  // Gold closeout blanket inside the ring. It lies above the black blankets of the lower deck.
  prop.move(0, 0, 0.03).add(flatPolygon(polygon(32, 0.58)), m.foilGold, { tint: 0xd8b078, uv: [2, 2] });
  // Gimbal ring and three actuators.
  prop.add(lathe([[0.3, 0.1], [0.34, 0.1, 1], [0.34, 0.14, 1], [0.3, 0.14, 1], [0.3, 0.1]], 32), m.titanium);
  for (let k = 0; k < 3; k++) {
    const a = (90 + 120 * k) * DEG;
    prop.strut(polar(0.5, a + 0.5, 0.01), polar(0.32, a, 0.12), 0.016, m.aluminium, 8);
    prop.strut(polar(0.5, a - 0.5, 0.01), polar(0.32, a, 0.12), 0.016, m.aluminium, 8);
  }
  // Engine body, plasma screen, grid, neutraliser.
  const eng = prop.move(0, 0, 0.1);
  eng.add(lathe([[0, 0], [0.2, 0, 2], [0.23, 0.03], [0.23, 0.3, 1], [0.275, 0.4, 1], [0.275, 0.42, 1], [0.215, 0.42]], 40), m.foilBlack);
  eng.add(lathe([[0.215, 0.42], [0.215, 0.395, 1], [0, 0.395]], 40), m.titanium);
  eng.move(0, 0, 0.3975).add(flatPolygon(polygon(40, 0.205)), m.ionGrid, { uv: [6, 6] });
  eng.add(lathe([[0.232, 0.1], [0.245, 0.1, 1], [0.245, 0.13, 1], [0.232, 0.13]], 40), m.aluminium);
  for (let k = 0; k < 12; k++) {
    const a = (30 * k + 15) * DEG;
    eng.strut(polar(0.236, a, 0.3), polar(0.277, a, 0.4), 0.005, m.aluminium, 4, false);
  }
  const nt = eng.at(polar(0.3, 35 * DEG, 0.3));
  nt.box(0.07, 0.07, 0.1, m.aluminium, 0.008);
  nt.aim([0, 0, 0.04], [-0.5, -0.35, 1]).cyl(0.017, 0, 0.14, m.titanium, 10);
  cable(prop, [polar(0.45, 200 * DEG, 0.01), polar(0.4, 215 * DEG, 0.12), polar(0.27, 228 * DEG, 0.2), polar(0.235, 240 * DEG, 0.16)], 0.011, m.harness);
  cable(prop, [polar(0.45, 20 * DEG, 0.01), polar(0.42, 30 * DEG, 0.16), polar(0.33, 36 * DEG, 0.32)], 0.008, m.cable);
  // Two pressure tanks beside the ring and four axial engines at the corners.
  for (const a of [135, 315]) {
    prop.at(polar(0.86, a * DEG, 0.02)).add(sphere(0.17, 20, 10), m.titanium);
    prop.at(polar(0.86, a * DEG, 0.02)).add(lathe([[0.172, -0.015], [0.184, -0.015, 1], [0.184, 0.015, 1], [0.172, 0.015]], 20), m.aluminium);
  }
  for (const [x, y] of [[0.62, 0.3], [-0.62, 0.3], [0.62, -0.3], [-0.62, -0.3]] as const) {
    const e = prop.move(x, y, 0.0);
    e.cyl(0.07, 0, 0.03, m.aluminium, 16);
    nozzle(e.move(0, 0, 0.03), { exitR: 0.055, length: 0.11, throatR: 0.012, chamberR: 0.024, chamberLen: 0.05, seg: 20 });
  }
  lowGain(prop.at(polar(0.9, 225 * DEG, 0)), 0.9, 0.1);

  // -------------------------------------------------------------------------------------------
  // Lattice instrument boom along -Y with two sensors
  // -------------------------------------------------------------------------------------------
  const boomAsm = b.assembly('instrument_boom');
  const root: V3 = [0.36, -HW - 0.02, 0.86];
  const bm = boomAsm.ctx().aim(root, vadd(root, [0, -1, 0]));
  bm.move(0, 0, 0.03).box(0.2, 0.18, 0.08, m.aluminium, 0.012);
  hinge(bm.move(0, -0.1, 0.07), 0.16, 0.02);
  const BL = 2.8;
  trussBoom(bm.move(0, 0, 0.08), { length: BL, width: 0.13, endWidth: 0.09, bays: 14, longeron: 0.009, batten: 0.006, diagonal: 0.004, mat: m.carbon, cross: true, phase: 90 * DEG });
  for (const f of [0.55, 1]) {
    const q = bm.move(0, 0, 0.08 + BL * f);
    q.box(0.15, 0.15, 0.014, m.aluminium, 0.003);
    q.move(0, 0.1, 0.02).box(0.1, 0.1, 0.1, m.foilGold, 0.012, 0xf0d6aa);
    q.move(0, 0.1, 0.02).rotY(Math.PI / 2).cyl(0.032, -0.09, 0.09, m.paintWhite, 14, 0.004);
  }
  cable(bm, [[0.02, 0.05, 0.05], [0.03, 0.045, BL * 0.5], [0.02, 0.04, BL + 0.06]], 0.006, m.harness);

  // -------------------------------------------------------------------------------------------
  // Two solar wings
  // -------------------------------------------------------------------------------------------
  wing(b, 'wing_pos', 0);
  wing(b, 'wing_neg', Math.PI);

  return { boresight: [0, 0, 1], spin: null };
}

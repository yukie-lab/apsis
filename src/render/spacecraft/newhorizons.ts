/**
 * New Horizons class flyby probe (original procedural model).
 *
 * Flat triangular ("piano-shaped") gold bus about 2.7 m wide and 0.68 m thick, a 2.1 m dish on
 * top with a medium-gain dish and a low-gain antenna on its feed, and one radioisotope
 * generator that sticks out from the narrow corner.
 *
 * Axes: +Z = dish boresight, +X = generator, -X = wide instrument side.
 */
import type { Builder, ModelSpec } from './builder';
import { disc, extrude, flatPolygon, lathe, plane, polar } from './geometry';
import type { P2, V3 } from './geometry';
import { barrel, cable, cassegrain, dish, flange, louvers, lowGain, quilt, rtg, starTracker, strutRing, thrusterPod } from './parts';

const DEG = Math.PI / 180;

export function buildNewHorizons(b: Builder): ModelSpec {
  const m = b.mat;

  // -------------------------------------------------------------------------------------------
  // Bus
  // -------------------------------------------------------------------------------------------
  const bus = b.assembly('bus').ctx();
  const T = 0.68;
  const H = T / 2;
  const outline: P2[] = [
    [-0.95, -1.15], [-0.73, -1.37], [-0.45, -1.37], [1.16, -0.38],
    [1.16, 0.38], [-0.45, 1.37], [-0.73, 1.37], [-0.95, 1.15],
  ];
  bus.add(extrude(outline, -H, H, 0.022), m.foilGold);
  // Blanket panels on the two decks, in slightly different tones.
  const inner = (s: number, dx: number): P2[] => outline.map((p) => [p[0] * s + dx, p[1] * s]);
  bus.move(0, 0, H + 0.004).add(flatPolygon(inner(0.9, 0.02)), m.foilGold, { tint: 0xf6dcb0, uv: [4, 5] });
  bus.move(0, 0, -H - 0.004).add(flatPolygon(inner(0.9, 0.02), 0, false), m.foilGold, { tint: 0xe9c690, uv: [4, 5] });
  // Seam strips over the decks.
  for (const x of [-0.35, 0.35]) {
    const half = x < 0 ? 1.28 : 0.86;
    bus.move(x, 0, H + 0.008).box(0.03, half * 2, 0.008, m.foilAmber, 0.002);
    bus.move(x, 0, -H - 0.008).box(0.03, half * 2, 0.008, m.foilAmber, 0.002);
  }
  // Side blankets: separate panels with fixing buttons.
  const back = bus.face([-1, 0, 0], 0.95); // local +X = model -Y, local +Y = model +Z
  quilt(back.move(0, 0, 0.002), 2.24, 0.6, { cols: 5, rows: 1, buttons: true, seed: 3 });
  for (const sy of [-1, 1]) {
    const mid: V3 = [0.355, 0.875 * sy, 0];
    const nrm: V3 = [0.5237, 0.8519 * sy, 0];
    const sidePanel = bus.aim(mid, [mid[0] + nrm[0], mid[1] + nrm[1], 0]);
    quilt(sidePanel.move(0, 0, 0.002), 1.76, 0.6, { cols: 4, rows: 2, buttons: true, seed: sy > 0 ? 5 : 8 });
    louvers(sidePanel.move(0.45 * sy, 0, 0.02), 0.4, 0.34, 8);
    // Fill and drain valves on a small plate, and a connector panel.
    const valves = sidePanel.move(-0.5 * sy, -0.1, 0.02);
    valves.box(0.22, 0.12, 0.012, m.aluminium, 0.003);
    for (const vx of [-0.06, 0, 0.06]) {
      valves.move(vx, 0, 0.006).cyl(0.016, 0, 0.035, m.titanium, 10, 0.003);
      valves.move(vx, 0, 0.041).cyl(0.011, 0, 0.012, m.goldPlate, 8);
    }
    sidePanel.move(-0.05 * sy, 0.16, 0.022).box(0.16, 0.07, 0.016, m.paintBlack, 0.003);
    for (const cx of [-0.045, 0, 0.045]) sidePanel.move(-0.05 * sy + cx, 0.16, 0.03).cyl(0.014, 0, 0.02, m.aluminium, 10, 0.002);
  }
  // Blankets on the upper deck beside the dish, and on the narrow end.
  const DECK = [0xf6dcb0, 0xe8c890, 0xfbe6c2] as const;
  quilt(bus.move(-0.62, 0, H + 0.006), 0.56, 2.3, { cols: 1, rows: 4, seed: 11, tints: DECK });
  quilt(bus.move(0, 0, H + 0.006), 0.62, 1.74, { cols: 2, rows: 4, buttons: true, seed: 15, tints: DECK });
  quilt(bus.move(0.74, 0, H + 0.006), 0.7, 0.8, { cols: 2, rows: 2, buttons: true, seed: 17, tints: DECK });
  quilt(bus.face([1, 0, 0], 1.16).move(0, 0, 0.002), 0.7, 0.6, { cols: 2, rows: 1, buttons: true, seed: 13 });
  // Sun sensors on the edge of the upper deck.
  for (const sy of [-1, 1]) {
    const ss = bus.at([0.3, 0.84 * sy, H + 0.04]);
    ss.box(0.09, 0.09, 0.08, m.aluminium, 0.008);
    ss.move(0, 0, 0.041).add(plane(0.05, 0.05), m.glass);
  }

  // Launch adapter ring, louvers and the flat dust detector on the lower deck.
  const under = bus.move(0, 0, -H).rotX(Math.PI);
  const BELLY = [0xe9c690, 0xdcb880, 0xf2d2a0] as const;
  quilt(under.move(-0.62, 0, 0.006), 0.56, 2.3, { cols: 1, rows: 5, buttons: true, seed: 31, tints: BELLY });
  quilt(under.move(0, 0, 0.006), 0.62, 1.74, { cols: 2, rows: 4, buttons: true, seed: 33, tints: BELLY });
  quilt(under.move(0.74, 0, 0.006), 0.7, 0.8, { cols: 2, rows: 2, buttons: true, seed: 35, tints: BELLY });
  flange(under.move(0.1, 0, 0), 0.42, 0.47, 0.09, m.aluminium, 40);
  under.move(0.1, 0, 0.03).add(disc(0.42, 40), m.foilBlack, { uv: [2, 2] });
  louvers(under.move(-0.55, 0.62, 0.024), 0.42, 0.32, 8);
  louvers(under.move(-0.55, -0.62, 0.024), 0.42, 0.32, 8);
  under.move(0.78, 0, 0.034).box(0.46, 0.32, 0.028, m.aluminium, 0.004);
  under.move(0.78, 0, 0.05).add(plane(0.42, 0.28), m.ionGrid, { uv: [6, 4] });

  // -------------------------------------------------------------------------------------------
  // Remote sensing instruments on the wide side (-X)
  // -------------------------------------------------------------------------------------------
  const ins = b.assembly('instruments').ctx();
  const face = ins.face([-1, 0, 0], 0.95);
  // Long-range imager: an opening in the side panel with its door open.
  const lorri = face.move(0.52, 0.02, 0.016);
  flange(lorri, 0.115, 0.15, 0.03, m.aluminium, 28);
  lorri.add(lathe([[0.115, 0.03], [0.115, -0.2, 1], [0, -0.2]], 28), m.paintBlack);
  lorri.move(0, 0, -0.19).add(disc(0.1, 24), m.glass);
  // The blanket of the wall closes the tube: a dark aperture disc and the front lens above it.
  lorri.move(0, 0, 0.006).add(disc(0.114, 28), m.paintBlack);
  lorri.move(0, 0, 0.009).add(disc(0.075, 24), m.glass);
  lorri.move(0.15, 0, 0.03).rotY(-1.9).move(0.14, 0, 0).cyl(0.14, -0.012, 0.012, m.foilGold, 28, 0.004);
  lorri.move(0.16, 0, 0.02).box(0.03, 0.1, 0.04, m.aluminium, 0.004);
  // Colour imager and infrared spectrometer: a box with a baffle and a radiator.
  const ralph = face.move(-0.58, 0.04, 0.016);
  ralph.move(0, 0, 0.19).box(0.42, 0.38, 0.38, m.foilGold, 0.018, 0xf2d6a6);
  barrel(ralph.move(0.04, 0.02, 0.36), 0.085, 0.22, m.foilGold, 0.1);
  ralph.move(-0.24, 0.02, 0.3).box(0.02, 0.44, 0.5, m.paintWhite, 0.004);
  ralph.move(-0.252, 0.02, 0.3).rotY(-Math.PI / 2).add(plane(0.46, 0.4), m.mirror, { uv: [2, 2] });
  // Ultraviolet spectrometer.
  const alice = face.move(-0.05, 0.08, 0.016);
  alice.move(0, 0, 0.11).box(0.34, 0.2, 0.22, m.foilBlack, 0.014);
  alice.move(0.08, 0.0, 0.26).box(0.1, 0.12, 0.1, m.aluminium, 0.006);
  alice.move(0.08, 0.0, 0.312).add(plane(0.06, 0.08), m.glass);

  // Particle instruments on the upper deck.
  const pep = ins.move(-0.62, 1.02, H);
  pep.strut([0, 0, 0], [0.04, 0.06, 0.2], 0.018, m.aluminium);
  pep.move(0.04, 0.06, 0.24).rotX(0.5).cyl(0.1, -0.035, 0.035, m.foilGold, 24, 0.008, 0xf4dab0);
  pep.move(0.04, 0.06, 0.24).rotX(0.5).cyl(0.045, 0.035, 0.07, m.aluminium, 16, 0.004);
  const swap = ins.move(-0.72, -0.98, H);
  swap.cyl(0.05, 0, 0.1, m.aluminium, 14);
  swap.add(lathe([[0, 0.1], [0.1, 0.1, 1], [0.1, 0.2, 1], [0.05, 0.27], [0, 0.28]], 24), m.foilGold, { tint: 0xeed0a0 });
  swap.add(lathe([[0.101, 0.13], [0.108, 0.13, 1], [0.108, 0.17, 1], [0.101, 0.17]], 24), m.paintBlack);

  // Star trackers on one sloping side, looking out and down.
  starTracker(ins.aim([0.55, -0.82, -0.12], [1.2, -2.0, -0.9]), 0.85, m.foilGold);
  starTracker(ins.aim([0.2, -1.03, -0.12], [0.5, -2.2, -1.1]), 0.85, m.foilGold);

  // Thruster pods at the corners of the wide side and near the narrow corner.
  // Each pod stands on a bracket of two short tubes.
  for (const [x, y] of [[-0.97, 1.3], [-0.97, -1.3], [1.12, 0.46], [1.12, -0.46]] as const) {
    const sy = Math.sign(y);
    const sx = x < 0 ? -1 : 1;
    for (const sz of [-1, 1]) {
      const p: V3 = [x, y, sz * (H + 0.03)];
      ins.strut([x - sx * 0.14, y - sy * 0.02, sz * (H - 0.03)], p, 0.016, m.aluminium, 8);
      ins.strut([x - sx * 0.02, y - sy * 0.16, sz * (H - 0.03)], p, 0.016, m.aluminium, 8);
      thrusterPod(ins.at(p), [[0, 0, sz], [0, sy, 0], [sx, 0, 0]], 0.018);
    }
  }

  // -------------------------------------------------------------------------------------------
  // High-gain antenna with the stacked medium-gain and low-gain antennas
  // -------------------------------------------------------------------------------------------
  const DX = 0.08;
  const Z_DISH = H + 0.3;
  const hga = b.assembly('hga').ctx().move(DX, 0, Z_DISH);
  const d = dish(hga, { diameter: 2.1, fd: 0.4, gores: 18, seams: 3, back: m.foilGold, ribs: 0, seg: 56 });
  const feed = cassegrain(hga, d, { subDiameter: 0.36, struts: 3, strutAt: 0.72, strutR: 0.012, hornR: 0.09, hornLen: 0.2, phase: 60 * DEG, strutMat: m.carbon });
  // Medium-gain dish above the subreflector, then the low-gain antenna.
  const mga = hga.move(0, 0, feed.topZ);
  mga.cyl(0.035, 0, 0.1, m.aluminium, 12);
  const md = dish(mga.move(0, 0, 0.1), { diameter: 0.34, fd: 0.36, gores: 8, seams: 1, thickness: 0.01, seg: 28 });
  mga.cyl(0.012, 0.1, 0.1 + md.focal * 0.9, m.aluminium, 8);
  mga.move(0, 0, 0.1 + md.focal * 0.9).cyl(0.03, 0, 0.02, m.paintWhite, 12);
  lowGain(mga.move(0, 0, 0.1 + md.focal * 0.9 + 0.02), 0.7, 0.04);
  // Support of the dish: a ring of struts and a central column on the upper deck.
  const zBack = (r: number): number => 0.3 + d.z(r) - d.thickness - 0.03;
  const top = bus.move(DX, 0, H);
  strutRing(top, 6, 0.36, 0, 0.62, zBack(0.62), 0.015, m.carbon, true);
  top.add(lathe([[0.2, 0], [0.16, 0.27, 1], [0.12, 0.27]], 20), m.foilGold, { tint: 0xe6c692 });
  cable(top, [[-0.3, 0.3, 0.01], [-0.2, 0.18, 0.05], [-0.16, 0.08, 0.2], [-0.1, 0.02, 0.27]], 0.012, m.harness);
  top.move(-0.48, -0.42, 0.05).box(0.28, 0.2, 0.1, m.foilBlack, 0.014);
  top.move(-0.5, 0.45, 0.04).box(0.2, 0.26, 0.08, m.foilGold, 0.014, 0xe4c08a);

  // -------------------------------------------------------------------------------------------
  // Radioisotope generator on its mount (+X)
  // -------------------------------------------------------------------------------------------
  const g = b.assembly('generator').ctx().aim([1.16, 0, 0], [3, 0, 0]);
  g.add(lathe([[0.31, -0.01], [0.31, 0.02, 1], [0.17, 0.36, 1], [0.17, 0.4]], 28), m.foilGold, { tint: 0xe8c48c });
  strutRing(g, 4, 0.33, 0.0, 0.2, 0.38, 0.014, m.titanium, true, 45 * DEG);
  g.cyl(0.33, 0.4, 0.425, m.aluminium, 36, 0.006);
  g.move(0, 0, 0.428).add(disc(0.3, 36), m.foilAmber, { uv: [2, 2] });
  rtg(g.move(0, 0, 0.47).rotZ(22.5 * DEG), { length: 1.1, coreR: 0.11, finR: 0.21, fins: 8, finT: 0.007, finSpan: 0.9, tubes: true });
  cable(g, [polar(0.28, 100 * DEG, 0.0), polar(0.2, 95 * DEG, 0.3), polar(0.14, 95 * DEG, 0.5)], 0.011, m.cable);

  return { boresight: [0, 0, 1], spin: null };
}

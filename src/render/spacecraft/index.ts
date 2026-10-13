/**
 * Original procedural spacecraft models for Apsis.
 *
 * All geometry and all textures are made in code. The models contain no logo and no text.
 * Axes of every model: +Z = boresight of the high-gain antenna, +Y = up. Units: metres.
 *
 * Two models have parts that a caller can treat in a special way:
 * - 'galileo' returns `spin: null`. Its group "galileo/spun" can turn about +Z (about 3 rpm) while
 *   the group "galileo/despun" stays fixed.
 * - 'ulysses' has very long wire antennas. Its `radius` does not cover them (see `ulysses.ts`).
 */
import * as THREE from 'three';
import { buildApsis } from './apsis';
import { Builder } from './builder';
import type { ModelSpec } from './builder';
import { buildCassini } from './cassini';
import { buildGalileo } from './galileo';
import { buildJuno } from './juno';
import { buildMarsCruise } from './marscruise';
import { buildNewHorizons } from './newhorizons';
import { buildPioneer } from './pioneer';
import { buildUlysses } from './ulysses';
import { buildVoyager } from './voyager';

export type SpacecraftKind =
  | 'voyager'
  | 'cassini'
  | 'newhorizons'
  | 'juno'
  | 'galileo'
  | 'pioneer'
  | 'marscruise'
  | 'apsis'
  | 'ulysses';

export const SPACECRAFT_KINDS: SpacecraftKind[] = [
  'voyager',
  'cassini',
  'newhorizons',
  'juno',
  'galileo',
  'pioneer',
  'marscruise',
  'apsis',
  'ulysses',
];

export interface SpacecraftModel {
  kind: SpacecraftKind;
  /** Root object. Units: metres. Origin: centre of the main bus. */
  object: THREE.Group;
  /** Radius (m) of a sphere about the origin that contains the model. */
  radius: number;
  /** Unit vector (model axes) of the main antenna boresight, or of the flight direction for a model with no dish. */
  boresight: THREE.Vector3;
  /** Spin axis (model axes) and spin rate (rad/s) for spin-stabilised spacecraft; null for three-axis spacecraft. */
  spin: { axis: THREE.Vector3; rate: number } | null;
  /** Free all geometries, materials and textures of the model. */
  dispose(): void;
}

const BUILDERS: Record<SpacecraftKind, (b: Builder) => ModelSpec> = {
  voyager: buildVoyager,
  cassini: buildCassini,
  newhorizons: buildNewHorizons,
  juno: buildJuno,
  galileo: buildGalileo,
  pioneer: buildPioneer,
  marscruise: buildMarsCruise,
  apsis: buildApsis,
  ulysses: buildUlysses,
};

export function buildSpacecraft(kind: SpacecraftKind): SpacecraftModel {
  const builder = new Builder(kind);
  const spec = BUILDERS[kind](builder);
  const built = builder.finish();
  return {
    kind,
    object: built.object,
    radius: built.radius,
    boresight: new THREE.Vector3(spec.boresight[0], spec.boresight[1], spec.boresight[2]).normalize(),
    spin: spec.spin
      ? { axis: new THREE.Vector3(spec.spin.axis[0], spec.spin.axis[1], spec.spin.axis[2]).normalize(), rate: spec.spin.rate }
      : null,
    dispose: built.dispose,
  };
}

/**
 * The items that the Accuracy screen and docs/VALIDATION.md show below the measured values.
 * Each id has a title and a text in the locale files: validation.unverified.<id> and validation.limits.<id>.
 */

/** Items that have no comparison with an independent reference. */
export const UNVERIFIED = ['outerCenters', 'rotation', 'otherTools', 'ste', 'masses', 'insertionBurns', 'maneuverSearch', 'models3d', 'pictures', 'smallShapes', 'browsers'] as const;

/** Effects that the models of the engine do not include, and limits of the data. */
export const LIMITS = ['impulses', 'forces', 'moons', 'centralBody', 'launch', 'entry', 'interpolation', 'range', 'utcBefore1972', 'lightTime', 'tables', 'horizonsCenter'] as const;

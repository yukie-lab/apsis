/** State that the start screen gives to the flight screen of the Explorer mode. */
import type { Mission } from '../engine/mission';

/**
 * The mission that the Explorer mode made last, as the object that it put in the application state.
 * While the mission in work is this object, the user did not change it: a new mission replaces it with no question.
 */
export const made: { mission: Mission | null; autoStart: boolean } = { mission: null, autoStart: false };

/**
 * Premier League squad registration rules.
 *
 * Models the real rules: a club registers at most 25 players over the U21
 * age limit, of whom at most 17 may be non-home-grown. U21 players are
 * exempt from registration entirely. The engine adds two minimum-viability
 * floors so a submitted squad can always field an XI.
 */
import {
  MIN_GOALKEEPERS,
  MIN_SQUAD_SIZE,
  NON_HOMEGROWN_LIMIT,
  OVER21_REGISTRATION_LIMIT,
  U21_AGE_LIMIT,
} from '../constants';
import type { PlayerCore, WindowConfig } from '../types';
import type { Violation } from './violations';

/**
 * Whether a player is exempt from registration as an under-21 this season.
 *
 * Both the Premier League and UEFA fix it by birth date: born on or after
 * 1 January twenty-one years before the season starts. It holds for the
 * whole season, birthdays or not.
 *
 * @param player - Any player.
 * @param window - A window of the season in question.
 * @returns True when he is under 21 for that season.
 */
export function isU21(
  player: Pick<PlayerCore, 'age' | 'birthDate'>,
  window: Pick<WindowConfig, 'seasonStartYear'>,
): boolean {
  if (player.birthDate === undefined) {
    return player.age <= U21_AGE_LIMIT;
  }
  const cutoff = `${String(window.seasonStartYear - U21_AGE_LIMIT)}-01-01`;
  // ISO dates compare correctly as strings.
  return player.birthDate >= cutoff;
}

/**
 * Registration counts for a squad, as shown on the constraint dashboard.
 */
export interface RegistrationCounts {
  /** Players requiring registration (over the U21 limit). */
  over21: number;
  /** Registered players who are not home-grown. */
  nonHomegrownOver21: number;
  /**
   * Registered (over-21) home-grown players. U21s are registration-exempt,
   * so they never count here even when home-grown. Invariant:
   * homegrownOver21 + nonHomegrownOver21 === over21.
   */
  homegrownOver21: number;
  /** Registration-exempt under-21 players. */
  u21: number;
  /** Total squad size including U21s. */
  total: number;
  goalkeepers: number;
}

/**
 * Computes the registration counts for a squad.
 *
 * @param squad - The current squad.
 * @param window - The window being registered for (it sets the season the
 *   under-21 test applies to).
 * @returns Counts used by both validation and the UI dashboard.
 */
export function countRegistration(
  squad: readonly PlayerCore[],
  window: Pick<WindowConfig, 'seasonStartYear'>,
): RegistrationCounts {
  let over21 = 0;
  let nonHomegrownOver21 = 0;
  let homegrownOver21 = 0;
  let goalkeepers = 0;

  for (const player of squad) {
    if (player.position === 'GK') {
      goalkeepers += 1;
    }
    if (isU21(player, window)) {
      // U21s are exempt from registration, so they count towards none of
      // the registration tallies (home-grown included).
      continue;
    }
    over21 += 1;
    if (player.homegrown) {
      homegrownOver21 += 1;
    } else {
      nonHomegrownOver21 += 1;
    }
  }

  return {
    over21,
    nonHomegrownOver21,
    homegrownOver21,
    u21: squad.length - over21,
    total: squad.length,
    goalkeepers,
  };
}

/**
 * Validates a squad against the registration rules.
 *
 * @param squad - The current squad.
 * @returns A list of violations; empty when the squad is registrable.
 */
export function validateRegistration(
  squad: readonly PlayerCore[],
  window: Pick<WindowConfig, 'seasonStartYear'>,
): Violation[] {
  const counts = countRegistration(squad, window);
  const violations: Violation[] = [];

  if (counts.over21 > OVER21_REGISTRATION_LIMIT) {
    violations.push({
      code: 'OVER21_LIMIT_EXCEEDED',
      message: `${String(counts.over21)} over-21 players; the registration list allows ${String(OVER21_REGISTRATION_LIMIT)}`,
    });
  }
  if (counts.nonHomegrownOver21 > NON_HOMEGROWN_LIMIT) {
    violations.push({
      code: 'NON_HOMEGROWN_LIMIT_EXCEEDED',
      message: `${String(counts.nonHomegrownOver21)} non-home-grown players; the limit is ${String(NON_HOMEGROWN_LIMIT)}`,
    });
  }
  if (counts.total < MIN_SQUAD_SIZE) {
    violations.push({
      code: 'SQUAD_TOO_SMALL',
      message: `Squad of ${String(counts.total)} cannot field an XI; minimum is ${String(MIN_SQUAD_SIZE)}`,
    });
  }
  if (counts.goalkeepers < MIN_GOALKEEPERS) {
    violations.push({
      code: 'NOT_ENOUGH_GOALKEEPERS',
      message: `Squad has ${String(counts.goalkeepers)} goalkeeper(s); minimum is ${String(MIN_GOALKEEPERS)}`,
    });
  }

  return violations;
}

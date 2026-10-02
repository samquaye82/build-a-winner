/**
 * Ages from real birth dates (Sam, 03/10/2026).
 *
 * Every window has a date: a summer window opens its season on 1 July, a
 * January window sits on 1 January. A player with a birth date is as old,
 * in whole years, as he really is on that date, so he ages on his birthday
 * rather than in a lump each summer, and a source's stale age never leaks
 * in. A player with no birth date (the fictional test fixtures) keeps his
 * authored age, ticking at each season boundary as before.
 */
import type { PlayerCore, WindowConfig } from '../types';

/**
 * The date a window falls on.
 *
 * @param window - The window.
 * @returns ISO date: 1 July of the season's start year for a summer
 *   window, 1 January of the following year for a January one.
 */
export function windowDate(
  window: Pick<WindowConfig, 'seasonStartYear' | 'midSeason'>,
): string {
  return window.midSeason
    ? `${String(window.seasonStartYear + 1)}-01-01`
    : `${String(window.seasonStartYear)}-07-01`;
}

/**
 * Age in whole years on a given day.
 *
 * @param birthDate - ISO date of birth, e.g. "2001-10-16".
 * @param onDate - ISO date to measure on.
 * @returns Completed years: a player is a year older from his birthday.
 */
export function ageOn(birthDate: string, onDate: string): number {
  const [bornYear, bornMonth, bornDay] = birthDate.split('-').map(Number) as [number, number, number];
  const [year, month, day] = onDate.split('-').map(Number) as [number, number, number];
  const hadBirthday = month > bornMonth || (month === bornMonth && day >= bornDay);
  return year - bornYear - (hadBirthday ? 0 : 1);
}

/**
 * A player's age in a window.
 *
 * @param player - Any player.
 * @param window - The window.
 * @returns His real age on the window's date, or his authored age when he
 *   has no birth date.
 */
export function ageAt(
  player: Pick<PlayerCore, 'age' | 'birthDate'>,
  window: Pick<WindowConfig, 'seasonStartYear' | 'midSeason'>,
): number {
  return player.birthDate === undefined
    ? player.age
    : ageOn(player.birthDate, windowDate(window));
}

/**
 * A player's age once a window transition has passed.
 *
 * @param player - The player before the transition.
 * @param seasonBoundary - Whether the transition crosses seasons.
 * @param nextWindow - The window being opened.
 * @returns His real age in the new window; without a birth date, his
 *   authored age plus one at a season boundary.
 */
export function ageAfter(
  player: Pick<PlayerCore, 'age' | 'birthDate'>,
  seasonBoundary: boolean,
  nextWindow: Pick<WindowConfig, 'seasonStartYear' | 'midSeason'>,
): number {
  if (player.birthDate !== undefined) {
    return ageAt(player, nextWindow);
  }
  return seasonBoundary ? player.age + 1 : player.age;
}

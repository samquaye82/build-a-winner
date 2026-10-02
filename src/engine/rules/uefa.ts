/**
 * UEFA Champions League squad registration rules (Sam, 02/10/2026).
 *
 * A club registers its squad on two lists:
 *
 * - **List A**: at most 25 players, a limit that never moves. Eight places
 *   are reserved for locally trained players (see UefaTraining), and at
 *   most four of those eight may be association-trained. A reserved place
 *   no such player fills stays empty, so at most 17 List A players may be
 *   anyone else: with six locally trained players a club can register 23.
 *   At least two goalkeepers must be on it.
 * - **List B**: unlimited, for players who are young enough and have been
 *   at the club for two uninterrupted years.
 *
 * Every squad player must fit on one list or the other; across both, the
 * squad needs at least three goalkeepers. This is enforced alongside the
 * Premier League rules (registration.ts), never instead of them.
 *
 * Which list a player goes on is not the player's choice to make in the
 * game: the engine works out the best legal assignment itself. That is
 * safe because the best assignment is always the obvious one. Moving a
 * List-B-eligible player onto List A adds a player to the 25 and, unless he
 * counts as locally trained, one to the 17 open places too, so it can only
 * ever make things worse. Every eligible player therefore goes on List B,
 * except that young goalkeepers move up when List A would otherwise be
 * short of two.
 *
 * Simplifications, each documented where it applies:
 * - List B's age test reuses the Premier League U21 test (isU21). Both
 *   real rules use a 1 January cutoff, and for 2026/27 it is the same date
 *   (born on or after 01/01/2005); the game approximates both with whole-
 *   year age.
 * - Tenure is measured from the start of the player's current spell
 *   (`joined`), the only spell the data records. UEFA also accepts an
 *   earlier spell, which no player in the game can have used.
 * - UEFA's exception for 16-year-olds needs no code of its own: it asks
 *   for the same two years at the club.
 */
import {
  UCL_ASSOCIATION_TRAINED_MAX,
  UCL_LIST_A_LIMIT,
  UCL_LIST_A_MIN_GOALKEEPERS,
  UCL_LIST_B_TENURE_YEARS,
  UCL_LOCALLY_TRAINED_PLACES,
  UCL_MIN_GOALKEEPERS,
  UCL_OPEN_PLACES,
} from '../constants';
import type { PlayerCore, SeasonPoint, UefaTraining, WindowConfig } from '../types';
import { isU21 } from './registration';
import type { Violation } from './violations';

/**
 * Converts a calendar point to a number of years, so two points can be
 * subtracted: a mid-season point sits half a year after its summer.
 *
 * @param point - A season start year, and whether the point is mid-season.
 * @returns The point as years, e.g. 2026.5 for January 2027.
 */
export function seasonTime(point: SeasonPoint): number {
  return point.season + (point.midSeason ? 0.5 : 0);
}

/**
 * Whether a player has been at his club long enough for List B.
 *
 * @param player - Any player.
 * @param window - The window being registered for.
 * @returns True when his current spell is at least two years old. A player
 *   whose spell is unknown never qualifies.
 */
export function meetsListBTenure(
  player: Pick<PlayerCore, 'joined'>,
  window: Pick<WindowConfig, 'seasonStartYear' | 'midSeason'>,
): boolean {
  if (player.joined === undefined) {
    return false;
  }
  const now = seasonTime({
    season: window.seasonStartYear,
    midSeason: window.midSeason,
  });
  return now - seasonTime(player.joined) >= UCL_LIST_B_TENURE_YEARS;
}

/**
 * Whether a player may be registered on List B.
 *
 * @param player - Any player.
 * @param window - The window being registered for.
 * @returns True when he is young enough and has been at the club long
 *   enough.
 */
export function isListBEligible(
  player: Pick<PlayerCore, 'age' | 'birthDate' | 'joined'>,
  window: Pick<WindowConfig, 'seasonStartYear' | 'midSeason'>,
): boolean {
  return isU21(player, window) && meetsListBTenure(player, window);
}

/**
 * The squad's registration with UEFA, as the dashboard shows it.
 */
export interface UefaRegistration {
  /** Ids of the players on List A, in squad order. */
  listA: readonly string[];
  /** Ids of the players on List B, in squad order. */
  listB: readonly string[];
  /** Club-trained players on List A. */
  clubTrained: number;
  /** Association-trained players on List A. */
  associationTrained: number;
  /**
   * Locally trained players filling the eight reserved places: every
   * club-trained player, plus association-trained players up to four,
   * capped at eight.
   */
  locallyTrained: number;
  /**
   * List A players in the open places: everyone not filling a reserved
   * one, including association-trained players beyond the four. At most
   * UCL_OPEN_PLACES.
   */
  inOpenPlaces: number;
  /** Goalkeepers across both lists, i.e. in the whole squad. */
  goalkeepers: number;
}

/** Order in which young keepers move up: those who earn quota first. */
const TRAINING_PRIORITY: Readonly<Record<UefaTraining, number>> = {
  club: 0,
  association: 1,
  none: 2,
};

/**
 * Orders two young goalkeepers for a move up to List A: the one whose
 * training counts towards the reserved places goes first, so the move
 * costs as little room as it can. Ties break on id, so the result never
 * depends on squad order.
 *
 * @param a - A goalkeeper.
 * @param b - Another goalkeeper.
 * @returns Negative when a goes first, positive when b does.
 */
function byPromotionPriority(a: PlayerCore, b: PlayerCore): number {
  const byTraining =
    TRAINING_PRIORITY[a.uefaTraining ?? 'none'] -
    TRAINING_PRIORITY[b.uefaTraining ?? 'none'];
  if (byTraining !== 0) {
    return byTraining;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Works out the best legal UEFA registration for a squad: everyone
 * eligible for List B goes there, apart from young goalkeepers List A
 * needs, and everyone else takes a List A place.
 *
 * @param squad - The current squad.
 * @param window - The window being registered for.
 * @returns The two lists and the counts the rules are judged on.
 */
export function assignUefaLists(
  squad: readonly PlayerCore[],
  window: Pick<WindowConfig, 'seasonStartYear' | 'midSeason'>,
): UefaRegistration {
  const onListB = new Set(
    squad.filter((p) => isListBEligible(p, window)).map((p) => p.id),
  );

  // List A must hold two goalkeepers. If the senior keepers fall short,
  // move young ones up.
  const seniorKeepers = squad.filter(
    (p) => p.position === 'GK' && !onListB.has(p.id),
  ).length;
  const shortfall = Math.max(0, UCL_LIST_A_MIN_GOALKEEPERS - seniorKeepers);
  const youngKeepers = squad
    .filter((p) => p.position === 'GK' && onListB.has(p.id))
    .sort(byPromotionPriority);
  for (const keeper of youngKeepers.slice(0, shortfall)) {
    onListB.delete(keeper.id);
  }

  const listA = squad.filter((p) => !onListB.has(p.id));
  const clubTrained = listA.filter((p) => p.uefaTraining === 'club').length;
  const associationTrained = listA.filter(
    (p) => p.uefaTraining === 'association',
  ).length;
  const locallyTrained = Math.min(
    clubTrained + Math.min(associationTrained, UCL_ASSOCIATION_TRAINED_MAX),
    UCL_LOCALLY_TRAINED_PLACES,
  );

  return {
    listA: listA.map((p) => p.id),
    listB: squad.filter((p) => onListB.has(p.id)).map((p) => p.id),
    clubTrained,
    associationTrained,
    locallyTrained,
    inOpenPlaces: listA.length - locallyTrained,
    goalkeepers: squad.filter((p) => p.position === 'GK').length,
  };
}

/**
 * Validates a squad against the UEFA registration rules.
 *
 * Fewer than eight locally trained players is not a violation in its own
 * right: the reserved places they would fill simply stay empty, which the
 * open-places check already accounts for. Nor is a List A short of two
 * goalkeepers, which can only happen when the squad is short of three,
 * already reported.
 *
 * @param squad - The current squad.
 * @param window - The window being registered for.
 * @returns A list of violations; empty when the squad is registrable.
 */
export function validateUefaRegistration(
  squad: readonly PlayerCore[],
  window: Pick<WindowConfig, 'seasonStartYear' | 'midSeason'>,
): Violation[] {
  const registration = assignUefaLists(squad, window);
  const violations: Violation[] = [];

  const registered = registration.listA.length;
  if (registered > UCL_LIST_A_LIMIT) {
    violations.push({
      code: 'UCL_LIST_A_OVER_LIMIT',
      message: `UEFA List A has ${String(registered)} players; the maximum is ${String(UCL_LIST_A_LIMIT)}`,
    });
  }
  if (registration.inOpenPlaces > UCL_OPEN_PLACES) {
    violations.push({
      code: 'UCL_OPEN_PLACES_EXCEEDED',
      message: `UEFA List A has ${String(registration.inOpenPlaces)} players who are not locally trained; ${String(UCL_LOCALLY_TRAINED_PLACES)} of its ${String(UCL_LIST_A_LIMIT)} places are reserved for locally trained players, so at most ${String(UCL_OPEN_PLACES)} are allowed`,
    });
  }
  if (registration.goalkeepers < UCL_MIN_GOALKEEPERS) {
    violations.push({
      code: 'UCL_NOT_ENOUGH_GOALKEEPERS',
      message: `Squad has ${String(registration.goalkeepers)} goalkeeper(s); UEFA requires ${String(UCL_MIN_GOALKEEPERS)} across Lists A and B`,
    });
  }

  return violations;
}

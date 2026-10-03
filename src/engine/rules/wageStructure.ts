/**
 * The club's wage structure (Sam, 03/10/2026).
 *
 * Clubs pay to a structure: a player will not join, or extend, on a fraction
 * of what comparable team-mates earn. Adam Wharton will not sign for 60k a
 * week alongside Gravenberch and Szoboszlai on four or five times that. So
 * every new contract has a floor: WAGE_STRUCTURE_SHARE (70%) of the
 * best-paid squad player in the same wage group, rated within
 * WAGE_STRUCTURE_RATING_BAND (3) points. A player whose own demand is
 * already higher keeps it; with nobody in range there is no floor.
 *
 * The structure is the squad as it stands at the moment of the deal, so it
 * moves with the player's own business: a big signing raises the floor for
 * those after him, a sale lowers it. Players at the club on loan are paid
 * on their parent club's structure, so they set no floor; players out on
 * loan are not in the squad at all.
 *
 * Pure and deterministic, like every rule: the floor is a function of the
 * squad alone.
 */
import {
  WAGE_STRUCTURE_RATING_BAND,
  WAGE_STRUCTURE_SHARE,
} from '../constants';
import { roundMoney } from '../money';
import type {
  GameState,
  MarketPlayer,
  Position,
  SquadPlayer,
} from '../types';

/**
 * Wage groups. Deliberately not the formations' slot groups, which overlap
 * (a CM is eligible at full back there): a player must sit in exactly one
 * wage group.
 */
export type WageGroup = 'GK' | 'DEF' | 'MID' | 'FWD';

/** Each position's wage group. */
const WAGE_GROUP: Readonly<Record<Position, WageGroup>> = {
  GK: 'GK',
  RB: 'DEF',
  LB: 'DEF',
  CB: 'DEF',
  CM: 'MID',
  AM: 'MID',
  RW: 'FWD',
  LW: 'FWD',
  ST: 'FWD',
};

/**
 * The wage group a position belongs to.
 *
 * @param position - A playing position.
 * @returns Its wage group.
 */
export function wageGroupOf(position: Position): WageGroup {
  return WAGE_GROUP[position];
}

/** The fields of a player the wage structure judges him by. */
interface WageSubject {
  id: string;
  position: Position;
  quality: number;
}

/**
 * The lowest salary a player will accept given the club's wage structure.
 *
 * @param squad - The club's squad as it stands at the moment of the deal.
 * @param subject - The player signing or renewing. He is never his own
 *   comparison, so a renewal is judged against his team-mates only.
 * @returns The floor salary (EUR m a year), or 0 when no squad player in
 *   his wage group is rated within the band.
 */
export function wageFloor(
  squad: readonly SquadPlayer[],
  subject: WageSubject,
): number {
  const group = wageGroupOf(subject.position);
  const comparables = squad.filter(
    (p) =>
      p.id !== subject.id &&
      p.onLoan !== true &&
      wageGroupOf(p.position) === group &&
      Math.abs(p.quality - subject.quality) <= WAGE_STRUCTURE_RATING_BAND,
  );
  if (comparables.length === 0) {
    return 0;
  }
  const highest = Math.max(...comparables.map((p) => p.contract.salary));
  return roundMoney(highest * WAGE_STRUCTURE_SHARE);
}

/**
 * Raises a salary to the wage-structure floor where it falls short.
 *
 * @param salary - The salary the player would otherwise accept (EUR m).
 * @param squad - The club's squad as it stands.
 * @param subject - The player signing or renewing.
 * @returns The higher of the two, rounded.
 */
export function applyWageFloor(
  salary: number,
  squad: readonly SquadPlayer[],
  subject: WageSubject,
): number {
  return roundMoney(Math.max(salary, wageFloor(squad, subject)));
}

/**
 * The salary a market player will sign for in the current state: his
 * listed demand, lifted to the wage-structure floor where it falls short.
 *
 * @param state - The current game state; its squad is the structure.
 * @param listing - The market listing.
 * @returns Annual salary in EUR m.
 */
export function signingWage(state: GameState, listing: MarketPlayer): number {
  return applyWageFloor(listing.wageDemand, state.squad, listing);
}

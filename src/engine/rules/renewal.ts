/**
 * Contract renewal pricing.
 *
 * Renewing costs no transfer fee; the price is a salary increase that then
 * burdens the wage bill (and, from M2, the squad cost ratio) for the rest of
 * the game. The uplift scales with the player's leverage (how close the
 * contract is to expiry), the number of years added, and player quality.
 * Curve constants live in constants.ts and are M6 tuning candidates. The
 * result is then lifted to the club's wage structure where it falls short
 * (rules/wageStructure.ts): a renewal is a new contract like any other.
 */
import {
  MAX_CONTRACT_YEARS,
  PER_YEAR_ADDED_UPLIFT,
  RENEWAL_QUALITY_FACTOR_BASE,
  RENEWAL_QUALITY_FACTOR_DIVISOR,
  RENEWAL_UPLIFT_DISTANT,
  RENEWAL_UPLIFT_FINAL_YEAR,
  RENEWAL_UPLIFT_TWO_YEARS,
  STAR_WAGE_MULTIPLIER,
  VETERAN_MAX_YEARS_ADDED,
  VETERAN_RENEWAL_AGE,
  VETERAN_RENEWAL_SALARY_FACTOR,
} from '../constants';
import { EngineError } from '../errors';
import { roundMoney } from '../money';
import type { Contract, SquadPlayer, WindowConfig } from '../types';
import { isStarWageCase } from './wage';
import { applyWageFloor } from './wageStructure';

/**
 * Whether a player renews on veteran terms (Sam, 03/10/2026): aged
 * VETERAN_RENEWAL_AGE or over at the window.
 *
 * @param player - The squad player being renewed.
 * @returns True for a veteran.
 */
export function isVeteranRenewal(player: SquadPlayer): boolean {
  return player.age >= VETERAN_RENEWAL_AGE;
}

/**
 * The latest expiry year a renewal may run to. Every player is held to
 * MAX_CONTRACT_YEARS from the start of the current season; a veteran may
 * also add no more than VETERAN_MAX_YEARS_ADDED to his current deal.
 *
 * @param player - The squad player being renewed.
 * @param window - The window in which the renewal is agreed.
 * @returns The latest legal season-end expiry year.
 */
export function maxRenewalExpiryYear(
  player: SquadPlayer,
  window: WindowConfig,
): number {
  const cap = window.seasonStartYear + MAX_CONTRACT_YEARS;
  return isVeteranRenewal(player)
    ? Math.min(cap, player.contract.expiryYear + VETERAN_MAX_YEARS_ADDED)
    : cap;
}

/**
 * Computes the contract a player will accept for a renewal to the given
 * expiry year.
 *
 * @param player - The squad player being renewed.
 * @param newExpiryYear - The proposed new season-end expiry year.
 * @param window - The window in which the renewal is agreed.
 * @param squad - The squad as it stands, which sets the wage structure.
 * @returns The renewed contract (new expiry, increased salary).
 * @throws {EngineError} INVALID_EXPIRY_YEAR if the new expiry does not
 *   extend the current deal, or extends it beyond maxRenewalExpiryYear
 *   (MAX_CONTRACT_YEARS from the start of the current season, and for a
 *   veteran VETERAN_MAX_YEARS_ADDED beyond his current expiry).
 */
export function priceRenewal(
  player: SquadPlayer,
  newExpiryYear: number,
  window: WindowConfig,
  squad: readonly SquadPlayer[],
): Contract {
  const maxExpiryYear = maxRenewalExpiryYear(player, window);

  if (newExpiryYear <= player.contract.expiryYear) {
    throw new EngineError(
      'INVALID_EXPIRY_YEAR',
      `Renewal for ${player.name} must extend the contract beyond ${String(player.contract.expiryYear)}`,
    );
  }
  if (newExpiryYear > maxExpiryYear) {
    throw new EngineError(
      'INVALID_EXPIRY_YEAR',
      isVeteranRenewal(player)
        ? `Renewal for ${player.name} may not extend beyond ${String(maxExpiryYear)} (at ${String(VETERAN_RENEWAL_AGE)} or over, at most ${String(VETERAN_MAX_YEARS_ADDED)} years added)`
        : `Renewal for ${player.name} may not extend beyond ${String(maxExpiryYear)} (${String(MAX_CONTRACT_YEARS)}-year cap)`,
    );
  }

  // A veteran renews on a 30% pay cut, whatever the leverage or years
  // added; neither the star rule nor the wage structure applies.
  if (isVeteranRenewal(player)) {
    return {
      expiryYear: newExpiryYear,
      salary: roundMoney(player.contract.salary * VETERAN_RENEWAL_SALARY_FACTOR),
    };
  }

  const remainingYears = player.contract.expiryYear - window.seasonStartYear;
  const yearsAdded = newExpiryYear - player.contract.expiryYear;

  // Leverage: a player inside the final year of their deal (remainingYears
  // <= 1) can demand the most; two years out is cheaper; three or more years
  // out the club holds the cards.
  const urgency =
    remainingYears <= 1
      ? RENEWAL_UPLIFT_FINAL_YEAR
      : remainingYears === 2
        ? RENEWAL_UPLIFT_TWO_YEARS
        : RENEWAL_UPLIFT_DISTANT;

  const qualityFactor =
    RENEWAL_QUALITY_FACTOR_BASE + player.quality / RENEWAL_QUALITY_FACTOR_DIVISOR;

  const uplift =
    (urgency + PER_YEAR_ADDED_UPLIFT * yearsAdded) * qualityFactor;

  // A star still on modest money will only extend for double their wage,
  // whatever the leverage or years added (see rules/wage.ts). For everyone
  // else the demand is the leverage-and-quality uplift on the current salary.
  const salary = isStarWageCase(player.contract.salary, player.quality)
    ? player.contract.salary * STAR_WAGE_MULTIPLIER
    : player.contract.salary * (1 + uplift);

  return {
    expiryYear: newExpiryYear,
    salary: applyWageFloor(salary, squad, player),
  };
}

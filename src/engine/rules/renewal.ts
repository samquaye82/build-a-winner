/**
 * Contract renewal pricing.
 *
 * Renewing costs no transfer fee; the price is a salary increase that then
 * burdens the wage bill (and, from M2, the squad cost ratio) for the rest of
 * the game. The uplift scales with the player's leverage (how close the
 * contract is to expiry), the number of years added, and player quality.
 * Curve constants live in constants.ts and are M6 tuning candidates.
 */
import {
  MAX_CONTRACT_YEARS,
  PER_YEAR_ADDED_UPLIFT,
  RENEWAL_QUALITY_FACTOR_BASE,
  RENEWAL_QUALITY_FACTOR_DIVISOR,
  RENEWAL_UPLIFT_DISTANT,
  RENEWAL_UPLIFT_FINAL_YEAR,
  RENEWAL_UPLIFT_TWO_YEARS,
} from '../constants';
import { EngineError } from '../errors';
import { roundMoney } from '../money';
import type { Contract, SquadPlayer, WindowConfig } from '../types';

/**
 * Computes the contract a player will accept for a renewal to the given
 * expiry year.
 *
 * @param player - The squad player being renewed.
 * @param newExpiryYear - The proposed new season-end expiry year.
 * @param window - The window in which the renewal is agreed.
 * @returns The renewed contract (new expiry, increased salary).
 * @throws {EngineError} INVALID_EXPIRY_YEAR if the new expiry does not
 *   extend the current deal, or extends it beyond MAX_CONTRACT_YEARS from
 *   the start of the current season.
 */
export function priceRenewal(
  player: SquadPlayer,
  newExpiryYear: number,
  window: WindowConfig,
): Contract {
  const maxExpiryYear = window.seasonStartYear + MAX_CONTRACT_YEARS;

  if (newExpiryYear <= player.contract.expiryYear) {
    throw new EngineError(
      'INVALID_EXPIRY_YEAR',
      `Renewal for ${player.name} must extend the contract beyond ${String(player.contract.expiryYear)}`,
    );
  }
  if (newExpiryYear > maxExpiryYear) {
    throw new EngineError(
      'INVALID_EXPIRY_YEAR',
      `Renewal for ${player.name} may not extend beyond ${String(maxExpiryYear)} (${String(MAX_CONTRACT_YEARS)}-year cap)`,
    );
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

  return {
    expiryYear: newExpiryYear,
    salary: roundMoney(player.contract.salary * (1 + uplift)),
  };
}

/**
 * Deterministic player value model.
 *
 * A player's baseValue drifts between windows along an age/quality curve;
 * their saleValue is the baseValue discounted by remaining contract length.
 * Both computations are pure and rounded, so identical playthroughs always
 * see identical prices (the determinism contract).
 */
import {
  CONTRACT_DEMAND_BY_AGE,
  CONTRACT_DISCOUNT_BY_MONTHS,
  TRANSITION_RATE_FACTOR,
  VALUE_GROWTH_BANDS,
  VALUE_QUALITY_ELITE,
  VALUE_QUALITY_GOOD,
} from '../constants';
import { roundMoney } from '../money';
import type { WindowConfig } from '../types';

/**
 * Annual value growth rate for a player of the given age and quality.
 *
 * @param age - The player's age.
 * @param quality - The player's 0-100 quality rating.
 * @returns The annual rate, e.g. 0.08 for +8% a year.
 */
export function annualValueGrowthRate(age: number, quality: number): number {
  const band =
    VALUE_GROWTH_BANDS.find((b) => age <= b.maxAge) ??
    VALUE_GROWTH_BANDS[VALUE_GROWTH_BANDS.length - 1];
  if (band === undefined) {
    // Unreachable: VALUE_GROWTH_BANDS is a non-empty constant.
    throw new Error('VALUE_GROWTH_BANDS must not be empty');
  }
  if (quality >= VALUE_QUALITY_ELITE) {
    return band.elite;
  }
  if (quality >= VALUE_QUALITY_GOOD) {
    return band.good;
  }
  return band.base;
}

/**
 * Applies one window transition's value drift to a base value.
 *
 * @param baseValue - The player's base value before the transition (EUR m).
 * @param age - The player's age after any season-boundary age tick.
 * @param quality - The player's 0-100 quality rating.
 * @returns The drifted base value, rounded.
 */
export function driftBaseValue(
  baseValue: number,
  age: number,
  quality: number,
): number {
  const rate = annualValueGrowthRate(age, quality) * TRANSITION_RATE_FACTOR;
  return roundMoney(baseValue * (1 + rate));
}

/**
 * Months left on a contract as seen from a given window.
 *
 * Summer windows sit at the start of a season, so whole years remain; a
 * January window is six months into the season, so every contract is six
 * months shorter than year arithmetic suggests.
 *
 * @param expiryYear - The contract's season-end expiry year.
 * @param window - The window the contract is being valued in.
 * @returns Remaining months (a multiple of six, never negative).
 */
export function remainingMonths(
  expiryYear: number,
  window: WindowConfig,
): number {
  const months =
    (expiryYear - window.seasonStartYear) * 12 - (window.midSeason ? 6 : 0);
  return Math.max(0, months);
}

/**
 * The sale-price discount for a contract with the given months remaining.
 *
 * @param months - Remaining contract months at the current window.
 * @returns A multiplier in (0, 1].
 */
export function contractDiscount(months: number): number {
  const row = CONTRACT_DISCOUNT_BY_MONTHS.find((r) => months >= r.minMonths);
  if (row === undefined) {
    // Unreachable: the table's last row has minMonths 0 and months is
    // clamped non-negative.
    throw new Error(`No contract discount found for ${String(months)} months`);
  }
  return row.discount;
}

/**
 * The contract length (years) a player of the given age demands when
 * signing for a new club.
 *
 * @param age - Age at signing.
 * @returns Demanded contract length in years.
 */
export function contractYearsDemand(age: number): number {
  const row = CONTRACT_DEMAND_BY_AGE.find((r) => age >= r.minAge);
  // The table's last row has minAge 0, so a match always exists.
  return row?.years ?? 5;
}

/**
 * Computes a player's sale value from base value and contract situation.
 *
 * @param baseValue - The player's base value (EUR m).
 * @param expiryYear - The contract's season-end expiry year.
 * @param window - The window the valuation applies to.
 * @returns The pre-agreed sale fee, rounded.
 */
export function computeSaleValue(
  baseValue: number,
  expiryYear: number,
  window: WindowConfig,
): number {
  return roundMoney(
    baseValue * contractDiscount(remainingMonths(expiryYear, window)),
  );
}

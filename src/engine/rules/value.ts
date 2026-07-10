/**
 * Deterministic player value model.
 *
 * A player's baseValue drifts between windows along an age/quality curve;
 * their saleValue is the baseValue discounted by remaining contract length.
 * Both computations are pure and rounded, so identical playthroughs always
 * see identical prices (the determinism contract).
 */
import {
  CONTRACT_DISCOUNT_FINAL_YEAR,
  CONTRACT_DISCOUNT_TWO_YEARS,
  TRANSITION_RATE_FACTOR,
  VALUE_GROWTH_BANDS,
  VALUE_QUALITY_ELITE,
  VALUE_QUALITY_GOOD,
} from '../constants';
import { roundMoney } from '../money';

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
 * The sale-price discount for a contract with the given remaining years.
 *
 * @param remainingYears - Contract years left at the current window.
 * @returns A multiplier in (0, 1].
 */
export function contractDiscount(remainingYears: number): number {
  if (remainingYears >= 3) {
    return 1;
  }
  if (remainingYears === 2) {
    return CONTRACT_DISCOUNT_TWO_YEARS;
  }
  return CONTRACT_DISCOUNT_FINAL_YEAR;
}

/**
 * Computes a player's sale value from base value and contract situation.
 *
 * @param baseValue - The player's base value (EUR m).
 * @param remainingYears - Contract years left at the current window.
 * @returns The pre-agreed sale fee, rounded.
 */
export function computeSaleValue(
  baseValue: number,
  remainingYears: number,
): number {
  return roundMoney(baseValue * contractDiscount(remainingYears));
}

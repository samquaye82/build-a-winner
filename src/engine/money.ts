/**
 * Money arithmetic helpers.
 *
 * All monetary values in the engine are EUR m as floating-point numbers.
 * Every derived monetary figure must pass through roundMoney so that
 * floating-point drift can never make two identical playthroughs diverge
 * (part of the determinism contract).
 */

/**
 * Rounds a monetary amount to one decimal place (EUR 100k precision).
 *
 * @param amount - The amount in EUR m.
 * @returns The amount rounded to one decimal place.
 */
export function roundMoney(amount: number): number {
  return Math.round(amount * 10) / 10;
}

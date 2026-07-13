/**
 * Star-player wage demands.
 *
 * Shared by contract renewals (rules/renewal.ts) and the market listing
 * generator (scripts/generate-data.ts) so a marquee player is priced
 * identically whether they arrive as a contract extension or a transfer.
 * Keeping the predicate here makes the threshold the single source of truth
 * for both mechanisms.
 */
import { STAR_QUALITY_THRESHOLD, STAR_WAGE_WEEKLY_CAP_M } from '../constants';

/**
 * Whether the star-player wage override applies to a player.
 *
 * A top-rated player still on modest money demands double their current wage
 * to sign any new deal; everyone else negotiates on the normal curve.
 *
 * @param currentSalary - The player's current annual salary (EUR m).
 * @param quality - The player's overall rating on the 0-100 scale.
 * @returns True when the player is elite (>= STAR_QUALITY_THRESHOLD) and paid
 *   at or below the weekly cap (STAR_WAGE_WEEKLY_CAP_M a year).
 */
export function isStarWageCase(currentSalary: number, quality: number): boolean {
  return (
    quality >= STAR_QUALITY_THRESHOLD && currentSalary <= STAR_WAGE_WEEKLY_CAP_M
  );
}

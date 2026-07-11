/**
 * Locked player lists: THE file Sam edits.
 *
 * Ids are Capology player slugs (stable; see src/data/generated). Both
 * lists are applied at config-build time by realConfig.ts, so edits here
 * take effect on refresh with no regeneration needed.
 *
 * Proposed by Claude 11/07/2026, awaiting Sam's edit pass.
 */

/**
 * Liverpool players the board refuses to sell: the new-era spine and the
 * academy jewels (RedmenTV-style locks). Everyone else is sellable.
 */
export const LIVERPOOL_LOCKED: readonly string[] = [
  'florian-wirtz-37744', // Florian Wirtz
  'alexander-isak-36424', // Alexander Isak
  'hugo-ekitike-37427', // Hugo Ekitiké
  'milos-kerkez-37932', // Milos Kerkez
  'ryan-gravenberch-37392', // Ryan Gravenberch
  'virgil-van-dijk-33427', // Van Dijk (captain; renew him or lose him free)
  'giovanni-leoni-39072', // Giovanni Leoni
  'trey-nyoni-39263', // Trey Nyoni
  'rio-ngumoha-39689', // Rio Ngumoha
  'jeremy-jacquet-38546', // Jérémy Jacquet
];

/**
 * Market untouchables: players whose clubs will not sell at any price.
 * Visible in the market browser, unbuyable. Proposal criterion: game value
 * EUR 100m and above (the generational core of rival superclubs), minus
 * players already at Liverpool.
 */
export const MARKET_UNTOUCHABLE_MIN_VALUE_M = 100;

/**
 * Named exceptions BELOW the value threshold that should still be locked
 * (club icons who would never be sold to Liverpool). Empty until Sam says
 * otherwise.
 */
export const MARKET_LOCKED_EXTRA: readonly string[] = [];

/**
 * Named exceptions ABOVE the threshold that SHOULD be buyable (e.g. a
 * superstar whose club is known to be selling). Empty until Sam says
 * otherwise.
 */
export const MARKET_UNLOCKED_EXCEPTIONS: readonly string[] = [];

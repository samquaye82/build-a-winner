/**
 * Locked player lists: THE file Sam edits.
 *
 * Player entries may be Capology slugs OR exact display names: whichever
 * is easier. Applied at config-build time by realConfig.ts, so edits here
 * take effect on refresh with no regeneration needed.
 *
 * Precedence, highest first:
 *   1. MARKET_UNLOCKED_EXCEPTIONS (always buyable)
 *   2. MARKET_LOCKED_EXTRA (always locked)
 *   3. MARKET_LOCKED_CLUBS (rivals never sell to Liverpool)
 *   4. MARKET_UNTOUCHABLE_MIN_VALUE_M (the EUR 100m+ superstars)
 */

/**
 * Liverpool players the board refuses to sell: the new-era spine and the
 * academy jewels. Everyone else is sellable.
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
  'victor-munoz-osasuna', // Victor Muñoz
];

/**
 * Clubs that would never sell to Liverpool at any price (Sam,
 * 12/07/2026): every player at these clubs is locked regardless of value.
 */
export const MARKET_LOCKED_CLUBS: readonly string[] = [
  'Manchester United',
  'Everton',
];

/**
 * Market untouchables: players whose clubs will not sell at any price.
 * Visible in the market browser, unbuyable. Criterion: game value EUR
 * 100m and above.
 */
export const MARKET_UNTOUCHABLE_MIN_VALUE_M = 100;

/**
 * Named exceptions that should always be locked even below the value
 * threshold and outside the rival clubs.
 */
export const MARKET_LOCKED_EXTRA: readonly string[] = [];

/**
 * Named exceptions that SHOULD be buyable despite the rules above.
 * Vinicius Junior is available in real life despite his value (Sam,
 * 12/07/2026).
 */
export const MARKET_UNLOCKED_EXCEPTIONS: readonly string[] = [
  'Vinicius Junior',
];

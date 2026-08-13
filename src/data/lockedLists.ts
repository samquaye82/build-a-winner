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
 * Liverpool players the board will not sell in the opening window, but
 * will listen to offers for from January 2027 onwards (Sam, 13/08/2026).
 *
 * The point is that protection is temporary: the board holds its nerve
 * through the summer, then every one of these becomes a real decision.
 * Van Dijk's deal expires in 2027, so from January he is a sell-or-lose
 * him choice rather than a fixture.
 */
export const LIVERPOOL_LOCKED_UNTIL_JANUARY: readonly string[] = [
  'florian-wirtz-37744', // Florian Wirtz
  'alexander-isak-36424', // Alexander Isak
  'hugo-ekitike-37427', // Hugo Ekitiké
  'milos-kerkez-37932', // Milos Kerkez
  'ryan-gravenberch-37392', // Ryan Gravenberch
  'virgil-van-dijk-33427', // Van Dijk (captain; renew him or lose him free)
  'Dominik Szoboszlai', // New deal to 2031 (Sam, 13/08/2026)
];

/**
 * Liverpool players who are not for sale at any point in the game: the
 * academy jewels and the summer's signings (Sam, 13/08/2026). Ronald
 * Araujo is unsellable too, but by a different route: he is on loan (see
 * LOANED_IN) and was never Liverpool's to sell.
 */
export const LIVERPOOL_LOCKED_ALWAYS: readonly string[] = [
  'giovanni-leoni-39072', // Giovanni Leoni
  'trey-nyoni-39263', // Trey Nyoni
  'rio-ngumoha-39689', // Rio Ngumoha
  'jeremy-jacquet-38546', // Jérémy Jacquet
  'victor-munoz-osasuna', // Victor Muñoz
];

/** A player borrowed for the 2026/27 season. */
export interface LoanedPlayer {
  /** Capology slug or exact display name, as with the lists above. */
  player: string;
  /** Wage Liverpool pays while he is here, in EUR m per year. */
  salaryEurM: number;
  /** Where he returns to, for the note on his card. */
  from: string;
}

/**
 * Players at Liverpool on loan for 2026/27 rather than under contract.
 *
 * They are listed in the dataset at the club that OWNS them, and lifted
 * out of the market into the squad by realConfig.ts. That is what makes
 * the return work: when the loan ends the engine drops them from the
 * squad, and they are already sitting in the Summer 2027 market at their
 * parent club, buyable for a fee like anyone else. Nothing is synthesised.
 *
 * They fill a registration slot and can be picked, which is the point of
 * them, but they are not the club's to trade: the engine blocks both sale
 * and renewal, and the card shows an "On loan" badge in place of a fee.
 */
export const LOANED_IN: readonly LoanedPlayer[] = [
  { player: 'Ronald Araujo', salaryEurM: 12.5, from: 'Barcelona' },
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
export const MARKET_UNTOUCHABLE_MIN_VALUE_M = 150;

/**
 * Named exceptions that should always be locked even below the value
 * threshold and outside the rival clubs.
 */
export const MARKET_LOCKED_EXTRA: readonly string[] = [];

/**
 * Named exceptions that SHOULD be buyable despite the rules above.
 *
 * Vinicius Junior was here while his contract ran down; he signed a new
 * deal to 2032 and is untouchable again, so the value threshold now
 * covers him without a named entry (Sam, 13/08/2026).
 */
export const MARKET_UNLOCKED_EXCEPTIONS: readonly string[] = [
  'Yan Diomande'
];

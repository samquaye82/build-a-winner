/**
 * Players out on loan for the 2026/27 season.
 *
 * Modelled the same way as Ronald Araujo's loan to Liverpool (`LOANED_IN`
 * in lockedLists.ts), and for the same reason (Sam, 20/08/2026): a loan is
 * not a transfer. The player belongs to his parent club, spends the season
 * at the borrowing club, and goes back when the loan ends.
 *
 * So the dataset's club column stays the OWNER throughout, and these
 * entries move him to the borrower for the windows the loan covers:
 *
 * - Summer 2026 and January 2027 (the 2026/27 season): he appears at the
 *   borrowing club, in that club's league.
 * - Summer 2027: the loan has ended, so he is back at his parent club.
 *
 * Ownership never moves, which matters beyond display. A loaned-out player
 * is still bought from the club that owns him, so `MARKET_LOCKED_CLUBS`
 * keeps working: a Manchester United player on loan elsewhere is still
 * unavailable to Liverpool.
 */

/** One player out on loan for 2026/27. */
export interface LoanedOutPlayer {
  /** Capology slug or exact display name, as with the other lists. */
  player: string;
  /** The club that owns him, stated so a mismatch is caught, not applied. */
  from: string;
  /** The club he plays for this season. */
  to: string;
}

/**
 * The loans in force for 2026/27.
 *
 * Every entry is verified against the dataset at build time: the player
 * must exist, and both clubs must be clubs the dataset holds, or the entry
 * is reported and skipped rather than applied to the wrong player.
 */
export const LOANED_OUT: readonly LoanedOutPlayer[] = [
  { player: 'Altay Bayındır', from: 'Manchester United', to: 'Celta Vigo' },
  { player: 'Guglielmo Vicario', from: 'Tottenham', to: 'Juventus' },
  { player: 'Romain Faivre', from: 'Bournemouth', to: 'Auxerre' },
  { player: 'Odysseas Vlachodimos', from: 'Newcastle', to: 'Sevilla' },
];

/**
 * The Manchester City sanction (Sam, 03/10/2026).
 *
 * City have been found guilty of breaking the Premier League's financial
 * rules and docked points, and their players all want out. From Summer 2027
 * the club sells at a discount: every player City own is listed at half his
 * transfer fee, and the board's refusal to sell lifts, so even the
 * untouchables (Erling Haaland) can be bought.
 *
 * Only the fee moves. Wage demands, contract demands and book value are
 * untouched (Sam): a City signing joins worth his full value, which is
 * exactly what makes the fire sale a bargain. The engine's no-resale rule
 * (a signing cannot be sold in the window he joined) stops that gap being
 * cashed in on the spot.
 *
 * Ownership decides, as it does for the locked clubs: a City player on
 * loan elsewhere is still City's to sell, and the dataset's club column is
 * always the owner (see loansOut.ts). The points deduction itself has no
 * in-game effect, since nothing in the game projects rivals' points.
 *
 * Applied in realConfig.ts while the market pools are built, so it is data
 * and needs no engine support. Any change here makes scores incomparable:
 * bump ENGINE_VERSION.
 */
import { roundMoney, type MarketPlayer } from '../engine';

/** The terms of a club's sanction, as the market applies them. */
export interface ClubSanction {
  /** The sanctioned club, as the dataset's club column names it. */
  club: string;
  /** Id of the first window the discount applies in; it holds thereafter. */
  fromWindowId: string;
  /** Multiplier on the transfer fee, e.g. 0.5 for half price. */
  feeMultiplier: number;
  /** Number of charges the club was found guilty of, for the news page. */
  charges: number;
}

/** Manchester City's sanction: half-price fees from Summer 2027. */
export const CITY_SANCTION: ClubSanction = {
  club: 'Manchester City',
  fromWindowId: 'summer-2027',
  feeMultiplier: 0.5,
  charges: 114,
};

/**
 * Applies a sanction to one market listing.
 *
 * @param listing - The listing as built from the dataset.
 * @param owner - The club that owns the player (the dataset's club column,
 *   not the listing's `club`, which shows a loanee at his borrowing club).
 * @param windowIndex - The window the listing belongs to.
 * @param startIndex - Index of the sanction's first window.
 * @param sanction - The sanction to apply.
 * @returns The listing with its fee discounted and its lock lifted when the
 *   sanction covers it; otherwise the listing unchanged.
 */
export function applySanction(
  listing: MarketPlayer,
  owner: string,
  windowIndex: number,
  startIndex: number,
  sanction: ClubSanction,
): MarketPlayer {
  if (owner !== sanction.club || windowIndex < startIndex) {
    return listing;
  }
  return {
    ...listing,
    fee: roundMoney(listing.fee * sanction.feeMultiplier),
    // A signing's book value falls back to his fee, so pin it to the
    // undiscounted figure: the player is worth no less for the sale.
    baseValue: listing.baseValue ?? listing.fee,
    locked: false,
  };
}

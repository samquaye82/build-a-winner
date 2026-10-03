/**
 * Tests for the Manchester City sanction: the pure listing transform on
 * fictional listings, then its effect on the real market pools.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  roundMoney,
  type MarketPlayer,
} from '../../src/engine';
import {
  applySanction,
  CITY_SANCTION,
  type ClubSanction,
} from '../../src/data/citySanction';
import gameData from '../../src/data/generated/gameData.json';
import { realConfig } from '../../src/data/realConfig';

/** A fictional sanction starting in the second window. */
const SANCTION: ClubSanction = {
  club: 'Sanctioned FC',
  fromWindowId: 'w1',
  feeMultiplier: 0.5,
  charges: 10,
};

/** A fictional listing, locked, with a book value above its fee. */
const LISTING: MarketPlayer = {
  id: 'fict-1',
  name: 'Fictional Forward',
  position: 'ST',
  age: 25,
  homegrown: false,
  quality: 85,
  fee: 99,
  wageDemand: 12,
  contractYears: 5,
  baseValue: 100,
  locked: true,
  club: 'Sanctioned FC',
};

describe('applySanction', () => {
  it('halves_the_fee_and_lifts_the_lock_from_the_start_window', () => {
    const sanctioned = applySanction(LISTING, 'Sanctioned FC', 1, 1, SANCTION);
    expect(sanctioned.fee).toBe(49.5);
    expect(sanctioned.locked).toBe(false);
  });

  it('holds_in_every_window_after_the_start', () => {
    expect(applySanction(LISTING, 'Sanctioned FC', 2, 1, SANCTION).fee).toBe(49.5);
  });

  it('keeps_wage_contract_and_book_value', () => {
    const sanctioned = applySanction(LISTING, 'Sanctioned FC', 1, 1, SANCTION);
    expect(sanctioned.wageDemand).toBe(12);
    expect(sanctioned.contractYears).toBe(5);
    expect(sanctioned.baseValue).toBe(100);
  });

  it('pins_book_value_to_the_full_fee_when_the_listing_has_none', () => {
    // A signing's book value falls back to his fee; halving the fee must
    // not halve what he is worth.
    const { baseValue: _omitted, ...withoutValue } = LISTING;
    const sanctioned = applySanction(withoutValue, 'Sanctioned FC', 1, 1, SANCTION);
    expect(sanctioned.baseValue).toBe(99);
  });

  it('leaves_listings_before_the_start_window_alone', () => {
    expect(applySanction(LISTING, 'Sanctioned FC', 0, 1, SANCTION)).toBe(LISTING);
  });

  it('leaves_other_clubs_alone', () => {
    expect(applySanction(LISTING, 'Other FC', 1, 1, SANCTION)).toBe(LISTING);
  });

  it('goes_by_owner_not_by_the_club_a_loanee_is_shown_at', () => {
    const onLoan = { ...LISTING, club: 'Borrowing FC' };
    expect(applySanction(onLoan, 'Sanctioned FC', 1, 1, SANCTION).fee).toBe(49.5);
  });
});

/** The dataset's raw terms for a player, by display name. */
function generated(name: string): (typeof gameData.market)[number] {
  const player = gameData.market.find((p) => p.name === name);
  if (player === undefined) {
    throw new Error(`${name} is not in the dataset`);
  }
  return player;
}

/** A player's listing in one of the real config's market pools. */
function listingIn(windowIndex: number, name: string): MarketPlayer {
  const listing = realConfig.marketByWindow[windowIndex]?.find((p) => p.name === name);
  if (listing === undefined) {
    throw new Error(`${name} is not in market ${String(windowIndex)}`);
  }
  return listing;
}

describe('the City sanction in the real config', () => {
  const startIndex = realConfig.windows.findIndex(
    (w) => w.id === CITY_SANCTION.fromWindowId,
  );

  it('starts_in_summer_2027', () => {
    expect(realConfig.windows[startIndex]?.label).toBe('Summer 2027');
  });

  it('prices_city_players_at_full_fee_in_january_2027', () => {
    const haaland = listingIn(0, 'Erling Haaland');
    expect(haaland.fee).toBe(generated('Erling Haaland').windows[0]?.fee);
    expect(haaland.locked).toBe(true);
  });

  it('halves_every_city_fee_from_summer_2027_keeping_wage_and_value', () => {
    const city = gameData.market.filter((p) => p.club === CITY_SANCTION.club);
    expect(city.length).toBeGreaterThan(20);
    for (let index = startIndex; index < realConfig.windows.length; index++) {
      for (const player of city) {
        const terms = player.windows[index];
        const listing = realConfig.marketByWindow[index]?.find((p) => p.id === player.id);
        if (terms === undefined || listing === undefined) {
          continue;
        }
        // Fees round to EUR 0.1m, so EUR 3.5m halves to EUR 1.8m.
        expect(listing.fee, player.name).toBe(roundMoney(terms.fee / 2));
        expect(listing.wageDemand, player.name).toBe(terms.wage);
        expect(listing.baseValue, player.name).toBe(terms.baseValue);
        expect(listing.locked, player.name).toBe(false);
      }
    }
  });

  it('unlocks_haaland_at_half_his_fee', () => {
    const haaland = listingIn(startIndex, 'Erling Haaland');
    expect(haaland.fee).toBe((generated('Erling Haaland').windows[startIndex]?.fee ?? 0) / 2);
    expect(haaland.locked).toBe(false);
  });

  it('leaves_other_clubs_at_full_fee', () => {
    const others = gameData.market.filter((p) => p.club !== CITY_SANCTION.club).slice(0, 200);
    for (const player of others) {
      const listing = realConfig.marketByWindow[startIndex]?.find((p) => p.id === player.id);
      if (listing !== undefined) {
        expect(listing.fee, player.name).toBe(player.windows[startIndex]?.fee);
      }
    }
  });

  it('cannot_be_flipped_for_profit_in_the_window_of_signing', () => {
    // Book value stays full while the fee halves: the engine's no-resale
    // rule is what stops an instant buy-and-sell.
    const state = createGame({
      ...realConfig,
      windows: realConfig.windows.slice(startIndex),
      marketByWindow: realConfig.marketByWindow.slice(startIndex),
    });
    const haaland = listingIn(startIndex, 'Erling Haaland');
    const bought = applyAction(state, { type: 'BUY', playerId: haaland.id });
    expect(() => applyAction(bought, { type: 'SELL', playerId: haaland.id })).toThrowError(
      expect.objectContaining({ code: 'PLAYER_SIGNED_THIS_WINDOW' }),
    );
  });
});

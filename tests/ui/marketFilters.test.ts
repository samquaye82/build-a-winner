/**
 * Tests for the market browser's pure filter logic.
 */
import { describe, expect, it } from 'vitest';
import type { MarketPlayer } from '../../src/engine';
import {
  clubsIn,
  EMPTY_FILTERS,
  filterMarket,
  leaguesIn,
} from '../../src/ui/helpers';

function player(overrides: Partial<MarketPlayer> & Pick<MarketPlayer, 'id'>): MarketPlayer {
  return {
    name: `Player ${overrides.id}`,
    position: 'ST',
    age: 25,
    homegrown: false,
    quality: 70,
    fee: 20,
    wageDemand: 3,
    contractYears: 5,
    club: 'Test FC',
    league: 'premier-league',
    ...overrides,
  };
}

const market: MarketPlayer[] = [
  player({ id: 'a', name: 'Hugo Ekitiké', quality: 83, league: 'premier-league', club: 'Liverpool' }),
  player({ id: 'b', name: 'Erling Haaland', quality: 90, league: 'premier-league', club: 'Manchester City', locked: true }),
  player({ id: 'c', name: 'Hans Vanaken', quality: 80, league: 'pro-league', club: 'Club Brugges', position: 'AM' }),
  player({ id: 'd', name: 'Mohamed Salah', quality: 91, league: 'free-agent', club: 'Free agent', position: 'RW', fee: 0 }),
];

describe('filterMarket', () => {
  it('ranks_by_quality_descending', () => {
    const { results, total } = filterMarket(market, EMPTY_FILTERS);
    expect(total).toBe(4);
    expect(results.map((p) => p.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('searches_accent_insensitively', () => {
    const { results } = filterMarket(market, { ...EMPTY_FILTERS, query: 'ekitike' });
    expect(results.map((p) => p.id)).toEqual(['a']);
  });

  it('filters_by_league_club_and_position', () => {
    expect(
      filterMarket(market, { ...EMPTY_FILTERS, league: 'pro-league' }).results.map((p) => p.id),
    ).toEqual(['c']);
    expect(
      filterMarket(market, { ...EMPTY_FILTERS, club: 'Manchester City' }).results.map((p) => p.id),
    ).toEqual(['b']);
    expect(
      filterMarket(market, { ...EMPTY_FILTERS, position: 'RW' }).results.map((p) => p.id),
    ).toEqual(['d']);
  });

  it('limits_results_but_reports_the_full_total', () => {
    const { results, total } = filterMarket(market, EMPTY_FILTERS, 2);
    expect(results).toHaveLength(2);
    expect(total).toBe(4);
  });
});

describe('league and club lists', () => {
  it('orders_leagues_by_display_order_and_clubs_alphabetically', () => {
    expect(leaguesIn(market)).toEqual(['premier-league', 'pro-league', 'free-agent']);
    expect(clubsIn(market, 'premier-league')).toEqual(['Liverpool', 'Manchester City']);
    expect(clubsIn(market, 'ALL')).toContain('Club Brugges');
  });
});

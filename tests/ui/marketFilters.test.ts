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

describe('filterMarket age and fee', () => {
  const pool: MarketPlayer[] = [
    player({ id: 'kid', age: 19, fee: 0 }),
    player({ id: 'u21-edge', age: 21, fee: 10 }),
    player({ id: 'prime', age: 25, fee: 25.5 }),
    player({ id: 'peak', age: 29, fee: 75 }),
    player({ id: 'vet', age: 30, fee: 150 }),
  ];
  const ids = (filters: Partial<typeof EMPTY_FILTERS>): string[] =>
    filterMarket(pool, { ...EMPTY_FILTERS, ...filters }).results.map((p) => p.id).sort();

  it('filters_by_age_band_with_inclusive_edges', () => {
    expect(ids({ age: 'U21' })).toEqual(['kid', 'u21-edge']);
    expect(ids({ age: '22-25' })).toEqual(['prime']);
    expect(ids({ age: '26-29' })).toEqual(['peak']);
    expect(ids({ age: '30+' })).toEqual(['vet']);
  });

  it('treats_zero_as_free_only_and_other_limits_as_inclusive_ceilings', () => {
    expect(ids({ maxFee: 0 })).toEqual(['kid']);
    expect(ids({ maxFee: 10 })).toEqual(['kid', 'u21-edge']);
    expect(ids({ maxFee: 25 })).toEqual(['kid', 'u21-edge']);
    expect(ids({ maxFee: null })).toHaveLength(5);
  });

  it('combines_age_and_fee', () => {
    expect(ids({ age: 'U21', maxFee: 0 })).toEqual(['kid']);
  });
});

describe('filterMarket pages', () => {
  const pool = Array.from({ length: 7 }, (_unused, i) =>
    player({ id: `p${String(i)}`, quality: 90 - i }),
  );

  it('returns_the_requested_page_in_rating_order', () => {
    const second = filterMarket(pool, EMPTY_FILTERS, 3, 1);
    expect(second.results.map((p) => p.id)).toEqual(['p3', 'p4', 'p5']);
    expect(second.page).toBe(1);
    expect(second.pageCount).toBe(3);
    expect(second.total).toBe(7);
  });

  it('returns_a_short_last_page', () => {
    expect(filterMarket(pool, EMPTY_FILTERS, 3, 2).results.map((p) => p.id)).toEqual(['p6']);
  });

  it('clamps_a_page_beyond_the_end_to_the_last', () => {
    const clamped = filterMarket(pool, EMPTY_FILTERS, 3, 9);
    expect(clamped.page).toBe(2);
    expect(clamped.results.map((p) => p.id)).toEqual(['p6']);
  });

  it('reports_one_empty_page_when_nothing_matches', () => {
    const none = filterMarket(pool, { ...EMPTY_FILTERS, query: 'nobody' }, 3, 0);
    expect(none).toEqual({ results: [], total: 0, page: 0, pageCount: 1 });
  });
});

describe('league and club lists', () => {
  it('orders_leagues_by_display_order_and_clubs_alphabetically', () => {
    expect(leaguesIn(market)).toEqual(['premier-league', 'pro-league', 'free-agent']);
    expect(clubsIn(market, 'premier-league')).toEqual(['Liverpool', 'Manchester City']);
    expect(clubsIn(market, 'ALL')).toContain('Club Brugges');
  });
});

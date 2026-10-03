/**
 * Tests for rivals read from the game as it stands (Sam, 03/10/2026): every
 * rival's squad comes from the market, so a player signed from a rival no
 * longer counts for them, and the season is projected against the league
 * the game leaves behind.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  autoPickBestXI,
  createGame,
  rivalsAt,
  simulateSeason,
  type Action,
  type GameConfig,
  type MarketPlayer,
} from '../../src/engine';
import { makeMarketPlayer, makeTestConfig, makeThreeWindowConfig } from './fixtures';

const LEAGUE = 'test-league';

/**
 * A rival club's players, all the same quality bar one star.
 *
 * @param club - The club.
 * @param quality - Quality of the twelve squad players.
 * @param star - The star's quality.
 * @returns Fourteen market listings.
 */
function club(club: string, quality: number, star: number): MarketPlayer[] {
  const squad = Array.from({ length: 13 }, (_unused, i) =>
    makeMarketPlayer({ id: `${club}-${String(i)}`, club, league: LEAGUE, quality, fee: 10 }),
  );
  return [...squad, makeMarketPlayer({ id: `${club}-star`, club, league: LEAGUE, quality: star, fee: 50 })];
}

/** A one-window game against two rival clubs, plus noise outside the league. */
function leagueConfig(): GameConfig {
  const config = makeTestConfig();
  return {
    ...config,
    rivalLeague: LEAGUE,
    marketByWindow: [
      [
        ...club('Alpha', 80, 92),
        ...club('Beta', 70, 75),
        makeMarketPlayer({ id: 'abroad', club: 'Elsewhere', league: 'other-league', quality: 95 }),
        makeMarketPlayer({ id: 'free', club: 'Free agent', league: 'free-agent', quality: 95 }),
      ],
    ],
  };
}

/** Strength of a named rival in a list. */
function strengthOf(rivals: readonly { name: string; strength: number }[], name: string): number {
  return rivals.find((r) => r.name === name)?.strength ?? Number.NaN;
}

describe('rivalsAt', () => {
  it('reads_each_rivals_squad_from_the_market_strongest_first', () => {
    const rivals = rivalsAt(createGame(leagueConfig()));
    expect(rivals.map((r) => r.name)).toEqual(['Alpha', 'Beta']);
  });

  it('ignores_other_leagues_and_free_agents', () => {
    const names = rivalsAt(createGame(leagueConfig())).map((r) => r.name);
    expect(names).not.toContain('Elsewhere');
    expect(names).not.toContain('Free agent');
  });

  it('stops_counting_a_player_for_his_club_once_signed', () => {
    const before = rivalsAt(createGame(leagueConfig()));
    const after = rivalsAt(
      applyAction(createGame(leagueConfig()), { type: 'BUY', playerId: 'Alpha-star' }),
    );
    expect(strengthOf(after, 'Alpha')).toBeLessThan(strengthOf(before, 'Alpha'));
    expect(strengthOf(after, 'Beta')).toBe(strengthOf(before, 'Beta'));
  });

  it('uses_the_configured_rivals_without_a_league', () => {
    const config = makeTestConfig();
    expect(rivalsAt(createGame(config))).toEqual(config.rivals);
  });
});

describe('the season projection', () => {
  it('plays_home_and_away_against_the_league_as_it_stands', () => {
    const state = createGame(leagueConfig());
    const projection = simulateSeason({ ...state, xi: autoPickBestXI(state) });
    expect(projection.played).toBe(4);
  });

  it('gains_from_signing_a_rivals_star_twice_over', () => {
    // He strengthens us and weakens them: the projection must see both.
    const state = createGame(leagueConfig());
    const signed = applyAction(state, { type: 'BUY', playerId: 'Alpha-star' });
    const baseline = simulateSeason({ ...state, xi: autoPickBestXI(state) });
    const after = simulateSeason({ ...signed, xi: autoPickBestXI(signed) });
    expect(after.points).toBeGreaterThanOrEqual(baseline.points);
    expect(after.goalsAgainst).toBeLessThan(baseline.goalsAgainst);
  });
});

describe('the market', () => {
  it('never_relists_a_signing_who_is_away_on_loan', () => {
    // buy-cb is authored into the January 2028 pool. Signed, then lent in
    // Summer 2027 to Summer 2028, he must not reappear there.
    const actions: Action[] = [
      { type: 'BUY', playerId: 'buy-cb' },
      { type: 'ADVANCE_WINDOW' },
      { type: 'LOAN_OUT', playerId: 'buy-cb' },
      { type: 'ADVANCE_WINDOW' },
    ];
    const state = actions.reduce(applyAction, createGame(makeThreeWindowConfig()));
    expect(state.loanedOut.map((l) => l.player.id)).toContain('buy-cb');
    expect(state.market.map((p) => p.id)).not.toContain('buy-cb');
  });
});

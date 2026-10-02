/**
 * Tests for the UEFA registration data and how realConfig applies it.
 *
 * The lists match players by slug or display name, and a wrong slug fails
 * silently: a club-trained graduate would quietly count as untrained, or an
 * academy player would quietly lose his List B place. So every entry must
 * match a real player, and every Liverpool player must have an entry.
 */
import { describe, expect, it } from 'vitest';
import {
  assignUefaLists,
  createGame,
  validateUefaRegistration,
} from '../../src/engine';
import { realConfig } from '../../src/data/realConfig';
import {
  LIVERPOOL_UEFA_REGISTRATION,
  MARKET_CLUB_TRAINED,
} from '../../src/data/uefaRegistration';

const state = createGame(realConfig);
const liverpoolPlayers = [
  ...state.squad,
  ...state.academy,
  ...state.loanedOut.map((loan) => loan.player),
];

/**
 * Finds a Liverpool first-team or academy player by id.
 *
 * @param id - The player's id.
 * @returns The player.
 * @throws {Error} If no such player exists, so a renamed slug fails loudly.
 */
function liverpoolPlayer(id: string) {
  const player = liverpoolPlayers.find((p) => p.id === id);
  if (player === undefined) {
    throw new Error(`No Liverpool player with id ${id}`);
  }
  return player;
}

describe('UEFA registration data', () => {
  it('gives_every_first_team_academy_and_loaned_out_player_an_entry', () => {
    // A player with no entry has no known spell, so he would be put on
    // List A however long he has been at the club.
    for (const player of liverpoolPlayers) {
      expect(player.uefaTraining, `${player.name} has no training`).toBeDefined();
      expect(player.joined, `${player.name} has no joined`).toBeDefined();
    }
  });

  it('matches_every_entry_to_a_liverpool_player', () => {
    for (const entry of LIVERPOOL_UEFA_REGISTRATION) {
      const matched = liverpoolPlayers.some(
        (p) => p.id === entry.player || p.name === entry.player,
      );
      expect(matched, `no Liverpool player matches "${entry.player}"`).toBe(true);
    }
  });

  it('lists_no_player_twice', () => {
    const names = LIVERPOOL_UEFA_REGISTRATION.map((entry) => entry.player);
    expect(new Set(names).size).toBe(names.length);
  });

  it('matches_every_market_graduate_to_a_market_player', () => {
    for (const graduate of MARKET_CLUB_TRAINED) {
      const matched = state.market.some(
        (p) => p.id === graduate || p.name === graduate,
      );
      expect(matched, `no market player matches "${graduate}"`).toBe(true);
    }
  });

  it('applies_the_authored_facts_to_the_squad', () => {
    expect(liverpoolPlayer('joe-gomez-35573').uefaTraining).toBe('club');
    expect(liverpoolPlayer('joe-gomez-35573').joined).toEqual({
      season: 2015,
      midSeason: false,
    });
    expect(liverpoolPlayer('jeremie-frimpong-36870').uefaTraining).toBe(
      'association',
    );
    expect(liverpoolPlayer('florian-wirtz-37744').uefaTraining).toBe('none');
    // January 2023 sits in the 2022/23 season.
    expect(liverpoolPlayer('cody-gakpo-36287').joined).toEqual({
      season: 2022,
      midSeason: true,
    });
  });

  it('applies_the_authored_facts_to_the_academy', () => {
    expect(liverpoolPlayer('kaide-gordon').uefaTraining).toBe('club');
    expect(liverpoolPlayer('armin-pesci').uefaTraining).toBe('none');
  });

  it('applies_the_authored_facts_to_a_player_on_loan_to_liverpool', () => {
    const araujo = state.squad.find((p) => p.name === 'Ronald Araujo');
    expect(araujo?.onLoan).toBe(true);
    expect(araujo?.joined).toEqual({ season: 2026, midSeason: false });
  });
});

describe('the opening squad', () => {
  it('opens_one_over_25_and_two_over_the_open_places', () => {
    // The January puzzle (Sam, 02/10/2026). Jacquet and Leoni are under 21,
    // so the Premier League exempts them, but neither has List B's two
    // years at the club, so both are on List A. Elliott, away at Valencia,
    // takes a locally trained player with him. List A has 26 against a
    // maximum of 25, and 19 players outside the reserved places against 17.
    const window = realConfig.windows[0]!;
    const lists = assignUefaLists(state.squad, window);
    expect(lists.listA).toHaveLength(26);
    expect(lists.locallyTrained).toBe(7);
    expect(lists.inOpenPlaces).toBe(19);
    expect(lists.listA).toContain('jeremy-jacquet-38546');
    expect(lists.listA).toContain('giovanni-leoni-39072');
    expect(validateUefaRegistration(state.squad, window).map((v) => v.code)).toEqual([
      'UCL_LIST_A_OVER_LIMIT',
      'UCL_OPEN_PLACES_EXCEEDED',
    ]);
  });
});

describe('market training status', () => {
  it('marks_liverpool_graduates_as_club_trained_in_every_window', () => {
    for (const pool of realConfig.marketByWindow) {
      const trent = pool.find((p) => p.name === 'Trent Alexander-Arnold');
      expect(trent?.uefaTraining).toBe('club');
    }
  });

  it('derives_association_training_from_home_grown_status', () => {
    const pool = realConfig.marketByWindow[0] ?? [];
    const listed = new Set(MARKET_CLUB_TRAINED);
    const others = pool.filter((p) => !listed.has(p.id) && !listed.has(p.name));
    for (const player of others) {
      expect(player.uefaTraining, player.name).toBe(
        player.homegrown ? 'association' : 'none',
      );
    }
  });

  it('carries_no_joined_date_on_market_players', () => {
    // Time at another club is not time at Liverpool: the engine stamps a
    // spell when he signs.
    const pool = realConfig.marketByWindow[0] ?? [];
    expect(pool.every((p) => p.joined === undefined)).toBe(true);
  });
});

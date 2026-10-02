/**
 * Tests for ages from real birth dates (Sam, 03/10/2026): window dates,
 * ageing on birthdays, the real under-21 cutoff, and birth dates surviving
 * a player's moves through the game.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  countRegistration,
  createGame,
  currentWindow,
  isListBEligible,
  isU21,
  type Action,
  type GameConfig,
  type GameState,
} from '../../src/engine';
import { ageAt, ageOn, windowDate } from '../../src/engine/rules/age';
import {
  makeMarketPlayer,
  makeSquadPlayer,
  makeTestConfig,
  makeThreeWindowConfig,
  threeTestWindows,
} from './fixtures';

const advance: Action = { type: 'ADVANCE_WINDOW' };
const [january2027, summer2027, january2028] = threeTestWindows as [
  (typeof threeTestWindows)[number],
  (typeof threeTestWindows)[number],
  (typeof threeTestWindows)[number],
];

/**
 * The three-window fixture game with extra squad players.
 *
 * @param extra - Players to add.
 * @returns The config.
 */
function withPlayers(...extra: ReturnType<typeof makeSquadPlayer>[]): GameConfig {
  const config = makeThreeWindowConfig();
  return { ...config, initialSquad: [...config.initialSquad, ...extra] };
}

/** A player's age in a state, by id. */
function ageOf(state: GameState, id: string): number | undefined {
  return state.squad.find((p) => p.id === id)?.age;
}

/** Renews the two fixture contracts ending in 2027, keeping the squad viable. */
const keepSquad: Action[] = [
  { type: 'RENEW', playerId: 'cb2', newExpiryYear: 2030 },
  { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
];

describe('window dates and ages', () => {
  it('dates_a_summer_window_1_july_and_a_january_window_1_january', () => {
    expect(windowDate(summer2027)).toBe('2027-07-01');
    expect(windowDate(january2027)).toBe('2027-01-01');
    expect(windowDate(january2028)).toBe('2028-01-01');
  });

  it('counts_a_year_from_the_birthday_itself', () => {
    expect(ageOn('2001-07-01', '2027-07-01')).toBe(26);
    expect(ageOn('2001-07-02', '2027-07-01')).toBe(25);
    expect(ageOn('2000-02-29', '2027-02-28')).toBe(26);
  });

  it('keeps_the_authored_age_without_a_birth_date', () => {
    expect(ageAt({ age: 30 }, summer2027)).toBe(30);
  });
});

describe('ageing through the game', () => {
  it('replaces_a_stale_authored_age_at_the_start', () => {
    // Authored as 27, but born 20/12/1998 he is 28 by January 2027.
    const state = createGame(
      withPlayers(makeSquadPlayer({ id: 'm', age: 27, birthDate: '1998-12-20' })),
    );
    expect(ageOf(state, 'm')).toBe(28);
  });

  it('ages_a_player_on_his_birthday_between_windows', () => {
    // Born 15/03/2001: 25 in January 2027, 26 by Summer 2027.
    const config = withPlayers(makeSquadPlayer({ id: 'march', birthDate: '2001-03-15' }));
    const january = createGame(config);
    expect(ageOf(january, 'march')).toBe(25);
    expect(ageOf(applyAction(january, advance), 'march')).toBe(26);
  });

  it('does_not_age_anyone_merely_for_a_new_season', () => {
    // Born 01/10/2001: still 25 in Summer 2027, 26 by January 2028.
    const config = withPlayers(makeSquadPlayer({ id: 'october', birthDate: '2001-10-01' }));
    const summer = [...keepSquad, advance].reduce(applyAction, createGame(config));
    expect(ageOf(summer, 'october')).toBe(25);
    expect(ageOf(applyAction(summer, advance), 'october')).toBe(26);
  });

  it('ages_the_academy_and_players_away_on_loan_the_same_way', () => {
    const config: GameConfig = {
      ...makeThreeWindowConfig(),
      academy: [
        { ...makeThreeWindowConfig().academy![0]!, id: 'kid', birthDate: '2008-03-01' },
      ],
      loanedOut: [
        {
          player: makeSquadPlayer({
            id: 'away',
            birthDate: '2004-05-01',
            contract: { expiryYear: 2030, salary: 1 },
          }),
          club: 'Borrowers FC',
          returnsInWindow: 2,
        },
      ],
    };
    const summer = [...keepSquad, advance].reduce(applyAction, createGame(config));
    expect(summer.academy.find((p) => p.id === 'kid')?.age).toBe(19);
    expect(summer.loanedOut[0]?.player.age).toBe(23);
  });
});

describe('the under-21 cutoff', () => {
  it('is_born_on_or_after_1_january_twenty_one_years_before_the_season', () => {
    // 2026/27: born on or after 01/01/2005.
    expect(isU21({ age: 22, birthDate: '2005-01-01' }, january2027)).toBe(true);
    expect(isU21({ age: 21, birthDate: '2004-12-31' }, january2027)).toBe(false);
    // 2027/28 moves the cutoff on a year.
    expect(isU21({ age: 22, birthDate: '2005-01-01' }, summer2027)).toBe(false);
    expect(isU21({ age: 21, birthDate: '2006-01-01' }, summer2027)).toBe(true);
  });

  it('holds_for_the_whole_season_whatever_his_birthday', () => {
    // Born 01/01/2005: under 21 all through 2026/27, though 22 by its end.
    expect(isU21({ age: 22, birthDate: '2005-01-01' }, january2027)).toBe(true);
  });

  it('decides_the_registration_count', () => {
    const config = withPlayers(
      makeSquadPlayer({ id: 'under', birthDate: '2005-06-01' }),
      makeSquadPlayer({ id: 'over', birthDate: '2004-06-01' }),
    );
    const state = createGame(config);
    const base = countRegistration(createGame(makeThreeWindowConfig()).squad, currentWindow(state));
    const counts = countRegistration(state.squad, currentWindow(state));
    expect(counts.u21 - base.u21).toBe(1);
    expect(counts.over21 - base.over21).toBe(1);
  });

  it('decides_uefa_list_b_too', () => {
    const longServing = { season: 2018, midSeason: false };
    expect(
      isListBEligible({ age: 21, birthDate: '2005-02-01', joined: longServing }, january2027),
    ).toBe(true);
    expect(
      isListBEligible({ age: 21, birthDate: '2004-12-31', joined: longServing }, january2027),
    ).toBe(false);
  });
});

describe('birth dates travel with the player', () => {
  it('carries_a_birth_date_onto_a_signing', () => {
    const config = makeTestConfig();
    const listing = makeMarketPlayer({ id: 'signing', birthDate: '2002-04-04' });
    const state = applyAction(
      createGame({ ...config, marketByWindow: [[listing]] }),
      { type: 'BUY', playerId: 'signing' },
    );
    expect(state.squad.find((p) => p.id === 'signing')?.birthDate).toBe('2002-04-04');
  });

  it('carries_a_birth_date_into_free_agency', () => {
    const config = makeThreeWindowConfig();
    const squad = config.initialSquad.map((p) =>
      p.id === 'cm1' ? { ...p, birthDate: '2000-05-05' } : p,
    );
    const state = applyAction(createGame({ ...config, initialSquad: squad }), advance);
    const listing = state.market.find((p) => p.id === 'cm1');
    expect(listing?.birthDate).toBe('2000-05-05');
    expect(listing?.age).toBe(27);
  });
});

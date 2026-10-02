/**
 * Tests for the UEFA Champions League squad registration rules: List B
 * eligibility, the automatic List A / List B assignment, the locally
 * trained quota and its shortfall penalty, and the goalkeeper floors.
 *
 * Squads here are built to order from fictional players, so each test can
 * set the exact counts it is about.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  assignUefaLists,
  createGame,
  isListBEligible,
  meetsListBTenure,
  seasonTime,
  validateUefaRegistration,
  type PlayerCore,
  type Position,
  type SeasonPoint,
  type UefaTraining,
  type WindowConfig,
} from '../../src/engine';
import { makeMarketPlayer, makeSquadPlayer, makeTestConfig } from './fixtures';

/** A summer window opening the 2026/27 season. */
const summer: WindowConfig = {
  id: 'summer-2027',
  label: 'Summer 2027',
  seasonStartYear: 2026,
  midSeason: false,
  budget: 0,
  squadCostCapBase: 250,
};

/** The January window six months into the same season. */
const january: WindowConfig = {
  ...summer,
  id: 'january-2027',
  label: 'January 2027',
  midSeason: true,
};

/** A spell long enough for List B in either window above. */
const longServing: SeasonPoint = { season: 2020, midSeason: false };

/** Options for one fictional player. */
interface Spec {
  position?: Position;
  age?: number;
  training?: UefaTraining;
  joined?: SeasonPoint;
}

/**
 * Builds a fictional player. Senior (26), an outfielder, untrained and
 * with no known spell unless the spec says otherwise.
 *
 * @param id - Unique id.
 * @param spec - Fields to set.
 * @returns The player.
 */
function player(id: string, spec: Spec = {}): PlayerCore {
  return makeSquadPlayer({
    id,
    position: spec.position ?? 'CM',
    age: spec.age ?? 26,
    ...(spec.training !== undefined && { uefaTraining: spec.training }),
    ...(spec.joined !== undefined && { joined: spec.joined }),
  });
}

/**
 * Builds a run of identical fictional players.
 *
 * @param prefix - Id prefix; players are numbered from 1.
 * @param count - How many to build.
 * @param spec - Fields every one of them gets.
 * @returns The players.
 */
function players(prefix: string, count: number, spec: Spec = {}): PlayerCore[] {
  return Array.from({ length: count }, (_unused, i) =>
    player(`${prefix}${String(i + 1)}`, spec),
  );
}

/** Three senior keepers: enough for both goalkeeper floors. */
function keepers(): PlayerCore[] {
  return players('gk', 3, { position: 'GK' });
}

describe('seasonTime', () => {
  it('puts_january_half_a_year_after_the_summer_of_its_season', () => {
    expect(seasonTime({ season: 2026, midSeason: false })).toBe(2026);
    expect(seasonTime({ season: 2026, midSeason: true })).toBe(2026.5);
  });
});

describe('List B eligibility', () => {
  it('needs_two_full_years_at_the_club', () => {
    // Joined January 2025: a year and a half by Summer 2026, two years by
    // January 2027.
    const joined = { joined: { season: 2024, midSeason: true } };
    expect(meetsListBTenure(joined, summer)).toBe(false);
    expect(meetsListBTenure(joined, january)).toBe(true);
  });

  it('counts_exactly_two_years_as_enough', () => {
    expect(
      meetsListBTenure({ joined: { season: 2024, midSeason: false } }, summer),
    ).toBe(true);
  });

  it('never_qualifies_a_player_whose_spell_is_unknown', () => {
    expect(meetsListBTenure({}, summer)).toBe(false);
  });

  it('needs_youth_as_well_as_tenure', () => {
    expect(isListBEligible({ age: 21, joined: longServing }, summer)).toBe(true);
    expect(isListBEligible({ age: 22, joined: longServing }, summer)).toBe(false);
    expect(isListBEligible({ age: 19 }, summer)).toBe(false);
  });

  it('never_qualifies_a_player_signed_during_the_game', () => {
    // A young signing is registration-exempt in the Premier League, but
    // his spell at the club starts on the day he signs.
    const config = makeTestConfig();
    const listing = makeMarketPlayer({ id: 'teenager', age: 18 });
    const state = applyAction(
      createGame({ ...config, marketByWindow: [[listing]] }),
      { type: 'BUY', playerId: 'teenager' },
    );
    const signed = state.squad.find((p) => p.id === 'teenager');
    expect(signed).toBeDefined();
    expect(isListBEligible(signed!, config.windows[0]!)).toBe(false);
  });
});

describe('assignUefaLists', () => {
  it('puts_every_eligible_player_on_list_b_and_everyone_else_on_list_a', () => {
    const squad = [
      ...keepers(),
      player('senior'),
      player('youth', { age: 19, joined: longServing }),
      player('new-youth', { age: 19 }),
    ];
    const lists = assignUefaLists(squad, summer);
    expect(lists.listB).toEqual(['youth']);
    expect(lists.listA).toEqual(['gk1', 'gk2', 'gk3', 'senior', 'new-youth']);
  });

  it('allows_the_full_25_with_eight_locally_trained', () => {
    const lists = assignUefaLists(
      [...players('home', 8, { training: 'club' }), ...players('x', 17)],
      summer,
    );
    expect(lists.locallyTrained).toBe(8);
    expect(lists.listALimit).toBe(25);
  });

  it('cuts_the_limit_by_one_for_each_unfilled_reserved_place', () => {
    // UEFA's own example: six locally trained players, a limit of 23.
    const lists = assignUefaLists(
      [...players('home', 6, { training: 'club' }), ...players('x', 10)],
      summer,
    );
    expect(lists.locallyTrained).toBe(6);
    expect(lists.listALimit).toBe(23);
  });

  it('counts_no_more_than_four_association_trained_players', () => {
    const lists = assignUefaLists(
      [
        ...players('club', 2, { training: 'club' }),
        ...players('assoc', 6, { training: 'association' }),
      ],
      summer,
    );
    expect(lists.clubTrained).toBe(2);
    expect(lists.associationTrained).toBe(6);
    expect(lists.locallyTrained).toBe(6);
    expect(lists.listALimit).toBe(23);
  });

  it('fills_the_eight_with_four_of_each', () => {
    const lists = assignUefaLists(
      [
        ...players('club', 4, { training: 'club' }),
        ...players('assoc', 4, { training: 'association' }),
      ],
      summer,
    );
    expect(lists.locallyTrained).toBe(8);
    expect(lists.listALimit).toBe(25);
  });

  it('never_counts_more_than_eight_however_many_are_trained', () => {
    const lists = assignUefaLists(
      players('club', 12, { training: 'club' }),
      summer,
    );
    expect(lists.locallyTrained).toBe(8);
    expect(lists.listALimit).toBe(25);
  });

  it('earns_no_quota_from_locally_trained_players_on_list_b', () => {
    const graduate = player('graduate', {
      age: 20,
      training: 'club',
      joined: longServing,
    });
    const lists = assignUefaLists([...keepers(), graduate], summer);
    expect(lists.listB).toEqual(['graduate']);
    expect(lists.clubTrained).toBe(0);
  });

  it('treats_a_player_with_no_training_status_as_untrained', () => {
    const lists = assignUefaLists([player('unknown')], summer);
    expect(lists.locallyTrained).toBe(0);
  });

  describe('goalkeepers', () => {
    it('leaves_a_young_keeper_on_list_b_when_list_a_has_two', () => {
      const squad = [
        ...players('gk', 2, { position: 'GK' }),
        player('young-gk', { position: 'GK', age: 19, joined: longServing }),
      ];
      const lists = assignUefaLists(squad, summer);
      expect(lists.listB).toEqual(['young-gk']);
      expect(lists.goalkeepers).toBe(3);
    });

    it('moves_young_keepers_up_when_list_a_is_short_of_two', () => {
      const young = { position: 'GK' as const, age: 19, joined: longServing };
      const squad = [
        player('gk1', { position: 'GK' }),
        player('young-a', young),
        player('young-b', young),
      ];
      const lists = assignUefaLists(squad, summer);
      expect(lists.listA).toEqual(['gk1', 'young-a']);
      expect(lists.listB).toEqual(['young-b']);
    });

    it('moves_up_the_keeper_who_earns_quota_first', () => {
      const young = { position: 'GK' as const, age: 19, joined: longServing };
      const squad = [
        player('gk1', { position: 'GK' }),
        player('a-untrained', young),
        player('b-association', { ...young, training: 'association' }),
        player('c-club', { ...young, training: 'club' }),
      ];
      const lists = assignUefaLists(squad, summer);
      expect(lists.listA).toEqual(['gk1', 'c-club']);
      expect(lists.clubTrained).toBe(1);
    });

    it('breaks_ties_by_id_whatever_the_squad_order', () => {
      const young = { position: 'GK' as const, age: 19, joined: longServing };
      const squad = [
        player('gk1', { position: 'GK' }),
        player('young-z', young),
        player('young-a', young),
      ];
      const forwards = assignUefaLists(squad, summer);
      const backwards = assignUefaLists([...squad].reverse(), summer);
      expect(forwards.listA).toContain('young-a');
      expect(backwards.listA).toContain('young-a');
    });
  });
});

describe('validateUefaRegistration', () => {
  it('passes_a_squad_that_fits_both_lists', () => {
    const squad = [
      ...keepers(),
      ...players('home', 8, { training: 'club' }),
      ...players('x', 14),
      ...players('youth', 10, { age: 19, joined: longServing }),
    ];
    // 25 on List A, 10 on List B.
    expect(validateUefaRegistration(squad, summer)).toEqual([]);
  });

  it('flags_a_list_a_over_the_full_limit', () => {
    const squad = [
      ...keepers(),
      ...players('home', 8, { training: 'club' }),
      ...players('x', 15),
    ];
    const violations = validateUefaRegistration(squad, summer);
    expect(violations.map((v) => v.code)).toEqual(['UCL_LIST_A_OVER_LIMIT']);
    expect(violations[0]?.message).toBe(
      'UEFA List A needs 26 places; the limit is 25',
    );
  });

  it('flags_a_list_a_over_its_reduced_limit_and_says_why', () => {
    // 24 players would fit a full list, but six locally trained cut it to 23.
    const squad = [
      ...keepers(),
      ...players('home', 6, { training: 'club' }),
      ...players('x', 15),
    ];
    const violations = validateUefaRegistration(squad, summer);
    expect(violations[0]?.message).toBe(
      'UEFA List A needs 24 places; with 6 of 8 locally trained places filled, the limit is 23',
    );
  });

  it('accepts_a_short_quota_when_the_squad_fits_the_reduced_limit', () => {
    const squad = [
      ...keepers(),
      ...players('home', 6, { training: 'club' }),
      ...players('x', 14),
    ];
    expect(validateUefaRegistration(squad, summer)).toEqual([]);
  });

  it('requires_three_goalkeepers_across_both_lists', () => {
    const squad = players('gk', 2, { position: 'GK' });
    const violations = validateUefaRegistration(squad, summer);
    expect(violations.map((v) => v.code)).toEqual([
      'UCL_NOT_ENOUGH_GOALKEEPERS',
    ]);
    expect(violations[0]?.message).toBe(
      'Squad has 2 goalkeeper(s); UEFA requires 3 across Lists A and B',
    );
  });

  it('counts_a_young_keeper_on_list_b_towards_the_three', () => {
    const squad = [
      ...players('gk', 2, { position: 'GK' }),
      player('young-gk', { position: 'GK', age: 18, joined: longServing }),
    ];
    expect(validateUefaRegistration(squad, summer)).toEqual([]);
  });
});

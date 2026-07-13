/**
 * Tests for the registration and budget rules and aggregate validation.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  countRegistration,
  createGame,
  isSubmittable,
  isU21,
  validateState,
  type GameState,
  type SquadPlayerSeed,
} from '../../src/engine';
import { validateRegistration } from '../../src/engine/rules/registration';
import { makeSquadPlayer, makeTestConfig } from './fixtures';

/**
 * Builds a squad of `count` over-21 players plus a goalkeeper, with a given
 * number of them non-home-grown.
 */
function squadOf(count: number, nonHomegrown: number): SquadPlayerSeed[] {
  const players: SquadPlayerSeed[] = [
    makeSquadPlayer({ id: 'gk', position: 'GK', homegrown: true }),
  ];
  for (let i = 1; i < count; i += 1) {
    players.push(
      makeSquadPlayer({ id: `p${String(i)}`, homegrown: i > nonHomegrown }),
    );
  }
  return players;
}

describe('isU21', () => {
  it('treats_age_21_as_exempt_and_age_22_as_registrable', () => {
    expect(isU21({ age: 21 })).toBe(true);
    expect(isU21({ age: 22 })).toBe(false);
  });
});

describe('countRegistration', () => {
  it('counts_the_fixture_squad_correctly', () => {
    const counts = countRegistration(makeTestConfig().initialSquad);
    expect(counts).toEqual({
      over21: 10,
      nonHomegrownOver21: 7,
      // gk1, rb1, cm1, am1 are home-grown (am1 is a U21 HG player).
      homegrown: 4,
      u21: 2,
      total: 12,
      goalkeepers: 2,
    });
  });
});

describe('validateRegistration', () => {
  it('accepts_a_legal_squad', () => {
    expect(validateRegistration(makeTestConfig().initialSquad)).toEqual([]);
  });

  it('flags_more_than_25_over21_players', () => {
    const violations = validateRegistration(squadOf(26, 0));
    expect(violations.map((v) => v.code)).toContain('OVER21_LIMIT_EXCEEDED');
  });

  it('accepts_exactly_25_over21_players', () => {
    expect(validateRegistration(squadOf(25, 0))).toEqual([]);
  });

  it('flags_more_than_17_non_homegrown_players', () => {
    const violations = validateRegistration(squadOf(25, 18));
    expect(violations.map((v) => v.code)).toContain(
      'NON_HOMEGROWN_LIMIT_EXCEEDED',
    );
  });

  it('accepts_exactly_17_non_homegrown_players', () => {
    expect(validateRegistration(squadOf(25, 17))).toEqual([]);
  });

  it('exempts_u21_players_from_both_limits', () => {
    // 25 registrable players, plus 5 U21s who would breach both limits if
    // they counted.
    const squad = squadOf(25, 17);
    for (let i = 0; i < 5; i += 1) {
      squad.push(
        makeSquadPlayer({ id: `u21-${String(i)}`, age: 19, homegrown: false }),
      );
    }
    expect(validateRegistration(squad)).toEqual([]);
  });

  it('flags_a_squad_too_small_to_field_an_XI', () => {
    const violations = validateRegistration(squadOf(10, 0));
    expect(violations.map((v) => v.code)).toContain('SQUAD_TOO_SMALL');
  });

  it('flags_a_squad_with_no_goalkeeper', () => {
    const squad = squadOf(12, 0).filter((p) => p.position !== 'GK');
    const violations = validateRegistration(squad);
    expect(violations.map((v) => v.code)).toContain('NOT_ENOUGH_GOALKEEPERS');
  });
});

describe('budget validation', () => {
  /** Spends deep into the red: 100 - 60 - 35 - 25 = -20. */
  function overspentGame(): GameState {
    return (
      [
        { type: 'BUY', playerId: 'buy-st' },
        { type: 'BUY', playerId: 'buy-cb' },
        { type: 'BUY', playerId: 'buy-hg' },
      ] as const
    ).reduce(applyAction, createGame(makeTestConfig()));
  }

  it('flags_an_overspent_plan', () => {
    const violations = validateState(overspentGame());
    expect(violations.map((v) => v.code)).toContain('BUDGET_EXCEEDED');
  });

  it('blocks_submission_while_overspent_and_unblocks_after_a_sale', () => {
    const overspent = overspentGame();
    expect(isSubmittable(overspent)).toBe(false);

    // Selling rw1 (EUR 55m) covers the EUR 20m shortfall.
    const solvent = applyAction(overspent, { type: 'SELL', playerId: 'rw1' });
    expect(isSubmittable(solvent)).toBe(true);
  });

  it('accepts_a_plan_with_exactly_zero_funds', () => {
    // Spending to the last euro is legal; only negative funds violate.
    const state = createGame(makeTestConfig());
    expect(validateState({ ...state, funds: 0 })).toEqual([]);
  });
});

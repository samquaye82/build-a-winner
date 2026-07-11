/**
 * Tests for the squad cost ratio rule.
 *
 * Fixture baseline: wage bill 62 + baseline amortisation 60 = 122 against a
 * cap of 175 (season revenue 250 x 0.7).
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSquadCost,
  createGame,
  isSubmittable,
  validateState,
  type Action,
  type GameState,
} from '../../src/engine';
import { makeTestConfig } from './fixtures';

/** Applies actions to a fresh single-window game. */
function play(...actions: Action[]): GameState {
  return actions.reduce(applyAction, createGame(makeTestConfig()));
}

describe('computeSquadCost', () => {
  it('computes_the_starting_breakdown', () => {
    expect(computeSquadCost(play())).toEqual({
      wageBill: 62,
      baselineAmortisation: 60,
      signingAmortisation: 0,
      total: 122,
      cap: 175,
      ratio: 0.488,
    });
  });

  it('adds_wages_and_amortisation_for_a_signing', () => {
    // buy-st: fee 60 over 5 years = 12 amortisation, wage 9.
    const cost = computeSquadCost(play({ type: 'BUY', playerId: 'buy-st' }));
    expect(cost.wageBill).toBe(71);
    expect(cost.signingAmortisation).toBe(12);
    expect(cost.total).toBe(143);
  });

  it('removes_both_again_when_the_signing_is_sold_on', () => {
    const cost = computeSquadCost(
      play(
        { type: 'BUY', playerId: 'buy-st' },
        { type: 'SELL', playerId: 'buy-st' },
      ),
    );
    expect(cost.total).toBe(122);
  });

  it('drops_a_starting_players_wage_but_never_the_baseline', () => {
    // Selling cm1 (salary 8) reduces wages; baseline amortisation is a
    // club-level total and is untouchable by sales.
    const cost = computeSquadCost(play({ type: 'SELL', playerId: 'cm1' }));
    expect(cost.wageBill).toBe(54);
    expect(cost.baselineAmortisation).toBe(60);
    expect(cost.total).toBe(114);
  });

  it('counts_a_renewal_salary_increase_in_the_wage_bill', () => {
    // cm1 renewal to 2030: salary 8 -> 11.7 (see actions.test).
    const cost = computeSquadCost(
      play({ type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 }),
    );
    expect(cost.wageBill).toBe(65.7);
  });
});

describe('validateScr', () => {
  /** A config with tight revenue: 190 x 0.7 = 133 against 122 starting. */
  function tightGame(): GameState {
    const config = makeTestConfig();
    return createGame({
      ...config,
      windows: config.windows.map((w) => ({ ...w, squadCostCapBase: 190 })),
    });
  }

  it('accepts_a_squad_within_the_cap', () => {
    expect(validateState(tightGame())).toEqual([]);
  });

  it('flags_a_signing_that_bursts_the_cap', () => {
    // buy-st adds 21 (wage 9 + amortisation 12): 143 > 133.
    const state = applyAction(tightGame(), { type: 'BUY', playerId: 'buy-st' });
    expect(validateState(state).map((v) => v.code)).toContain('SCR_EXCEEDED');
    expect(isSubmittable(state)).toBe(false);
  });

  it('unblocks_when_wages_leave_the_book', () => {
    // Selling cm1 (salary 8) and rw1 (salary 5) brings 143 down to 130,
    // under the 133 cap, while the 11-player squad floor still holds.
    const state = [
      { type: 'BUY', playerId: 'buy-st' } as const,
      { type: 'SELL', playerId: 'cm1' } as const,
      { type: 'SELL', playerId: 'rw1' } as const,
    ].reduce(applyAction, tightGame());
    expect(validateState(state)).toEqual([]);
  });
});

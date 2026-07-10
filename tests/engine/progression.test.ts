/**
 * Tests for window advancement and between-window progression: budget
 * rollover, market evolution, value drift, ageing, and contract expiry.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  countRegistration,
  createGame,
  replay,
  type Action,
  type GameState,
} from '../../src/engine';
import {
  makeSquadPlayer,
  makeThreeWindowConfig,
  threeTestWindows,
} from './fixtures';

/** Applies actions to a fresh three-window game. */
function play(...actions: Action[]): GameState {
  return actions.reduce(applyAction, createGame(makeThreeWindowConfig()));
}

const advance: Action = { type: 'ADVANCE_WINDOW' };

describe('ADVANCE_WINDOW guards', () => {
  it('rejects_advancing_past_the_final_window', () => {
    expect(() => play(advance, advance, advance)).toThrowError(
      /final window/,
    );
  });

  it('rejects_advancing_with_outstanding_violations', () => {
    // Overspend: 100 - 60 - 35 - 25 = -20.
    expect(() =>
      play(
        { type: 'BUY', playerId: 'buy-st' },
        { type: 'BUY', playerId: 'buy-cb' },
        { type: 'BUY', playerId: 'buy-hg' },
        advance,
      ),
    ).toThrowError(/BUDGET_EXCEEDED/);
  });
});

describe('Summer 2026 -> January 2027 (same season)', () => {
  it('rolls_funds_forward_and_adds_the_new_budget', () => {
    // 100 - 60 (buy-st) = 40, + 30 January budget = 70.
    const state = play({ type: 'BUY', playerId: 'buy-st' }, advance);
    expect(state.windowIndex).toBe(1);
    expect(state.funds).toBe(70);
  });

  it('does_not_age_players_or_expire_contracts_mid_season', () => {
    const state = play(advance);
    const cb2 = state.squad.find((p) => p.id === 'cb2');
    // cb2 expires 2027 but the season has not turned yet.
    expect(cb2).toBeDefined();
    expect(cb2?.age).toBe(26);
  });

  it('drifts_values_at_half_the_annual_rate', () => {
    const state = play(advance);
    const byId = new Map(state.squad.map((p) => [p.id, p]));

    // cb1: age 26, quality 90 -> +8%/yr -> +4%: 70 -> 72.8.
    expect(byId.get('cb1')?.baseValue).toBe(72.8);
    // gk2: age 31 -> -12%/yr -> -6%: 3 -> 2.8.
    expect(byId.get('gk2')?.baseValue).toBe(2.8);
    // am1: age 19, quality 78 -> +12%/yr -> +6%: 30 -> 31.8.
    expect(byId.get('am1')?.baseValue).toBe(31.8);
    // cm1: quality 80 -> +8%/yr -> +4%: 35 -> 36.4. In January his 2027
    // contract has only 6 months left: discount 0.25 -> 9.1. Sell now and
    // get pennies, renew, or lose him free in the summer.
    expect(byId.get('cm1')?.baseValue).toBe(36.4);
    expect(byId.get('cm1')?.saleValue).toBe(9.1);
  });

  it('opens_the_new_market_minus_players_already_at_the_club', () => {
    // buy-st is bought in Summer 2026 and also authored into the January
    // pool: the engine must not list him twice.
    const withStriker = play({ type: 'BUY', playerId: 'buy-st' }, advance);
    expect(withStriker.market.map((p) => p.id)).toEqual(['jan-cm']);

    // Left unbought, he appears in January at his drifted authored price.
    const without = play(advance);
    expect(without.market.map((p) => p.id)).toEqual(['buy-st', 'jan-cm']);
  });
});

describe('January 2027 -> Summer 2027 (season boundary)', () => {
  it('ages_every_player_by_one_year', () => {
    const state = play(advance, advance);
    const byId = new Map(state.squad.map((p) => [p.id, p]));
    expect(byId.get('gk2')?.age).toBe(32);
    expect(byId.get('am1')?.age).toBe(20);
    expect(byId.get('lw1')?.age).toBe(21);
  });

  it('releases_unrenewed_expiring_contracts_for_free', () => {
    const state = play(advance, advance);
    const squadIds = state.squad.map((p) => p.id);

    expect(squadIds).not.toContain('cb2');
    expect(squadIds).not.toContain('cm1');

    const expired = state.departed.filter((d) => d.reason === 'expired');
    expect(expired.map((d) => d.player.id).sort()).toEqual(['cb2', 'cm1']);
    // Free exits: no fee is banked. Funds are budgets only: 100 + 30 + 80.
    expect(state.funds).toBe(210);
  });

  it('keeps_a_renewed_player_through_the_boundary', () => {
    const state = play(
      { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
      advance,
      advance,
    );
    const cm1 = state.squad.find((p) => p.id === 'cm1');
    expect(cm1).toBeDefined();
    expect(cm1?.contract).toEqual({ expiryYear: 2030, salary: 11.7 });
  });

  it('pulls_an_aged_u21_into_the_registration_count', () => {
    // A 21-year-old non-home-grown player is exempt in the first two
    // windows but turns 22 at the boundary and starts counting.
    const config = makeThreeWindowConfig();
    const squad = [
      ...config.initialSquad,
      makeSquadPlayer({ id: 'edge-u21', age: 21, homegrown: false }),
    ];
    let state = createGame({ ...config, initialSquad: squad });
    expect(countRegistration(state.squad).over21).toBe(10);

    state = [advance, advance].reduce(applyAction, state);
    // cb2 and cm1 expire (-2 over-21s); edge-u21 now counts (+1).
    expect(countRegistration(state.squad).over21).toBe(9);
    expect(
      state.squad.find((p) => p.id === 'edge-u21')?.age,
    ).toBe(22);
  });

  it('compounds_value_drift_with_the_new_age_after_the_boundary', () => {
    const state = play(advance, advance);
    const byId = new Map(state.squad.map((p) => [p.id, p]));

    // cb1: 70 -> 72.8 (age 26), then age 27 still +8%/yr: 72.8 -> 75.7.
    // Contract 2029 now has 2 years left: saleValue 75.7 x 0.9 = 68.1.
    expect(byId.get('cb1')?.baseValue).toBe(75.7);
    expect(byId.get('cb1')?.saleValue).toBe(68.1);

    // gk2: 3 -> 2.8 (age 31), then age 32 -6%: 2.8 -> 2.6.
    expect(byId.get('gk2')?.baseValue).toBe(2.6);
  });
});

describe('multi-window determinism', () => {
  /** A full playthrough exercising all three windows. */
  const playthrough: readonly Action[] = [
    { type: 'SELL', playerId: 'rw1' },
    { type: 'BUY', playerId: 'buy-st' },
    { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
    advance,
    { type: 'BUY', playerId: 'jan-cm' },
    advance,
    { type: 'BUY', playerId: 's27-lw' },
    { type: 'RENEW', playerId: 'cb1', newExpiryYear: 2031 },
  ];

  it('replaying_a_three_window_log_reproduces_the_state', () => {
    const live = playthrough.reduce(
      applyAction,
      createGame(makeThreeWindowConfig()),
    );
    const replayed = replay(makeThreeWindowConfig(), live.actionLog);
    expect(replayed).toEqual(live);
    expect(live.windowIndex).toBe(threeTestWindows.length - 1);
  });

  it('blocks_renewing_a_player_already_renewed_in_an_earlier_window', () => {
    expect(() =>
      play(
        { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2029 },
        advance,
        { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2031 },
      ),
    ).toThrowError(/already been renewed this game/);
  });

  it('blocks_undoing_actions_from_an_earlier_window', () => {
    expect(() =>
      play({ type: 'SELL', playerId: 'rw1' }, advance, {
        type: 'UNDO_SELL',
        playerId: 'rw1',
      }),
    ).toThrowError(/not sold in the current window/);
  });
});

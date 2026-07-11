/**
 * Behavioural tests for the buy / sell / renew reducers and their undos.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  EngineError,
  type GameState,
} from '../../src/engine';
import { makeTestConfig } from './fixtures';

/** Fresh game state from the standard fixture config. */
function freshGame(): GameState {
  return createGame(makeTestConfig());
}

/** Convenience: apply a sequence of actions to a fresh game. */
function play(...actions: Parameters<typeof applyAction>[1][]): GameState {
  return actions.reduce(applyAction, freshGame());
}

describe('createGame', () => {
  it('opens_the_first_window_with_full_budget_and_empty_log', () => {
    const state = freshGame();
    expect(state.windowIndex).toBe(0);
    expect(state.funds).toBe(100);
    expect(state.squad).toHaveLength(12);
    expect(state.market).toHaveLength(4);
    expect(state.actionLog).toHaveLength(0);
  });

  it('rejects_a_config_with_mismatched_market_pools', () => {
    const config = makeTestConfig();
    expect(() =>
      createGame({ ...config, marketByWindow: [] }),
    ).toThrowError(/one market pool per window/);
  });
});

describe('BUY', () => {
  it('signs_the_player_and_deducts_the_fee', () => {
    const state = play({ type: 'BUY', playerId: 'buy-st' });

    expect(state.funds).toBe(40); // 100 - 60
    expect(state.market.map((p) => p.id)).not.toContain('buy-st');

    const signed = state.squad.find((p) => p.id === 'buy-st');
    expect(signed).toBeDefined();
    expect(signed?.contract).toEqual({ expiryYear: 2031, salary: 9 });
    expect(signed?.acquisition).toEqual({
      fee: 60,
      windowIndex: 0,
      contractYears: 5,
    });
  });

  it('allows_funds_to_go_negative_while_planning', () => {
    const state = play(
      { type: 'BUY', playerId: 'buy-st' },
      { type: 'BUY', playerId: 'buy-cb' },
      { type: 'BUY', playerId: 'buy-hg' },
    );
    expect(state.funds).toBe(-20); // 100 - 60 - 35 - 25
  });

  it('rejects_buying_a_player_not_in_the_market', () => {
    expect(() => play({ type: 'BUY', playerId: 'nobody' })).toThrowError(
      EngineError,
    );
  });

  it('rejects_buying_the_same_player_twice', () => {
    expect(() =>
      play(
        { type: 'BUY', playerId: 'buy-st' },
        { type: 'BUY', playerId: 'buy-st' },
      ),
    ).toThrowError(/not in the current market/);
  });
});

describe('UNDO_BUY', () => {
  it('refunds_the_fee_and_restores_the_market_listing_in_order', () => {
    const state = play(
      { type: 'BUY', playerId: 'buy-st' },
      { type: 'UNDO_BUY', playerId: 'buy-st' },
    );

    expect(state.funds).toBe(100);
    expect(state.squad.map((p) => p.id)).not.toContain('buy-st');
    // Original market order is restored exactly.
    expect(state.market.map((p) => p.id)).toEqual([
      'buy-st',
      'buy-cb',
      'buy-hg',
      'buy-u21',
    ]);
  });

  it('discards_a_renewal_made_after_the_purchase', () => {
    // Buy, renew the new signing, then undo the buy: the renewal goes with
    // it and the restored listing carries the original wage demand.
    const state = play(
      { type: 'BUY', playerId: 'buy-u21' },
      { type: 'RENEW', playerId: 'buy-u21', newExpiryYear: 2031 },
      { type: 'UNDO_BUY', playerId: 'buy-u21' },
    );

    expect(state.funds).toBe(100);
    const listing = state.market.find((p) => p.id === 'buy-u21');
    expect(listing?.wageDemand).toBe(2.5);
  });

  it('rejects_undoing_a_purchase_never_made', () => {
    expect(() =>
      play({ type: 'UNDO_BUY', playerId: 'cm1' }),
    ).toThrowError(/not bought in the current window/);
  });
});

describe('SELL', () => {
  it('banks_the_fee_and_records_the_departure', () => {
    const state = play({ type: 'SELL', playerId: 'rw1' });

    expect(state.funds).toBe(155); // 100 + 55
    expect(state.squad.map((p) => p.id)).not.toContain('rw1');
    expect(state.departed).toHaveLength(1);
    expect(state.departed[0]?.reason).toBe('sold');
  });

  it('rejects_selling_a_locked_player', () => {
    expect(() => play({ type: 'SELL', playerId: 'cb1' })).toThrowError(
      /board will not sanction/,
    );
  });

  it('rejects_selling_a_player_not_in_the_squad', () => {
    expect(() => play({ type: 'SELL', playerId: 'buy-st' })).toThrowError(
      EngineError,
    );
  });

  it('allows_selling_a_player_bought_this_window', () => {
    const state = play(
      { type: 'BUY', playerId: 'buy-st' },
      { type: 'SELL', playerId: 'buy-st' },
    );
    // Bought for 60, sold for 60: back to the full budget.
    expect(state.funds).toBe(100);
  });
});

describe('UNDO_SELL', () => {
  it('returns_the_player_and_hands_back_the_fee', () => {
    const state = play(
      { type: 'SELL', playerId: 'rw1' },
      { type: 'UNDO_SELL', playerId: 'rw1' },
    );

    expect(state.funds).toBe(100);
    expect(state.squad.map((p) => p.id)).toContain('rw1');
    expect(state.departed).toHaveLength(0);
  });

  it('rejects_undoing_a_sale_never_made', () => {
    expect(() =>
      play({ type: 'UNDO_SELL', playerId: 'rw1' }),
    ).toThrowError(/not sold in the current window/);
  });
});

describe('RENEW', () => {
  it('extends_an_expiring_contract_at_a_priced_salary_increase', () => {
    // cm1: quality 80, salary 8, expires 2027 (final year in Summer 2026).
    // Renewing to 2030 adds 3 years:
    //   uplift = (0.35 + 0.02 * 3) * (0.8 + 80/250) = 0.41 * 1.12 = 0.4592
    //   salary = 8 * 1.4592 = 11.6736 -> 11.7
    const state = play({
      type: 'RENEW',
      playerId: 'cm1',
      newExpiryYear: 2030,
    });

    const renewed = state.squad.find((p) => p.id === 'cm1');
    expect(renewed?.contract).toEqual({ expiryYear: 2030, salary: 11.7 });
    expect(renewed?.renewal?.previousContract).toEqual({
      expiryYear: 2027,
      salary: 8,
    });
  });

  it('prices_a_distant_renewal_more_cheaply', () => {
    // cm2: quality 70, salary 5, expires 2029 (3 years out).
    //   uplift = (0.10 + 0.02 * 2) * (0.8 + 70/250) = 0.14 * 1.08 = 0.1512
    //   salary = 5 * 1.1512 = 5.756 -> 5.8
    const state = play({
      type: 'RENEW',
      playerId: 'cm2',
      newExpiryYear: 2031,
    });

    const renewed = state.squad.find((p) => p.id === 'cm2');
    expect(renewed?.contract).toEqual({ expiryYear: 2031, salary: 5.8 });
  });

  it('rejects_a_renewal_that_does_not_extend_the_deal', () => {
    expect(() =>
      play({ type: 'RENEW', playerId: 'cm2', newExpiryYear: 2029 }),
    ).toThrowError(/must extend the contract/);
  });

  it('rejects_a_renewal_beyond_the_five_year_cap', () => {
    expect(() =>
      play({ type: 'RENEW', playerId: 'cm1', newExpiryYear: 2032 }),
    ).toThrowError(/5-year cap/);
  });

  it('rejects_a_second_renewal_of_the_same_player', () => {
    expect(() =>
      play(
        { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2029 },
        { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
      ),
    ).toThrowError(/already been renewed this game/);
  });
});

describe('UNDO_RENEW', () => {
  it('restores_the_previous_contract', () => {
    const state = play(
      { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
      { type: 'UNDO_RENEW', playerId: 'cm1' },
    );

    const player = state.squad.find((p) => p.id === 'cm1');
    expect(player?.contract).toEqual({ expiryYear: 2027, salary: 8 });
    expect(player?.renewal).toBeUndefined();
  });

  it('allows_renewing_again_after_an_undo', () => {
    const state = play(
      { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2029 },
      { type: 'UNDO_RENEW', playerId: 'cm1' },
      { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2031 },
    );

    const player = state.squad.find((p) => p.id === 'cm1');
    expect(player?.contract.expiryYear).toBe(2031);
  });

  it('rejects_undoing_a_renewal_never_made', () => {
    expect(() =>
      play({ type: 'UNDO_RENEW', playerId: 'cm1' }),
    ).toThrowError(/no renewal to undo/);
  });
});

describe('immutability', () => {
  it('never_mutates_the_input_state', () => {
    const before = freshGame();
    const snapshot = structuredClone(before);

    applyAction(before, { type: 'BUY', playerId: 'buy-st' });
    applyAction(before, { type: 'SELL', playerId: 'rw1' });
    applyAction(before, { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 });

    expect(before).toEqual(snapshot);
  });
});

describe('locked market players', () => {
  it('rejects_buying_a_player_whose_club_will_not_sell', () => {
    const config = makeTestConfig();
    const pools = config.marketByWindow.map((pool) =>
      pool.map((p) => (p.id === 'buy-st' ? { ...p, locked: true } : p)),
    );
    const state = createGame({ ...config, marketByWindow: pools });
    expect(() =>
      applyAction(state, { type: 'BUY', playerId: 'buy-st' }),
    ).toThrowError(/refuses to sell/);
  });
});

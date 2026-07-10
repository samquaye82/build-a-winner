/**
 * Determinism contract tests.
 *
 * These are the engine's most important guarantees: identical action
 * sequences must produce identical states, and replaying an action log must
 * reproduce the state it was recorded from. A future verified leaderboard
 * depends on both holding forever.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  replay,
  type Action,
} from '../../src/engine';
import { makeTestConfig } from './fixtures';

/** A representative playthrough touching every action type. */
const playthrough: readonly Action[] = [
  { type: 'SELL', playerId: 'rw1' },
  { type: 'BUY', playerId: 'buy-st' },
  { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
  { type: 'BUY', playerId: 'buy-u21' },
  { type: 'UNDO_BUY', playerId: 'buy-u21' },
  { type: 'SELL', playerId: 'gk2' },
  { type: 'UNDO_SELL', playerId: 'gk2' },
  { type: 'RENEW', playerId: 'cb2', newExpiryYear: 2029 },
  { type: 'UNDO_RENEW', playerId: 'cb2' },
  { type: 'BUY', playerId: 'buy-hg' },
];

describe('determinism', () => {
  it('identical_action_sequences_produce_identical_states', () => {
    const first = playthrough.reduce(applyAction, createGame(makeTestConfig()));
    const second = playthrough.reduce(applyAction, createGame(makeTestConfig()));
    expect(first).toEqual(second);
  });

  it('replaying_the_action_log_reproduces_the_state', () => {
    const live = playthrough.reduce(applyAction, createGame(makeTestConfig()));
    const replayed = replay(makeTestConfig(), live.actionLog);
    expect(replayed).toEqual(live);
  });

  it('records_every_action_in_order', () => {
    const state = playthrough.reduce(applyAction, createGame(makeTestConfig()));
    expect(state.actionLog).toEqual(playthrough);
  });

  it('keeps_monetary_values_at_one_decimal_place', () => {
    // Guards against floating-point drift: every funds value along the
    // playthrough must already be rounded.
    let state = createGame(makeTestConfig());
    for (const action of playthrough) {
      state = applyAction(state, action);
      expect(state.funds).toBe(Math.round(state.funds * 10) / 10);
    }
  });
});

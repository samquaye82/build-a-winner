/**
 * Tests for the pick-your-XI phase and the final rating.
 *
 * Fixture arithmetic (single-window config, no actions, the natural
 * 4-2-3-1 XI leaving only gk2 outside):
 *
 * - Squad Quality: XI avg 840/11 = 76.36; depth = best 10 of {gk2} padded
 *   with zeros = 70/10 = 7. Score 0.7 x 76.36 + 0.3 x 7 = 55.6.
 * - Balance: GK 2/3, everything else at 1 of 2+ or 2 of 4:
 *   (0.6667 + 0.5 x 8) / 9 = 51.9.
 * - Age: nine peak (1.0), gk2 31 (0.4), am1 19 (0.9), lw1 20 (0.9):
 *   11.2/12 = 93.3.
 * - Contracts: all 36 months (1.0) except cb2 (q70) and cm1 (q80) at 12
 *   months (0.3): (760 + 21 + 24) / 910 = 88.5.
 * - Value created: nothing done, ratio 1.0, score 50.
 * - Total: 0.35x55.6 + 0.25x51.9 + 0.2x93.3 + 0.15x88.5 + 0.05x50
 *   = 66.87 -> 67.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  replay,
  scoreGame,
  type Action,
  type GameState,
  type XISelection,
} from '../../src/engine';
import { makeTestConfig, makeThreeWindowConfig } from './fixtures';

/** The natural fixture XI: a 4-2-3-1 using eleven of the twelve players. */
const fixtureXI: XISelection = {
  formationId: '4-2-3-1',
  // Slots: GK RB CB CB LB CM CM W AM W ST.
  playerIds: [
    'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
    'cm1', 'cm2', 'rw1', 'am1', 'lw1', 'st1',
  ],
};

/** Applies actions to a fresh single-window game. */
function play(...actions: Action[]): GameState {
  return actions.reduce(applyAction, createGame(makeTestConfig()));
}

describe('PICK_XI', () => {
  it('stores_a_valid_selection', () => {
    const state = play({ type: 'PICK_XI', selection: fixtureXI });
    expect(state.xi).toEqual(fixtureXI);
  });

  it('allows_repicking', () => {
    const secondChoice: XISelection = {
      ...fixtureXI,
      playerIds: fixtureXI.playerIds.map((id) => (id === 'gk1' ? 'gk2' : id)),
    };
    const state = play(
      { type: 'PICK_XI', selection: fixtureXI },
      { type: 'PICK_XI', selection: secondChoice },
    );
    expect(state.xi).toEqual(secondChoice);
  });

  it('rejects_picking_before_the_final_window', () => {
    const state = createGame(makeThreeWindowConfig());
    expect(() =>
      applyAction(state, { type: 'PICK_XI', selection: fixtureXI }),
    ).toThrowError(/after the final window/);
  });

  it('rejects_a_player_in_an_ineligible_slot', () => {
    // am1 is an AM; the 4-3-3 has no AM slot, so he lands in a CM slot.
    const invalid: XISelection = {
      formationId: '4-3-3',
      playerIds: [
        'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
        'cm1', 'cm2', 'am1', 'rw1', 'st1', 'lw1',
      ],
    };
    expect(() =>
      play({ type: 'PICK_XI', selection: invalid }),
    ).toThrowError(/cannot fill the CM slot/);
  });

  it('rejects_duplicates_and_wrong_sizes', () => {
    expect(() =>
      play({
        type: 'PICK_XI',
        selection: {
          ...fixtureXI,
          playerIds: fixtureXI.playerIds.map(() => 'gk1'),
        },
      }),
    ).toThrowError(/duplicate/);

    expect(() =>
      play({
        type: 'PICK_XI',
        selection: { ...fixtureXI, playerIds: fixtureXI.playerIds.slice(1) },
      }),
    ).toThrowError(/needs 11 players/);
  });

  it('rejects_players_not_in_the_squad', () => {
    expect(() =>
      play(
        { type: 'SELL', playerId: 'rw1' },
        { type: 'PICK_XI', selection: fixtureXI },
      ),
    ).toThrowError(/not in the squad/);
  });
});

describe('scoreGame', () => {
  it('requires_an_xi', () => {
    expect(() => scoreGame(play())).toThrowError(/Pick a starting eleven/);
  });

  it('scores_the_untouched_fixture_game', () => {
    const breakdown = scoreGame(play({ type: 'PICK_XI', selection: fixtureXI }));

    expect(breakdown.squadQuality).toEqual({
      xiAverage: 76.4,
      depthAverage: 7,
      score: 55.6,
    });
    expect(breakdown.balance.score).toBe(51.9);
    expect(breakdown.ageProfile.score).toBe(93.3);
    expect(breakdown.contractHealth.score).toBe(88.5);
    expect(breakdown.valueCreated).toEqual({ ratio: 1, score: 50 });
    expect(breakdown.total).toBe(67);
  });

  it('treats_selling_a_full_value_player_as_value_neutral', () => {
    // gk2 has 36 months left: sale value equals base value, so cash out,
    // value in, ratio unchanged. gk2 is outside the XI so it stays legal.
    const state = play(
      { type: 'SELL', playerId: 'gk2' },
      { type: 'PICK_XI', selection: fixtureXI },
    );
    expect(scoreGame(state).valueCreated.ratio).toBe(1);
  });

  it('scores_value_destruction_down_the_agreed_slope', () => {
    // Worth 488 against 498 handed over: ratio 0.98, score 50 - 2 x 2.5.
    const state = play({ type: 'PICK_XI', selection: fixtureXI });
    const breakdown = scoreGame({ ...state, funds: 90 });
    expect(breakdown.valueCreated).toEqual({ ratio: 0.98, score: 45 });
  });
});

describe('full playthrough scoring', () => {
  /** Three windows: renew the star, reinforce, ride out the expiries. */
  const playthrough: readonly Action[] = [
    { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
    { type: 'BUY', playerId: 'buy-cb' },
    { type: 'BUY', playerId: 'buy-st' },
    { type: 'ADVANCE_WINDOW' },
    { type: 'ADVANCE_WINDOW' },
    {
      type: 'PICK_XI',
      selection: {
        formationId: '4-2-3-1',
        // cb2 expired at the season boundary; buy-cb partners cb1.
        playerIds: [
          'gk1', 'rb1', 'cb1', 'buy-cb', 'lb1',
          'cm1', 'cm2', 'rw1', 'am1', 'lw1', 'st1',
        ],
      },
    },
  ];

  it('scores_a_finished_three_window_game', () => {
    const state = playthrough.reduce(
      applyAction,
      createGame(makeThreeWindowConfig()),
    );
    const breakdown = scoreGame(state);

    expect(breakdown.total).toBeGreaterThan(0);
    expect(breakdown.total).toBeLessThanOrEqual(100);
    // cb2 walked for free (-12 base value), but a largely peak-age squad
    // appreciating along the value curve more than covers it: the club
    // ends 4% up on everything the board handed over.
    expect(breakdown.valueCreated.ratio).toBe(1.04);
  });

  it('replay_reproduces_the_identical_score', () => {
    const live = playthrough.reduce(
      applyAction,
      createGame(makeThreeWindowConfig()),
    );
    const replayed = replay(makeThreeWindowConfig(), live.actionLog);
    expect(scoreGame(replayed)).toEqual(scoreGame(live));
  });
});

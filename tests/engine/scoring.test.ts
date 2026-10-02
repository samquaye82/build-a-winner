/**
 * Tests for the pick-your-XI phase and the final rating.
 *
 * Fixture arithmetic (single-window config, no actions, the natural
 * 4-2-3-1 XI leaving only gk2 outside):
 *
 * - Squad Quality: XI avg 840/11 = 76.36; depth = the whole squad outside
 *   the XI = {gk2} = 70. Score 0.65 x 76.36 + 0.35 x 70 = 74.1.
 * - Balance: quality-weighted coverage against reference 90. Contributions
 *   (min quality/90, 1): GK 0.778 x2, RB/LB/LW 0.778, CB 1.0+0.778,
 *   CM 0.889+0.778, AM 0.867, RW 0.933, ST 0.978; coverage/9 x 100 = 43.7.
 * - Age: quality-weighted age-band scores across the squad = 93.8.
 * - Contract: quality-aware asset/liability model (secured good players are
 *   assets, below-par or expiring ones liabilities), squad average mapped to
 *   0-100 = 58.3.
 * - Value created: nothing done, ratio 1.0, score 50.
 * - Total: 0.35x74.1 + 0.25x43.7 + 0.15x93.8 + 0.2x58.3 + 0.05x50
 *   = 65.09 -> 65.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  autoPickBestXI,
  createGame,
  replay,
  scoreGame,
  scoreProvisional,
  validateXI,
  type Action,
  type GameState,
  type XISelection,
} from '../../src/engine';
import {
  makeSquadPlayer,
  makeTestConfig,
  makeThreeWindowConfig,
} from './fixtures';

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

  it('accepts_positional_group_flexibility', () => {
    // am1 (an AM) in a CM slot is fine: midfielders cover all midfield
    // slots (Sam's positional groups).
    const flexible: XISelection = {
      formationId: '4-3-3',
      playerIds: [
        'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
        'cm1', 'cm2', 'am1', 'rw1', 'st1', 'lw1',
      ],
    };
    const state = play({ type: 'PICK_XI', selection: flexible });
    expect(state.xi).toEqual(flexible);
  });

  it('rejects_a_player_outside_the_slot_positional_group', () => {
    // A striker in a CM slot crosses groups and stays illegal.
    const invalid: XISelection = {
      formationId: '4-3-3',
      playerIds: [
        'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
        'cm1', 'cm2', 'st1', 'rw1', 'am1', 'lw1',
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

    // Depth is the two spare keepers, gk2 (70) and gk3 (60).
    expect(breakdown.squadQuality).toEqual({
      xiAverage: 76.4,
      depthAverage: 65,
      score: 72.4,
    });
    expect(breakdown.balance.score).toBe(46.2);
    expect(breakdown.ageProfile.score).toBe(94.1);
    expect(breakdown.contractHealth.score).toBe(55);
    expect(breakdown.valueCreated).toEqual({ ratio: 1, score: 50 });
    expect(breakdown.total).toBe(65);
  });

  it('caps an elite but too-small squad at 70', () => {
    // 22 elite players: one short of the viability threshold, but with
    // full depth so the raw weighted total sails past 70 before the cap.
    const config = makeTestConfig();
    const elite = config.initialSquad.map((p) => ({ ...p, quality: 95 }));
    // Thirteen fixture players plus nine fillers.
    const filler = Array.from({ length: 9 }, (_unused, i) =>
      makeSquadPlayer({ id: `star-${String(i)}`, position: 'CM', quality: 95 }),
    );
    const state = applyAction(
      createGame({ ...config, initialSquad: [...elite, ...filler] }),
      { type: 'PICK_XI', selection: fixtureXI },
    );
    const breakdown = scoreGame(state);

    expect(state.squad.length).toBe(22);
    expect(breakdown.squadSizeCapped).toBe(true);
    expect(breakdown.rawTotal).toBeGreaterThan(70);
    expect(breakdown.total).toBe(70);
  });

  it('does not cap a squad at or above the viability threshold', () => {
    // Pad the thirteen-man fixture squad to 23 with filler midfielders.
    const config = makeTestConfig();
    const filler = Array.from({ length: 10 }, (_unused, i) =>
      makeSquadPlayer({ id: `fill-${String(i)}`, position: 'CM' }),
    );
    const state = applyAction(
      createGame({
        ...config,
        initialSquad: [...config.initialSquad, ...filler],
      }),
      { type: 'PICK_XI', selection: fixtureXI },
    );
    const breakdown = scoreGame(state);

    expect(state.squad.length).toBe(23);
    expect(breakdown.squadSizeCapped).toBe(false);
    expect(breakdown.total).toBe(breakdown.rawTotal);
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

describe('autoPickBestXI', () => {
  it('picks_the_highest_quality_legal_eleven', () => {
    const state = createGame(makeTestConfig());
    const xi = autoPickBestXI(state);

    // Thirteen fixture players; the best eleven drops only the spare keepers.
    const chosen = new Set(xi.playerIds);
    const dropped = state.squad
      .map((p) => p.id)
      .filter((id) => !chosen.has(id));
    expect(dropped).toEqual(['gk2', 'gk3']);
    // Every shape that fields this XI ties on quality, so the smallest
    // formation id wins the tie-break. With CM eligible in defensive slots
    // and AM in wide slots, 3-4-3 can now field the same eleven and takes it.
    expect(xi.formationId).toBe('3-4-3');
    expect(() => validateXI(state, xi)).not.toThrow();
  });

  it('is_deterministic', () => {
    const state = createGame(makeTestConfig());
    expect(autoPickBestXI(state)).toEqual(autoPickBestXI(state));
  });

  it('never_beats_a_hand_picked_eleven_on_quality', () => {
    const state = createGame(makeTestConfig());
    const byId = new Map(state.squad.map((p) => [p.id, p]));
    const quality = (xi: XISelection): number =>
      xi.playerIds.reduce((sum, id) => sum + (byId.get(id)?.quality ?? 0), 0);

    // The auto-pick is at least as good as the known-good natural XI.
    expect(quality(autoPickBestXI(state))).toBeGreaterThanOrEqual(
      quality(fixtureXI),
    );
  });

  it('throws_when_no_formation_can_be_filled', () => {
    // A squad with no striker cannot fill any formation (all six carry an
    // ST slot); the provisional scorer must surface that, not guess.
    const noStriker = createGame({
      ...makeTestConfig(),
      initialSquad: [
        makeSquadPlayer({ id: 'gk1', position: 'GK' }),
        makeSquadPlayer({ id: 'cb1', position: 'CB' }),
      ],
    });
    expect(() => autoPickBestXI(noStriker)).toThrow();
  });
});

describe('scoreProvisional', () => {
  it('scores_against_the_auto_picked_eleven', () => {
    const state = createGame(makeTestConfig());
    const expected = scoreGame({ ...state, xi: autoPickBestXI(state) });
    expect(scoreProvisional(state)).toEqual(expected);
  });

  it('needs_no_committed_xi', () => {
    const state = createGame(makeTestConfig());
    expect(state.xi).toBeUndefined();
    expect(scoreProvisional(state).total).toBeGreaterThan(0);
  });
});

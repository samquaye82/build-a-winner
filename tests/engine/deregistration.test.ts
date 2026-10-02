/**
 * Tests for deregistration: leaving a squad player off the Premier League
 * or Champions League list without selling him. Covers the actions, how
 * each competition's rules ignore him, the penalty when a window closes
 * with him still off, and his absence from the pitch and the score.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  autoPickBestXI,
  computeSquadCost,
  createGame,
  replay,
  scoreGame,
  simulateSeason,
  validateState,
  type Action,
  type GameConfig,
  type GameState,
  type XISelection,
} from '../../src/engine';
import { makeTestConfig, makeThreeWindowConfig } from './fixtures';

const advance: Action = { type: 'ADVANCE_WINDOW' };

/**
 * Applies actions to a fresh game.
 *
 * @param config - The config to start from.
 * @param actions - The actions, in order.
 * @returns The resulting state.
 */
function play(config: GameConfig, ...actions: Action[]): GameState {
  return actions.reduce(applyAction, createGame(config));
}

/** Leaves a player off a list. */
function off(playerId: string, competition: 'PL' | 'UCL'): Action {
  return { type: 'DEREGISTER', playerId, competition };
}

/** Puts a player back on a list. */
function on(playerId: string, competition: 'PL' | 'UCL'): Action {
  return { type: 'REREGISTER', playerId, competition };
}

/** Violation codes in a state. */
function codes(state: GameState): string[] {
  return validateState(state).map((v) => v.code);
}

/** The single-window fixture XI (see scoring.test.ts). */
const fixtureXI: XISelection = {
  formationId: '4-2-3-1',
  playerIds: [
    'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
    'cm1', 'cm2', 'rw1', 'am1', 'lw1', 'st1',
  ],
};

describe('DEREGISTER and REREGISTER', () => {
  it('leaves_a_player_off_a_list', () => {
    const state = play(makeTestConfig(), off('rw1', 'UCL'));
    expect(state.squad.find((p) => p.id === 'rw1')?.deregisteredFrom).toEqual([
      'UCL',
    ]);
  });

  it('can_leave_him_off_both', () => {
    const state = play(makeTestConfig(), off('rw1', 'UCL'), off('rw1', 'PL'));
    expect(state.squad.find((p) => p.id === 'rw1')?.deregisteredFrom).toEqual([
      'UCL',
      'PL',
    ]);
  });

  it('puts_him_back_exactly_as_he_was', () => {
    const fresh = createGame(makeTestConfig());
    const state = play(makeTestConfig(), off('rw1', 'UCL'), on('rw1', 'UCL'));
    expect(state.squad).toEqual(fresh.squad);
  });

  it('rejects_leaving_him_off_a_list_twice', () => {
    expect(() =>
      play(makeTestConfig(), off('rw1', 'PL'), off('rw1', 'PL')),
    ).toThrowError(/already off the Premier League list/);
  });

  it('rejects_putting_back_a_registered_player', () => {
    expect(() => play(makeTestConfig(), on('rw1', 'UCL'))).toThrowError(
      /already on the Champions League list/,
    );
  });

  it('rejects_a_player_not_in_the_squad', () => {
    expect(() => play(makeTestConfig(), off('nobody', 'PL'))).toThrowError();
  });

  it('leaves_the_squad_cost_untouched', () => {
    // He is still under contract: wage and amortisation stay on the book.
    const before = computeSquadCost(createGame(makeTestConfig()));
    const after = computeSquadCost(play(makeTestConfig(), off('rw1', 'PL')));
    expect(after).toEqual(before);
  });
});

describe('registration rules', () => {
  it('judges_the_premier_league_list_on_registered_players_only', () => {
    // Thirteen players; three off the PL list leave ten who can play.
    const state = play(
      makeTestConfig(),
      off('rw1', 'PL'),
      off('lw1', 'PL'),
      off('st1', 'PL'),
    );
    expect(codes(state)).toContain('SQUAD_TOO_SMALL');
  });

  it('judges_the_uefa_lists_on_registered_players_only', () => {
    // Three keepers; one off the UCL list leaves two for UEFA's three.
    const state = play(makeTestConfig(), off('gk3', 'UCL'));
    expect(codes(state)).toEqual(['UCL_NOT_ENOUGH_GOALKEEPERS']);
  });

  it('keeps_each_competition_separate', () => {
    // Off the UCL list only: the Premier League still counts him.
    const state = play(makeTestConfig(), off('gk3', 'UCL'));
    expect(codes(state)).not.toContain('NOT_ENOUGH_GOALKEEPERS');
  });
});

describe('the penalty at a window close', () => {
  const three = makeThreeWindowConfig();
  /** cb1's base value once a normal season boundary has passed (70 x 1.04). */
  const driftedNormally = 72.8;

  it('drops_his_value_by_a_fifth_before_drift', () => {
    // 70 -> 56 at the close, then +4% drift -> 58.2.
    const state = play(three, off('cb1', 'UCL'), advance);
    expect(state.squad.find((p) => p.id === 'cb1')?.baseValue).toBe(58.2);
    expect(state.deregistrationPenalties).toEqual(['cb1']);
  });

  it('spares_a_player_put_back_before_the_close', () => {
    const state = play(three, off('cb1', 'UCL'), on('cb1', 'UCL'), advance);
    expect(state.squad.find((p) => p.id === 'cb1')?.baseValue).toBe(
      driftedNormally,
    );
    expect(state.deregistrationPenalties).toEqual([]);
  });

  it('spares_a_player_sold_before_the_close', () => {
    const state = play(
      three,
      off('rw1', 'UCL'),
      { type: 'SELL', playerId: 'rw1' },
      advance,
    );
    expect(state.deregistrationPenalties).toEqual([]);
  });

  it('penalises_a_player_once_per_game', () => {
    // Still off at the second close: drift only, no second drop.
    // 58.2 x 1.04 = 60.5.
    const state = play(three, off('cb1', 'UCL'), advance, advance);
    expect(state.squad.find((p) => p.id === 'cb1')?.baseValue).toBe(60.5);
    expect(state.deregistrationPenalties).toEqual(['cb1']);
  });

  it('refunds_nothing_when_he_is_put_back_later', () => {
    const state = play(three, off('cb1', 'UCL'), advance, on('cb1', 'UCL'));
    expect(state.squad.find((p) => p.id === 'cb1')?.baseValue).toBe(58.2);
    expect(state.deregistrationPenalties).toEqual(['cb1']);
  });

  it('replays_identically', () => {
    const live = play(three, off('cb1', 'UCL'), advance, on('cb1', 'UCL'));
    expect(replay(three, live.actionLog)).toEqual(live);
  });
});

describe('on the pitch', () => {
  it('cannot_be_picked_off_the_premier_league_list', () => {
    expect(() =>
      play(makeTestConfig(), off('st1', 'PL'), {
        type: 'PICK_XI',
        selection: fixtureXI,
      }),
    ).toThrowError(/off the Premier League list and cannot play/);
  });

  it('can_still_be_picked_off_the_uefa_list_only', () => {
    const state = play(makeTestConfig(), off('st1', 'UCL'), {
      type: 'PICK_XI',
      selection: fixtureXI,
    });
    expect(state.xi).toEqual(fixtureXI);
  });

  it('refuses_to_deregister_a_player_in_the_picked_eleven', () => {
    expect(() =>
      play(
        makeTestConfig(),
        { type: 'PICK_XI', selection: fixtureXI },
        off('st1', 'PL'),
      ),
    ).toThrowError(/take him out of it first/);
  });

  it('leaves_him_out_of_the_automatic_eleven', () => {
    // gk1 and gk2 tie on quality and gk1 wins on id; with gk1 off the list,
    // gk2 keeps goal instead.
    const before = autoPickBestXI(createGame(makeTestConfig())).playerIds;
    const after = autoPickBestXI(play(makeTestConfig(), off('gk1', 'PL'))).playerIds;
    expect(before).toContain('gk1');
    expect(after).not.toContain('gk1');
    expect(after).toContain('gk2');
  });

  it('leaves_him_out_of_depth_and_balance', () => {
    // gk2 (70) and gk3 (60) are the bench; with gk2 off, depth is gk3 alone.
    const state = play(makeTestConfig(), off('gk2', 'PL'), {
      type: 'PICK_XI',
      selection: fixtureXI,
    });
    const breakdown = scoreGame(state);
    expect(breakdown.squadQuality.depthAverage).toBe(60);
    // Keeper cover falls from 70 + 70 + 60 to 70 + 60 of 90s.
    const registered = scoreGame(
      play(makeTestConfig(), { type: 'PICK_XI', selection: fixtureXI }),
    );
    expect(breakdown.balance.score).toBeLessThan(registered.balance.score);
  });

  it('leaves_him_out_of_the_season_projection', () => {
    // gk2 off the list projects exactly as a squad without him.
    const config = makeTestConfig();
    const pick: Action = { type: 'PICK_XI', selection: fixtureXI };
    const offList = simulateSeason(play(config, off('gk2', 'PL'), pick));
    const without = simulateSeason(
      play(
        { ...config, initialSquad: config.initialSquad.filter((p) => p.id !== 'gk2') },
        pick,
      ),
    );
    expect(offList).toEqual(without);
  });
});

describe('value created', () => {
  it('penalises_a_player_still_off_a_list_at_the_end', () => {
    // The end closes the final window. gk2 (3) drops to 2.4, so worth falls
    // from 500 to 499.4: ratio 0.9988 earns 49.7, less 10 for him.
    const state = play(makeTestConfig(), off('gk2', 'UCL'), {
      type: 'PICK_XI',
      selection: fixtureXI,
    });
    expect(scoreGame(state).valueCreated).toEqual({
      ratio: 0.999,
      score: 39.7,
      deregistered: 1,
      penalty: 10,
    });
  });

  it('counts_a_player_penalised_earlier_even_after_he_is_sold', () => {
    const three = makeThreeWindowConfig();
    // Renewing the two 2027 expiries, and replacing rw1 once he is sold,
    // keeps enough outfielders to field an eleven at the end.
    const final = play(
      three,
      { type: 'RENEW', playerId: 'cb2', newExpiryYear: 2030 },
      { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
      off('rw1', 'UCL'),
      advance,
      { type: 'SELL', playerId: 'rw1' },
      { type: 'BUY', playerId: 'jan-cm' },
      advance,
    );
    const scored = applyAction(final, {
      type: 'PICK_XI',
      selection: autoPickBestXI(final),
    });
    const { deregistered, penalty } = scoreGame(scored).valueCreated;
    expect(deregistered).toBe(1);
    expect(penalty).toBe(10);
  });

  it('never_takes_the_component_below_zero', () => {
    // Twelve players still off the UCL list: 120 points of penalty.
    const ids = createGame(makeTestConfig())
      .squad.map((p) => p.id)
      .slice(0, 12);
    const state = play(
      makeTestConfig(),
      ...ids.map((id) => off(id, 'UCL')),
      { type: 'PICK_XI', selection: fixtureXI },
    );
    expect(scoreGame(state).valueCreated.score).toBe(0);
  });
});

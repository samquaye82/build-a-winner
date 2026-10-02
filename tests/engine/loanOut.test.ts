/**
 * Tests for loaning players out during the game (Sam, 02/10/2026): the 15%
 * fee, a loan lasting to the end of its season, the undo, what the club
 * still carries while he is away, and how a player still away at the end
 * is scored.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSquadCost,
  createGame,
  loanFee,
  loanReturnWindow,
  replay,
  scoreGame,
  type Action,
  type GameConfig,
  type GameState,
  type XISelection,
} from '../../src/engine';
import {
  makeSquadPlayer,
  makeTestConfig,
  makeThreeWindowConfig,
} from './fixtures';

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

/** Loans a player out. */
function lend(playerId: string): Action {
  return { type: 'LOAN_OUT', playerId };
}

/** The single-window fixture XI (see scoring.test.ts). */
const fixtureXI: XISelection = {
  formationId: '4-2-3-1',
  playerIds: [
    'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
    'cm1', 'cm2', 'rw1', 'am1', 'lw1', 'st1',
  ],
};
const pick: Action = { type: 'PICK_XI', selection: fixtureXI };

/**
 * Keeps cb2 past the 2027 boundary. Two expiries there leave the fixture
 * squad on eleven, so without it no one could be lent in Summer 2027.
 */
const renewCb2: Action = { type: 'RENEW', playerId: 'cb2', newExpiryYear: 2030 };

describe('loanFee and loanReturnWindow', () => {
  it('charges_fifteen_percent_of_sale_value_rounded', () => {
    expect(loanFee({ saleValue: 40 })).toBe(6);
    // 17.5 x 0.15 = 2.625 -> 2.6.
    expect(loanFee({ saleValue: 17.5 })).toBe(2.6);
  });

  it('ends_a_loan_at_the_first_window_of_the_next_season', () => {
    const three = createGame(makeThreeWindowConfig());
    expect(loanReturnWindow(three)).toBe(1);
    expect(loanReturnWindow({ ...three, windowIndex: 1 })).toBe(3);
    expect(loanReturnWindow({ ...three, windowIndex: 2 })).toBe(3);
  });
});

describe('LOAN_OUT', () => {
  it('banks_fifteen_percent_of_his_sale_value', () => {
    // rw1 has three years left: sale value 55, fee 8.25 -> 8.3.
    const state = play(makeTestConfig(), lend('rw1'));
    expect(state.funds).toBe(108.3);
    expect(state.loanedOut[0]?.agreed).toEqual({ windowIndex: 0, fee: 8.3 });
    expect(state.squad.map((p) => p.id)).not.toContain('rw1');
  });

  it('brings_a_january_loan_back_in_the_summer', () => {
    const three = makeThreeWindowConfig();
    const january = play(three, lend('rw1'));
    expect(january.loanedOut[0]?.returnsInWindow).toBe(1);

    const summer = applyAction(january, advance);
    expect(summer.squad.map((p) => p.id)).toContain('rw1');
    expect(summer.loanedOut).toEqual([]);
  });

  it('keeps_a_summer_loan_away_past_the_last_window', () => {
    // Summer 2027 to Summer 2028: still away when the game ends. Renewing
    // cb2 keeps the squad big enough to lend rw1 and still submit.
    const three = makeThreeWindowConfig();
    const summer = play(three, renewCb2, advance, lend('rw1'));
    expect(summer.loanedOut[0]?.returnsInWindow).toBe(3);

    const january = applyAction(summer, advance);
    expect(january.squad.map((p) => p.id)).not.toContain('rw1');
    expect(january.loanedOut.map((l) => l.player.id)).toEqual(['rw1']);
  });

  it('refuses_a_locked_player', () => {
    expect(() => play(makeTestConfig(), lend('cb1'))).toThrowError(
      /will not sanction loaning out/,
    );
  });

  it('refuses_a_player_on_loan_to_the_club', () => {
    const config = makeTestConfig();
    const borrowed = makeSquadPlayer({ id: 'borrowed', onLoan: true });
    expect(() =>
      play({ ...config, initialSquad: [...config.initialSquad, borrowed] }, lend('borrowed')),
    ).toThrowError(/not the club's to lend/);
  });

  it('refuses_a_player_in_the_picked_eleven', () => {
    expect(() => play(makeTestConfig(), pick, lend('rw1'))).toThrowError(
      /take him out of it first/,
    );
  });
});

describe('UNDO_LOAN_OUT', () => {
  it('returns_him_exactly_as_he_left_and_repays_the_fee', () => {
    const fresh = createGame(makeTestConfig());
    const state = play(makeTestConfig(), lend('rw1'), {
      type: 'UNDO_LOAN_OUT',
      playerId: 'rw1',
    });
    expect(state.funds).toBe(fresh.funds);
    expect(state.loanedOut).toEqual([]);
    expect(state.squad.find((p) => p.id === 'rw1')).toEqual(
      fresh.squad.find((p) => p.id === 'rw1'),
    );
  });

  it('refuses_once_the_window_has_closed', () => {
    const three = makeThreeWindowConfig();
    expect(() =>
      play(three, renewCb2, advance, lend('rw1'), advance, {
        type: 'UNDO_LOAN_OUT',
        playerId: 'rw1',
      }),
    ).toThrowError(/not loaned out in the current window/);
  });
});

describe('while away', () => {
  it('takes_his_wage_off_the_book', () => {
    const before = computeSquadCost(createGame(makeTestConfig()));
    const after = computeSquadCost(play(makeTestConfig(), lend('rw1')));
    expect(after.wageBill).toBe(before.wageBill - 5);
  });

  it('keeps_an_in_game_signings_fee_amortising', () => {
    // buy-st: EUR 60m over five years, 12 a year, wage 9.
    const bought = play(makeTestConfig(), { type: 'BUY', playerId: 'buy-st' });
    const lent = applyAction(bought, lend('buy-st'));
    expect(computeSquadCost(lent).signingAmortisation).toBe(12);
    expect(computeSquadCost(lent).wageBill).toBe(
      computeSquadCost(bought).wageBill - 9,
    );
  });

  it('lets_a_contract_that_ends_while_away_end_there', () => {
    // cb2's deal ends in 2027: lent in January, he is released at the
    // boundary rather than coming back.
    const state = play(makeThreeWindowConfig(), lend('cb2'), advance);
    expect(state.squad.map((p) => p.id)).not.toContain('cb2');
    expect(state.loanedOut).toEqual([]);
    expect(
      state.departed.find((d) => d.player.id === 'cb2')?.reason,
    ).toBe('expired');
    expect(state.market.find((p) => p.id === 'cb2')?.club).toBe('Free agent');
  });

  it('spares_a_deregistered_player_the_penalty_and_brings_him_back_registered', () => {
    const state = play(
      makeThreeWindowConfig(),
      { type: 'DEREGISTER', playerId: 'rw1', competition: 'UCL' },
      lend('rw1'),
      advance,
    );
    expect(state.deregistrationPenalties).toEqual([]);
    const returned = state.squad.find((p) => p.id === 'rw1');
    expect(returned).toBeDefined();
    expect(returned?.deregisteredFrom).toBeUndefined();
  });

  it('replays_identically', () => {
    const three = makeThreeWindowConfig();
    const live = play(three, lend('rw1'), advance, lend('lw1'));
    expect(replay(three, live.actionLog)).toEqual(live);
  });
});

describe('still away at the end', () => {
  it('counts_in_contract_health_and_age_but_not_on_the_pitch', () => {
    // gk2 lent in the single (final) window is away when the game ends.
    const untouched = scoreGame(play(makeTestConfig(), pick));
    const lent = scoreGame(play(makeTestConfig(), lend('gk2'), pick));
    expect(lent.contractHealth).toEqual(untouched.contractHealth);
    expect(lent.ageProfile).toEqual(untouched.ageProfile);
    // Depth was gk2 (70) and gk3 (60); with gk2 away it is gk3 alone.
    expect(lent.squadQuality.depthAverage).toBe(60);
  });
});

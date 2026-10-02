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

/**
 * Keeps the fixture squad submittable past Summer 2027. The season boundary
 * is the first transition, where cb2 and cm1 expire and the twelve-man
 * fixture squad drops to ten, below the eleven needed to submit. A free
 * academy promotion restores the eleventh man without touching funds,
 * values or departures, so the tests below still measure only progression.
 */
const refill: Action = { type: 'PROMOTE', playerId: 'acad-cb' };

describe('ADVANCE_WINDOW guards', () => {
  it('rejects_advancing_past_the_final_window', () => {
    expect(() => play(advance, refill, advance, advance)).toThrowError(
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

describe('January 2027 -> Summer 2027 (season boundary)', () => {
  it('rolls_funds_forward_and_adds_the_new_budget', () => {
    // 100 - 60 (buy-st) = 40, + 30 Summer 2027 budget = 70.
    const state = play({ type: 'BUY', playerId: 'buy-st' }, advance);
    expect(state.windowIndex).toBe(1);
    expect(state.funds).toBe(70);
  });

  it('ages_every_player_by_one_year', () => {
    const state = play(advance);
    const byId = new Map(state.squad.map((p) => [p.id, p]));
    expect(byId.get('gk2')?.age).toBe(32);
    expect(byId.get('am1')?.age).toBe(20);
    expect(byId.get('lw1')?.age).toBe(21);
  });

  it('releases_unrenewed_expiring_contracts_for_free', () => {
    const state = play(advance);
    const squadIds = state.squad.map((p) => p.id);

    expect(squadIds).not.toContain('cb2');
    expect(squadIds).not.toContain('cm1');

    const expired = state.departed.filter((d) => d.reason === 'expired');
    expect(expired.map((d) => d.player.id).sort()).toEqual(['cb2', 'cm1']);
    // Free exits: no fee is banked. Funds are budgets only: 100 + 30.
    expect(state.funds).toBe(130);
  });

  it('relists_expired_players_as_free_agents_in_the_new_market', () => {
    const state = play(advance);
    const cm1 = state.market.find((p) => p.id === 'cm1');

    expect(cm1).toBeDefined();
    expect(cm1?.fee).toBe(0);
    expect(cm1?.club).toBe('Free agent');
    // Free-agency wage premium on the old salary: 8 x 1.5.
    expect(cm1?.wageDemand).toBe(12);
    expect(cm1?.age).toBe(27);
    // He is worth plenty despite the zero fee (explicit baseValue).
    expect(cm1?.baseValue).toBeGreaterThan(30);

    // Buying him back works and books the real value, not the zero fee.
    const resigned = applyAction(state, { type: 'BUY', playerId: 'cm1' });
    const player = resigned.squad.find((p) => p.id === 'cm1');
    expect(resigned.funds).toBe(130); // no fee left the account
    expect(player?.baseValue).toBe(cm1?.baseValue);
    expect(player?.contract.salary).toBe(12);
  });

  it('keeps_uefa_training_status_on_a_released_player', () => {
    // A released academy graduate is still club-trained if re-signed.
    const config = makeThreeWindowConfig();
    const graduate = config.initialSquad.map((p) =>
      p.id === 'cm1' ? { ...p, uefaTraining: 'club' as const } : p,
    );
    const state = applyAction(
      createGame({ ...config, initialSquad: graduate }),
      advance,
    );
    expect(state.market.find((p) => p.id === 'cm1')?.uefaTraining).toBe(
      'club',
    );
  });

  it('returns_a_loanee_to_his_parent_club_rather_than_free_agency', () => {
    // cb2's deal ends at the boundary. As an ordinary player he would
    // become a free agent anyone could sign; as a loanee he belongs to
    // another club, so he must simply be gone.
    const config = makeThreeWindowConfig();
    const state = createGame({
      ...config,
      initialSquad: config.initialSquad.map((p) =>
        p.id === 'cb2' ? { ...p, onLoan: true } : p,
      ),
    });
    const advanced = applyAction(state, { type: 'ADVANCE_WINDOW' });

    expect(advanced.squad.map((p) => p.id)).not.toContain('cb2');
    expect(advanced.market.find((p) => p.id === 'cb2')).toBeUndefined();

    const departure = advanced.departed.find((d) => d.player.id === 'cb2');
    expect(departure?.reason).toBe('loan-ended');
  });

  it('keeps_a_renewed_player_through_the_boundary', () => {
    const state = play(
      { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
      advance,
    );
    const cm1 = state.squad.find((p) => p.id === 'cm1');
    expect(cm1).toBeDefined();
    expect(cm1?.contract.expiryYear).toBe(2030);
  });

  it('pulls_an_aged_u21_into_the_registration_count', () => {
    // A 21-year-old non-home-grown player is exempt in the opening window
    // but turns 22 at the boundary and starts counting.
    const config = makeThreeWindowConfig();
    const squad = [
      ...config.initialSquad,
      makeSquadPlayer({ id: 'edge-u21', age: 21, homegrown: false }),
    ];
    let state = createGame({ ...config, initialSquad: squad });
    expect(countRegistration(state.squad).over21).toBe(10);

    state = applyAction(state, advance);
    // cb2 and cm1 expire (-2 over-21s); edge-u21 now counts (+1).
    expect(countRegistration(state.squad).over21).toBe(9);
    expect(state.squad.find((p) => p.id === 'edge-u21')?.age).toBe(22);
  });

  it('drifts_value_with_the_age_the_player_has_crossed_into', () => {
    const state = play(advance);
    const byId = new Map(state.squad.map((p) => [p.id, p]));

    // cb1: age 27, quality 90 -> +8%/yr -> +4% for one transition:
    // 70 -> 72.8. His 2029 deal has 24 months left in a summer window,
    // so the running-down discount is 0.9: 72.8 x 0.9 = 65.5.
    expect(byId.get('cb1')?.baseValue).toBe(72.8);
    expect(byId.get('cb1')?.saleValue).toBe(65.5);
    // gk2: age 32 -> -12%/yr -> -6%: 3 -> 2.8.
    expect(byId.get('gk2')?.baseValue).toBe(2.8);
    // am1: age 20, quality 78 -> +12%/yr -> +6%: 30 -> 31.8.
    expect(byId.get('am1')?.baseValue).toBe(31.8);
  });
});

describe('Summer 2027 -> January 2028 (same season)', () => {
  it('rolls_funds_forward_across_both_windows', () => {
    // Budgets only, no sales: 100 + 30 + 80.
    expect(play(advance, refill, advance).funds).toBe(210);
  });

  it('does_not_age_players_or_expire_contracts_mid_season', () => {
    const state = play(advance, refill, advance);
    const byId = new Map(state.squad.map((p) => [p.id, p]));

    // Both aged once at the boundary and stay put through mid-season.
    expect(byId.get('gk2')?.age).toBe(32);
    expect(byId.get('cb1')?.age).toBe(27);
    // Nothing further expires: the season has not turned again.
    expect(state.departed.filter((d) => d.reason === 'expired')).toHaveLength(2);
  });

  it('compounds_value_drift_at_half_the_annual_rate', () => {
    const state = play(advance, refill, advance);
    const byId = new Map(state.squad.map((p) => [p.id, p]));

    // cb1: 70 -> 72.8 across the boundary, then 72.8 -> 75.7 mid-season,
    // both at half the annual +8%. January sits six months into the
    // season, so his 2029 deal now reads 18 months: discount 0.75.
    expect(byId.get('cb1')?.baseValue).toBe(75.7);
    expect(byId.get('cb1')?.saleValue).toBe(56.8);
    // gk2: 2.8 -> 2.6 at -6% a transition.
    expect(byId.get('gk2')?.baseValue).toBe(2.6);
  });

  it('opens_the_new_market_minus_players_already_at_the_club', () => {
    // buy-cb is bought in January 2027 and also authored into the
    // January 2028 pool: the engine must not list him twice.
    const bought = play({ type: 'BUY', playerId: 'buy-cb' }, advance, advance);
    expect(bought.market.map((p) => p.id)).not.toContain('buy-cb');
    expect(bought.market.map((p) => p.id)).toContain('s27-lw');

    // Left unbought, he appears at his drifted authored price.
    const without = play(advance, refill, advance);
    expect(without.market.map((p) => p.id)).toContain('buy-cb');
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

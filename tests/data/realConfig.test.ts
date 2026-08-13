/**
 * Smoke tests over the generated real dataset. These assert structural
 * truths that survive regeneration (counts move; invariants must not).
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSquadCost,
  countRegistration,
  createGame,
  validateState,
} from '../../src/engine';
import { realConfig } from '../../src/data/realConfig';

describe('realConfig', () => {
  it('builds_a_playable_three_window_game', () => {
    const state = createGame(realConfig);
    expect(state.config.windows).toHaveLength(3);
    expect(state.funds).toBe(200);
    expect(state.squad.length).toBeGreaterThanOrEqual(25);
    expect(state.market.length).toBeGreaterThan(3000);
  });

  it('gives_every_player_complete_finite_numbers', () => {
    const state = createGame(realConfig);
    for (const p of state.squad) {
      expect(Number.isFinite(p.baseValue), p.name).toBe(true);
      expect(Number.isFinite(p.contract.salary), p.name).toBe(true);
      expect(p.contract.expiryYear).toBeGreaterThanOrEqual(2027);
      expect(p.quality).toBeGreaterThanOrEqual(45);
    }
    for (const p of state.market.slice(0, 500)) {
      expect(Number.isFinite(p.fee), p.name).toBe(true);
      expect(Number.isFinite(p.wageDemand), p.name).toBe(true);
    }
  });

  it('locks_the_board_list_and_the_untouchables', () => {
    const state = createGame(realConfig);
    const wirtz = state.squad.find((p) => p.name.includes('Wirtz'));
    expect(wirtz?.locked).toBe(true);
    const haaland = state.market.find((p) => p.name.includes('Haaland'));
    expect(haaland?.locked).toBe(true);
    // Locked market players remain a small minority.
    const lockedShare =
      state.market.filter((p) => p.locked === true).length / state.market.length;
    expect(lockedShare).toBeLessThan(0.03);
  });

  it('locks_every_player_at_rival_clubs', () => {
    const state = createGame(realConfig);
    const rivals = state.market.filter(
      (p) => p.club === 'Manchester United' || p.club === 'Everton',
    );
    expect(rivals.length).toBeGreaterThan(30);
    expect(rivals.every((p) => p.locked === true)).toBe(true);
  });

  it('honours_named_unlock_exceptions_over_the_value_threshold', () => {
    const state = createGame(realConfig);
    const vinicius = state.market.find((p) => p.name === 'Vinicius Junior');
    expect(vinicius).toBeDefined();
    expect(vinicius?.locked).toBe(false);
  });

  it('starts_with_a_believable_scr_position', () => {
    const state = createGame(realConfig);
    const cost = computeSquadCost(state);
    // Squad cost should start pressured but legal-adjacent: between 50%
    // and 90% of the cap basis.
    expect(cost.ratio).toBeGreaterThan(0.5);
    expect(cost.ratio).toBeLessThan(0.9);
  });

  it('documents_the_starting_registration_position', () => {
    const state = createGame(realConfig);
    const counts = countRegistration(state.squad);
    // 31-man squad: whether over-21s exceed 25 is data-dependent; the
    // game must simply report a coherent starting position.
    expect(counts.total).toBe(state.squad.length);
    const violations = validateState(state);
    for (const violation of violations) {
      expect(violation.message.length).toBeGreaterThan(0);
    }
  });

  it('marks_loanees_as_unsellable_in_the_real_squad', () => {
    // Wiring check for LOANED_IN: the list is matched by display name, so
    // a rename in the dataset would silently stop flagging anyone and
    // hand the player a free sale of a player the club does not own.
    const state = createGame(realConfig);
    const loanees = state.squad.filter((p) => p.onLoan === true);
    expect(loanees.length).toBeGreaterThan(0);
    for (const loanee of loanees) {
      expect(() =>
        applyAction(state, { type: 'SELL', playerId: loanee.id }),
      ).toThrowError(/on loan/);
      expect(() =>
        applyAction(state, {
          type: 'RENEW',
          playerId: loanee.id,
          newExpiryYear: 2030,
        }),
      ).toThrowError(/on loan/);
      // The loan's own end date, not the parent club's contract.
      expect(loanee.contract.expiryYear).toBe(2027);
    }
  });

  it('sends_loanees_back_to_their_parent_club_after_the_season', () => {
    const state = createGame(realConfig);
    const loaneeIds = state.squad
      .filter((p) => p.onLoan === true)
      .map((p) => p.id);
    const summer2027 = applyAction(
      applyAction(state, { type: 'ADVANCE_WINDOW' }),
      { type: 'ADVANCE_WINDOW' },
    );
    for (const id of loaneeIds) {
      expect(summer2027.squad.find((p) => p.id === id)).toBeUndefined();
      // Crucially not a free agent: he is under contract elsewhere.
      expect(summer2027.market.find((p) => p.id === id)).toBeUndefined();
      expect(
        summer2027.departed.find((d) => d.player.id === id)?.reason,
      ).toBe('loan-ended');
    }
  });

  it('prices_summer_2027_free_agents_at_zero', () => {
    const finalMarket = realConfig.marketByWindow[2] ?? [];
    const frees = finalMarket.filter((p) => p.fee === 0);
    expect(frees.length).toBeGreaterThan(100);
    // Free agents still cost wages.
    for (const p of frees.slice(0, 50)) {
      expect(p.wageDemand).toBeGreaterThan(0);
    }
  });
});

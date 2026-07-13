/**
 * Smoke tests over the generated real dataset. These assert structural
 * truths that survive regeneration (counts move; invariants must not).
 */
import { describe, expect, it } from 'vitest';
import {
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

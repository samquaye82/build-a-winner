/**
 * Tests for the club's wage structure (rules/wageStructure.ts): the floor a
 * new contract must meet, and its effect on signings.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSquadCost,
  createGame,
  priceRenewal,
  signingWage,
  wageFloor,
  wageGroupOf,
  type GameState,
  type MarketPlayer,
  type SquadPlayer,
} from '../../src/engine';
import {
  makeMarketPlayer,
  makeSquadPlayer,
  makeTestConfig,
  testWindow,
} from './fixtures';

/** A squad player for the pure floor tests (seeds and players line up). */
function squadPlayer(overrides: Parameters<typeof makeSquadPlayer>[0]): SquadPlayer {
  return { saleValue: 0, ...makeSquadPlayer(overrides) } as SquadPlayer;
}

/** A midfield with a clear top earner, plus a high-paid defender. */
const SQUAD: readonly SquadPlayer[] = [
  squadPlayer({ id: 'cm-star', position: 'CM', quality: 85, contract: { expiryYear: 2030, salary: 20 } }),
  squadPlayer({ id: 'am-mid', position: 'AM', quality: 83, contract: { expiryYear: 2030, salary: 10 } }),
  squadPlayer({ id: 'cm-low', position: 'CM', quality: 70, contract: { expiryYear: 2030, salary: 2 } }),
  squadPlayer({ id: 'cb-star', position: 'CB', quality: 82, contract: { expiryYear: 2030, salary: 30 } }),
];

describe('wageGroupOf', () => {
  it('groups_positions_without_overlap', () => {
    expect(wageGroupOf('GK')).toBe('GK');
    expect(['RB', 'LB', 'CB'].map((p) => wageGroupOf(p as 'RB'))).toEqual(['DEF', 'DEF', 'DEF']);
    expect(['CM', 'AM'].map((p) => wageGroupOf(p as 'CM'))).toEqual(['MID', 'MID']);
    expect(['RW', 'LW', 'ST'].map((p) => wageGroupOf(p as 'ST'))).toEqual(['FWD', 'FWD', 'FWD']);
  });
});

describe('wageFloor', () => {
  it('is_70_percent_of_the_best_paid_comparable_in_the_group', () => {
    // CM 82: cm-star (85, 20) and am-mid (83, 10) are in range; 70% of 20.
    expect(wageFloor(SQUAD, { id: 'new', position: 'CM', quality: 82 })).toBe(14);
  });

  it('includes_a_player_exactly_three_points_away_and_excludes_four', () => {
    expect(wageFloor(SQUAD, { id: 'new', position: 'AM', quality: 88 })).toBe(14);
    expect(wageFloor(SQUAD, { id: 'new', position: 'AM', quality: 89 })).toBe(0);
  });

  it('ignores_other_wage_groups', () => {
    // cb-star is rated 82 but is a defender: no help to a midfielder.
    expect(wageFloor(SQUAD, { id: 'new', position: 'CM', quality: 79 })).toBe(0);
    expect(wageFloor(SQUAD, { id: 'new', position: 'RB', quality: 80 })).toBe(21);
  });

  it('never_compares_a_player_with_himself', () => {
    // Renewing cm-star: only am-mid (83, 10) is in range.
    expect(wageFloor(SQUAD, { id: 'cm-star', position: 'CM', quality: 85 })).toBe(7);
  });

  it('ignores_players_at_the_club_on_loan', () => {
    const withLoanee = [
      ...SQUAD,
      squadPlayer({ id: 'loanee', position: 'CM', quality: 82, onLoan: true, contract: { expiryYear: 2027, salary: 40 } }),
    ];
    expect(wageFloor(withLoanee, { id: 'new', position: 'CM', quality: 82 })).toBe(14);
  });

  it('is_zero_when_nobody_is_in_range', () => {
    expect(wageFloor(SQUAD, { id: 'new', position: 'GK', quality: 80 })).toBe(0);
  });
});

/** A one-window game with the given market and the standard squad. */
function gameWith(market: MarketPlayer[]): GameState {
  return createGame({ ...makeTestConfig(), marketByWindow: [market] });
}

describe('signing wages', () => {
  // Fixture squad: cm1 (CM 80, salary 8), am1 (AM 78, 5), rw1 (RW 84, 5).
  const cheapCM = makeMarketPlayer({ id: 'cheap-cm', position: 'CM', quality: 81, wageDemand: 1, fee: 10 });
  const dearCM = makeMarketPlayer({ id: 'dear-cm', position: 'CM', quality: 81, wageDemand: 12, fee: 10 });
  const starCM = makeMarketPlayer({ id: 'star-cm', position: 'AM', quality: 83, wageDemand: 20, fee: 10 });

  it('lifts_a_low_demand_to_the_floor', () => {
    const state = gameWith([cheapCM]);
    // Best-paid midfielder within 3 points of 81 is cm1 on 8: 70% is 5.6.
    expect(signingWage(state, cheapCM)).toBe(5.6);
  });

  it('keeps_a_demand_already_above_the_floor', () => {
    expect(signingWage(gameWith([dearCM]), dearCM)).toBe(12);
  });

  it('contracts_a_signing_at_the_floored_wage', () => {
    const state = applyAction(gameWith([cheapCM]), { type: 'BUY', playerId: 'cheap-cm' });
    const signed = state.squad.find((p) => p.id === 'cheap-cm');
    expect(signed?.contract.salary).toBe(5.6);
    // 63 opening wage bill plus the floored 5.6.
    expect(computeSquadCost(state).wageBill).toBe(68.6);
  });

  it('rises_after_a_big_signing_in_the_same_band', () => {
    const state = applyAction(gameWith([starCM, cheapCM]), { type: 'BUY', playerId: 'star-cm' });
    // star-cm (AM 83, 20) is now the best-paid comparable: 70% of 20.
    expect(signingWage(state, cheapCM)).toBe(14);
  });

  it('falls_after_the_top_comparable_is_sold', () => {
    const state = applyAction(gameWith([cheapCM]), { type: 'SELL', playerId: 'cm1' });
    // Only am1 (AM 78, 5) is left in range: 70% of 5.
    expect(signingWage(state, cheapCM)).toBe(3.5);
  });
});

describe('renewal wages', () => {
  it('lifts_a_low_renewal_to_the_floor', () => {
    // cm-low renewed as if rated 84: cm-star (85, 20) is in range, so the
    // floor is 14, far above the normal uplift on 2.
    const underpaid = squadPlayer({ id: 'cm-low', position: 'CM', quality: 84, contract: { expiryYear: 2027, salary: 2 } });
    expect(priceRenewal(underpaid, 2030, testWindow, SQUAD).salary).toBe(14);
  });

  it('keeps_a_normal_uplift_already_above_the_floor', () => {
    const wellPaid = squadPlayer({ id: 'cm-rich', position: 'CM', quality: 84, contract: { expiryYear: 2027, salary: 18 } });
    expect(priceRenewal(wellPaid, 2030, testWindow, SQUAD).salary).toBeGreaterThan(18);
  });

  it('takes_the_floor_over_the_star_rule_when_higher', () => {
    // A quality-85 star on 5 doubles to 10 under the star rule; with a
    // team-mate on 30 in range, the floor of 21 is the higher demand.
    const star = squadPlayer({ id: 'star', position: 'CM', quality: 85, contract: { expiryYear: 2027, salary: 5 } });
    const squad = [...SQUAD, squadPlayer({ id: 'rich', position: 'AM', quality: 86, contract: { expiryYear: 2030, salary: 30 } })];
    expect(priceRenewal(star, 2030, testWindow, []).salary).toBe(10);
    expect(priceRenewal(star, 2030, testWindow, squad).salary).toBe(21);
  });

  it('renews_at_the_floor_through_the_reducer', () => {
    // am1 (AM 78, salary 5) renewed with cm1 (CM 80) paid 20: the floor of
    // 14 is far above the normal uplift on 5, so it must come from the
    // squad the reducer passes in.
    const config = makeTestConfig();
    const state = createGame({
      ...config,
      initialSquad: config.initialSquad.map((p) =>
        p.id === 'cm1' ? { ...p, contract: { ...p.contract, salary: 20 } } : p,
      ),
    });
    const renewed = applyAction(state, { type: 'RENEW', playerId: 'am1', newExpiryYear: 2031 });
    expect(renewed.squad.find((p) => p.id === 'am1')?.contract.salary).toBe(14);
  });
});

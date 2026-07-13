/**
 * Tests for the star-player wage rule (Sam, 13/07/2026): an elite player
 * (quality >= 85) still on modest money (<= 200k a week, i.e. EUR 10.4m a
 * year) demands double their current wage for any new deal; everyone else
 * negotiates on the normal renewal curve. The move side of the same rule is
 * exercised through the data generator, not here.
 */
import { describe, expect, it } from 'vitest';
import {
  priceRenewal,
  type SquadPlayer,
  type WindowConfig,
} from '../../src/engine';
import { isStarWageCase } from '../../src/engine/rules/wage';

/** Summer 2026 fixture window (season starts 2026). */
const window: WindowConfig = {
  id: 'summer-2026',
  label: 'Summer 2026',
  seasonStartYear: 2026,
  midSeason: false,
  budget: 100,
  squadCostCapBase: 250,
};

/** Builds a runtime squad player with sensible defaults for renewal pricing. */
function squadPlayer(overrides: Partial<SquadPlayer>): SquadPlayer {
  return {
    id: 'p',
    name: 'Test Player',
    position: 'CM',
    age: 26,
    homegrown: false,
    quality: 70,
    baseValue: 20,
    locked: false,
    saleValue: 20,
    contract: { expiryYear: 2027, salary: 5 },
    ...overrides,
  };
}

describe('isStarWageCase', () => {
  it('is_true_only_for_elite_players_on_modest_wages', () => {
    expect(isStarWageCase(5, 90)).toBe(true);
    // Boundaries are inclusive on both axes: quality 85 and 10.4m a year.
    expect(isStarWageCase(10.4, 85)).toBe(true);
    // Just below elite, or just above the wage cap: normal negotiation.
    expect(isStarWageCase(5, 84)).toBe(false);
    expect(isStarWageCase(10.5, 90)).toBe(false);
  });
});

describe('priceRenewal star-player rule', () => {
  it('doubles_the_wage_of_an_underpaid_star_regardless_of_years_added', () => {
    // Quality 90 on 5m a year: the star rule pins every extension at 10m.
    const star = squadPlayer({ quality: 90, contract: { expiryYear: 2027, salary: 5 } });
    expect(priceRenewal(star, 2030, window).salary).toBe(10);
    expect(priceRenewal(star, 2031, window).salary).toBe(10);
  });

  it('overrides_a_normal_uplift_that_would_be_lower', () => {
    // A final-year quality-90 star's normal uplift tops out near +48%; the
    // star rule (+100%) is the higher demand and therefore wins.
    const star = squadPlayer({ quality: 90, contract: { expiryYear: 2027, salary: 5 } });
    const normalTopUplift = priceRenewal(
      squadPlayer({ quality: 90, contract: { expiryYear: 2027, salary: 12 } }),
      2030,
      window,
    ).salary;
    expect(priceRenewal(star, 2030, window).salary).toBeGreaterThan(
      (normalTopUplift / 12) * 5,
    );
  });

  it('leaves_a_star_already_above_the_wage_cap_on_the_normal_curve', () => {
    // Quality 90 on 12m a year (> 10.4m): normal final-year uplift applies.
    // uplift = (0.35 + 0.02*3) * (0.8 + 90/250) = 0.4756; 12 * 1.4756 = 17.7.
    const player = squadPlayer({ quality: 90, contract: { expiryYear: 2027, salary: 12 } });
    expect(priceRenewal(player, 2030, window).salary).toBe(17.7);
  });

  it('leaves_a_non_star_on_a_low_wage_on_the_normal_curve', () => {
    // Quality 80 on 5m a year: below the elite threshold, so no doubling.
    // uplift = (0.35 + 0.06) * (0.8 + 80/250) = 0.4592; 5 * 1.4592 = 7.3.
    const player = squadPlayer({ quality: 80, contract: { expiryYear: 2027, salary: 5 } });
    expect(priceRenewal(player, 2030, window).salary).toBe(7.3);
  });
});

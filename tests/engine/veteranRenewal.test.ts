/**
 * Tests for veteran renewals (Sam, 03/10/2026): a player aged 33 or over
 * renews on a 30% pay cut, adding at most two years to his current deal.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  EngineError,
  isVeteranRenewal,
  maxRenewalExpiryYear,
  priceRenewal,
  type SquadPlayer,
} from '../../src/engine';
import { makeSquadPlayer, makeTestConfig, testWindow } from './fixtures';

/** A runtime squad player (seeds and players line up for these fields). */
function squadPlayer(overrides: Parameters<typeof makeSquadPlayer>[0]): SquadPlayer {
  return { saleValue: 0, ...makeSquadPlayer(overrides) } as SquadPlayer;
}

/** A 34-year-old centre back in the last year of a 20m deal. */
const VETERAN = squadPlayer({
  id: 'vet',
  position: 'CB',
  age: 34,
  quality: 88,
  contract: { expiryYear: 2027, salary: 20 },
});

describe('isVeteranRenewal', () => {
  it('starts_at_33', () => {
    expect(isVeteranRenewal(squadPlayer({ id: 'a', age: 32 }))).toBe(false);
    expect(isVeteranRenewal(squadPlayer({ id: 'b', age: 33 }))).toBe(true);
  });
});

describe('maxRenewalExpiryYear', () => {
  it('lets_a_veteran_add_at_most_two_years', () => {
    expect(maxRenewalExpiryYear(VETERAN, testWindow)).toBe(2029);
  });

  it('still_holds_a_veteran_to_the_five_year_cap', () => {
    // Expiring 2030 in a 2026 season: two more would be 2032, but the cap
    // is 2031.
    const longDeal = { ...VETERAN, contract: { expiryYear: 2030, salary: 20 } };
    expect(maxRenewalExpiryYear(longDeal, testWindow)).toBe(2031);
  });

  it('leaves_younger_players_on_the_five_year_cap', () => {
    const younger = { ...VETERAN, age: 32 };
    expect(maxRenewalExpiryYear(younger, testWindow)).toBe(2031);
  });
});

describe('veteran renewal pricing', () => {
  it('cuts_the_salary_by_30_percent_whatever_the_years_added', () => {
    expect(priceRenewal(VETERAN, 2028, testWindow, []).salary).toBe(14);
    expect(priceRenewal(VETERAN, 2029, testWindow, []).salary).toBe(14);
  });

  it('ignores_the_wage_structure_and_the_star_rule', () => {
    // A quality-88 veteran on 5 would double to 10 under the star rule,
    // and a team-mate on 40 would set a floor of 28: neither applies.
    const cheapStar = { ...VETERAN, contract: { expiryYear: 2027, salary: 5 } };
    const squad = [squadPlayer({ id: 'rich', position: 'CB', quality: 88, contract: { expiryYear: 2030, salary: 40 } })];
    expect(priceRenewal(cheapStar, 2029, testWindow, squad).salary).toBe(3.5);
  });

  it('rejects_a_third_year', () => {
    expect(() => priceRenewal(VETERAN, 2030, testWindow, [])).toThrowError(
      expect.objectContaining({ code: 'INVALID_EXPIRY_YEAR' }),
    );
  });

  it('renews_through_the_reducer_on_the_cut', () => {
    const config = makeTestConfig();
    const state = createGame({
      ...config,
      initialSquad: config.initialSquad.map((p) =>
        p.id === 'cb2' ? { ...p, age: 33 } : p,
      ),
    });
    // cb2 is on 4 to 2027: two years added at 70% is 2.8.
    const renewed = applyAction(state, { type: 'RENEW', playerId: 'cb2', newExpiryYear: 2029 });
    expect(renewed.squad.find((p) => p.id === 'cb2')?.contract).toEqual({
      expiryYear: 2029,
      salary: 2.8,
    });
    expect(() =>
      applyAction(state, { type: 'RENEW', playerId: 'cb2', newExpiryYear: 2030 }),
    ).toThrowError(EngineError);
  });
});

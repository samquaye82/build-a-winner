/**
 * Tests for Liverpool's own players away on loan for 2026/27 (Sam,
 * 02/10/2026): who is away, that they are nowhere else in the game while
 * away, and the terms they come back on in Summer 2027.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSquadCost,
  createGame,
  type Action,
} from '../../src/engine';
import { LIVERPOOL_OUT_ON_LOAN } from '../../src/data/loansOut';
import { realConfig } from '../../src/data/realConfig';

const state = createGame(realConfig);
const awayIds = state.loanedOut.map((loan) => loan.player.id);

/**
 * The opening January plus the two List A places it needs, then Summer
 * 2027 (see realConfig.test.ts for why the places are needed).
 *
 * @returns The state at the opening of Summer 2027.
 */
function summer2027() {
  const makeRoom: Action[] = [
    { type: 'SELL', playerId: 'konstantinos-tsimikas-35197' },
    { type: 'SELL', playerId: 'wataru-endo-34009' },
  ];
  return applyAction(makeRoom.reduce(applyAction, state), {
    type: 'ADVANCE_WINDOW',
  });
}

describe('Liverpool players out on loan', () => {
  it('resolves_every_entry', () => {
    expect(state.loanedOut).toHaveLength(LIVERPOOL_OUT_ON_LOAN.length);
  });

  it('sends_each_to_his_loan_club_until_summer_2027', () => {
    const where = Object.fromEntries(
      state.loanedOut.map((loan) => [loan.player.id, loan.club]),
    );
    expect(where).toEqual({
      'harvey-elliott-37715': 'Valencia',
      'ifeanyi-ndukwe': 'Levante',
      'lucca-brughmans-39626': 'Genk',
    });
    expect(state.loanedOut.every((loan) => loan.returnsInWindow === 1)).toBe(
      true,
    );
  });

  it('keeps_them_out_of_the_squad_academy_and_every_market', () => {
    for (const id of awayIds) {
      expect(state.squad.some((p) => p.id === id), id).toBe(false);
      expect(state.academy.some((p) => p.id === id), id).toBe(false);
      for (const pool of realConfig.marketByWindow) {
        expect(pool.some((p) => p.id === id), id).toBe(false);
      }
    }
  });

  it('brings_them_into_the_squad_in_summer_2027', () => {
    const summer = summer2027();
    for (const id of awayIds) {
      expect(summer.squad.some((p) => p.id === id), id).toBe(true);
    }
    expect(summer.loanedOut).toEqual([]);
  });
});

describe('Elliott', () => {
  it('returns_on_his_deal_to_2028', () => {
    const elliott = state.loanedOut.find(
      (loan) => loan.player.id === 'harvey-elliott-37715',
    )?.player;
    expect(elliott?.contract).toEqual({ expiryYear: 2028, salary: 4 });
    expect(elliott?.uefaTraining).toBe('club');
  });
});

describe('Ndukwe', () => {
  it('keeps_the_academy_terms', () => {
    const ndukwe = state.loanedOut.find(
      (loan) => loan.player.id === 'ifeanyi-ndukwe',
    )?.player;
    expect(ndukwe?.quality).toBe(65);
    expect(ndukwe?.baseValue).toBe(20);
    expect(ndukwe?.contract).toEqual({ expiryYear: 2029, salary: 0.78 });
    expect(ndukwe?.priorSigning).toBeUndefined();
  });
});

describe('Brughmans', () => {
  const brughmans = state.loanedOut.find(
    (loan) => loan.player.id === 'lucca-brughmans-39626',
  )?.player;

  it('carries_his_liverpool_terms', () => {
    expect(brughmans?.position).toBe('GK');
    expect(brughmans?.baseValue).toBe(35);
    expect(brughmans?.contract.expiryYear).toBe(2032);
    expect(brughmans?.priorSigning).toEqual({ fee: 35, contractYears: 6 });
  });

  it('is_on_the_same_wage_as_mamardashvili', () => {
    const mamardashvili = state.squad.find(
      (p) => p.id === 'giorgi-mamardashvili-36798',
    );
    expect(brughmans?.contract.salary).toBe(mamardashvili?.contract.salary);
  });

  it('adds_his_wage_and_seven_a_year_amortisation_from_summer_2027', () => {
    const summer = summer2027();
    // Compare against the same Summer 2027 without him: the difference is
    // exactly his wage plus EUR 35m over five years.
    const without = { ...summer, squad: summer.squad.filter((p) => p.id !== brughmans?.id) };
    const withHim = computeSquadCost(summer);
    const withoutHim = computeSquadCost(without);
    expect(
      Math.round((withHim.signingAmortisation - withoutHim.signingAmortisation) * 10) / 10,
    ).toBe(7);
    expect(
      Math.round((withHim.wageBill - withoutHim.wageBill) * 10) / 10,
    ).toBe(brughmans?.contract.salary);
  });

  it('moves_no_money_at_any_point', () => {
    // The fee was paid before the game: funds are budgets plus the two
    // sales, untouched by his return.
    const before = applyAction(
      applyAction(state, { type: 'SELL', playerId: 'konstantinos-tsimikas-35197' }),
      { type: 'SELL', playerId: 'wataru-endo-34009' },
    );
    expect(summer2027().funds).toBe(
      Math.round((before.funds + (realConfig.windows[1]?.budget ?? 0)) * 10) / 10,
    );
  });
});

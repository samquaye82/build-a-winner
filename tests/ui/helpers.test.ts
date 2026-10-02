/**
 * Tests for the pure UI helpers: formatting, grouping, renewal options and
 * badge logic. These run in a plain node environment; React components are
 * intentionally thin wrappers over these functions and the engine.
 */
import { describe, expect, it } from 'vitest';
import {
  formatExpiry,
  formatMoney,
  formatSalary,
  groupByPosition,
  isExpiring,
  loanReturnLabel,
  playerBadges,
  renewalOptions,
  scoreComponentRows,
} from '../../src/ui/helpers';
import { makeSquadPlayer, testWindow, threeTestWindows } from '../engine/fixtures';
import {
  applyAction,
  createGame,
  scoreGame,
  type WindowConfig,
} from '../../src/engine';
import { makeTestConfig } from '../engine/fixtures';

const januaryWindow = threeTestWindows[0] as WindowConfig;

describe('formatting', () => {
  it('formats_money_with_one_decimal_only_when_needed', () => {
    expect(formatMoney(60)).toBe('€60m');
    expect(formatMoney(12.5)).toBe('€12.5m');
    expect(formatMoney(-20)).toBe('€-20m');
    expect(formatMoney(8.75)).toBe('€8.8m');
  });

  it('formats_salaries_and_expiries', () => {
    expect(formatSalary(8.5)).toBe('€8.5m/yr');
    expect(formatExpiry(2028)).toBe('expires 06/2028');
  });
});

describe('groupByPosition', () => {
  it('groups_in_display_order_and_omits_empty_groups', () => {
    const grouped = groupByPosition(createGame(makeTestConfig()).squad);
    expect(grouped.map(([position]) => position)).toEqual([
      'GK', 'RB', 'LB', 'CB', 'CM', 'AM', 'RW', 'LW', 'ST',
    ]);
    const gks = grouped[0]?.[1] ?? [];
    expect(gks.map((p) => p.id)).toEqual(['gk1', 'gk2', 'gk3']);
  });
});

describe('renewalOptions', () => {
  it('prices_every_legal_extension_year', () => {
    const player = { ...makeSquadPlayer({ id: 'p', quality: 80, contract: { expiryYear: 2027, salary: 8 } }), saleValue: 0 };
    const options = renewalOptions(player, testWindow);
    expect(options.map((o) => o.newExpiryYear)).toEqual([2028, 2029, 2030, 2031]);
    // Matches the engine's pricing (see actions.test): 2030 costs 11.7.
    expect(options.find((o) => o.newExpiryYear === 2030)?.contract.salary).toBe(11.7);
  });

  it('offers_nothing_to_an_already_renewed_player', () => {
    const player = {
      ...makeSquadPlayer({ id: 'p' }),
      saleValue: 0,
      renewal: { previousContract: { expiryYear: 2028, salary: 4 }, windowIndex: 0 },
    };
    expect(renewalOptions(player, testWindow)).toEqual([]);
  });
});

describe('badges', () => {
  it('flags_u21_over_homegrown_and_expiring_contracts', () => {
    const u21 = { ...makeSquadPlayer({ id: 'a', age: 19, homegrown: true }), saleValue: 0 };
    expect(playerBadges(u21, testWindow).map((b) => b.kind)).toEqual(['u21']);

    const hgExpiring = {
      ...makeSquadPlayer({ id: 'b', homegrown: true, contract: { expiryYear: 2027, salary: 4 } }),
      saleValue: 0,
    };
    expect(playerBadges(hgExpiring, testWindow).map((b) => b.kind)).toEqual([
      'hg',
      'expiring',
    ]);
  });

  it('flags_a_loanee_last_in_the_badge_row', () => {
    const loanee = {
      ...makeSquadPlayer({
        id: 'd',
        homegrown: true,
        contract: { expiryYear: 2027, salary: 4 },
      }),
      onLoan: true,
      saleValue: 0,
    };
    const badges = playerBadges(loanee, testWindow);
    expect(badges.map((b) => b.kind)).toEqual(['hg', 'expiring', 'loan']);
    expect(badges.at(-1)?.label).toBe('On loan');
  });

  it('marks_each_list_a_player_is_off_before_the_loan_badge', () => {
    const player = {
      ...makeSquadPlayer({ id: 'f' }),
      saleValue: 0,
      onLoan: true,
      deregisteredFrom: ['UCL', 'PL'] as const,
    };
    const badges = playerBadges(player, testWindow);
    expect(badges.map((b) => b.kind)).toEqual(['off-pl', 'off-ucl', 'loan']);
    expect(badges.map((b) => b.label)).toEqual(['Off PL', 'Off UCL', 'On loan']);
  });

  it('leaves_an_owned_player_unbadged_as_a_loanee', () => {
    const owned = { ...makeSquadPlayer({ id: 'e' }), saleValue: 0 };
    expect(playerBadges(owned, testWindow).map((b) => b.kind)).not.toContain(
      'loan',
    );
  });

  it('treats_18_months_as_not_expiring_but_12_as_expiring', () => {
    const player = {
      ...makeSquadPlayer({ id: 'c', contract: { expiryYear: 2028, salary: 4 } }),
      saleValue: 0,
    };
    // Summer 2026: 24 months left. January 2027: 18 months. Neither warns.
    expect(isExpiring(player, testWindow)).toBe(false);
    expect(isExpiring(player, januaryWindow)).toBe(false);

    const nearer = {
      ...makeSquadPlayer({ id: 'd', contract: { expiryYear: 2027, salary: 4 } }),
      saleValue: 0,
    };
    expect(isExpiring(nearer, testWindow)).toBe(true);
  });
});

describe('weekly wages', () => {
  it('formats_weekly_first_with_annual_in_brackets', async () => {
    const { formatWage, formatWeeklyWage } = await import('../../src/ui/helpers');
    // 8.5m/yr is 163,461 a week.
    expect(formatWeeklyWage(8.5)).toBe('€163k/wk');
    expect(formatWage(8.5)).toBe('€163k/wk (€8.5m/yr)');
    // Superstar territory: 60m/yr is 1.15m a week.
    expect(formatWeeklyWage(60)).toBe('€1.2m/wk');
    expect(formatWeeklyWage(0.2)).toBe('€4k/wk');
  });
});

describe('verdict', () => {
  it('maps_squad_quality_to_the_right_tier_including_the_72_boundary', async () => {
    const { verdict } = await import('../../src/ui/helpers');
    expect(verdict(88)).toMatch(/dynasty/);
    expect(verdict(87)).toMatch(/favourites to win/);
    expect(verdict(83)).toMatch(/favourites to win/);
    expect(verdict(82)).toMatch(/puncher/);
    expect(verdict(80)).toMatch(/puncher/);
    expect(verdict(79)).toMatch(/top four/);
    expect(verdict(76)).toMatch(/top four/);
    expect(verdict(75)).toMatch(/Europa League/);
    // 72 is the lowest non-failing tier; 71 falls to failed.
    expect(verdict(72)).toMatch(/Europa League/);
    expect(verdict(71)).toMatch(/failed/);
    expect(verdict(0)).toMatch(/failed/);
  });
});

describe('scoreComponentRows', () => {
  /** The single-window fixture XI (see tests/engine/scoring.test.ts). */
  const pick = {
    type: 'PICK_XI',
    selection: {
      formationId: '4-2-3-1',
      playerIds: [
        'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
        'cm1', 'cm2', 'rw1', 'am1', 'lw1', 'st1',
      ],
    },
  } as const;

  it('labels_value_created_plainly_without_a_penalty', () => {
    const state = applyAction(createGame(makeTestConfig()), pick);
    const rows = scoreComponentRows(scoreGame(state));
    expect(rows.at(-1)?.label).toBe('Value created');
  });

  it('names_a_deregistration_penalty_in_the_value_created_label', () => {
    const state = [
      { type: 'DEREGISTER', playerId: 'gk2', competition: 'UCL' } as const,
      pick,
    ].reduce(applyAction, createGame(makeTestConfig()));
    const rows = scoreComponentRows(scoreGame(state));
    expect(rows.at(-1)?.label).toBe('Value created (−10 for 1 deregistered)');
    expect(rows.at(-1)?.score).toBe(39.7);
  });
});

describe('loanReturnLabel', () => {
  it('names_the_return_window_when_it_is_in_the_game', () => {
    expect(loanReturnLabel(threeTestWindows, { returnsInWindow: 1 })).toBe(
      'Summer 2027',
    );
  });

  it('names_the_summer_after_the_game_when_the_loan_outlasts_it', () => {
    // The last window sits in 2027/28, so the loan ends in Summer 2028.
    expect(loanReturnLabel(threeTestWindows, { returnsInWindow: 3 })).toBe(
      'Summer 2028',
    );
  });
});

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
  playerBadges,
  renewalOptions,
} from '../../src/ui/helpers';
import { makeSquadPlayer, testWindow, threeTestWindows } from '../engine/fixtures';
import { createGame, type WindowConfig } from '../../src/engine';
import { makeTestConfig } from '../engine/fixtures';

const january27 = threeTestWindows[1] as WindowConfig;

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
    expect(gks.map((p) => p.id)).toEqual(['gk1', 'gk2']);
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

  it('treats_18_months_as_not_expiring_but_12_as_expiring', () => {
    const player = {
      ...makeSquadPlayer({ id: 'c', contract: { expiryYear: 2028, salary: 4 } }),
      saleValue: 0,
    };
    // Summer 2026: 24 months left. January 2027: 18 months. Neither warns.
    expect(isExpiring(player, testWindow)).toBe(false);
    expect(isExpiring(player, january27)).toBe(false);

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
  it('maps_ratings_to_the_right_tier_including_the_70_boundary', async () => {
    const { verdict } = await import('../../src/ui/helpers');
    expect(verdict(95)).toMatch(/dynasty/);
    expect(verdict(90)).toMatch(/favourites to win/);
    expect(verdict(83)).toMatch(/puncher/);
    expect(verdict(78)).toMatch(/top four/);
    expect(verdict(73)).toMatch(/Europa League/);
    // 71 is the lowest non-failing tier; 70 falls to failed.
    expect(verdict(71)).toMatch(/Europa League/);
    expect(verdict(70)).toMatch(/failed/);
    expect(verdict(0)).toMatch(/failed/);
  });
});

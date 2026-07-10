/**
 * Tests for the month-aware contract discount curve.
 *
 * Anchors set by Sam (10/07/2026): x0.9 at 24 months, x0.75 at 18, x0.5 at
 * 12. The 30- and 6-month rungs continue the same line and only arise in
 * January windows.
 */
import { describe, expect, it } from 'vitest';
import {
  computeSaleValue,
  contractDiscount,
  remainingMonths,
  type WindowConfig,
} from '../../src/engine';
import { threeTestWindows } from './fixtures';

const summer26 = threeTestWindows[0] as WindowConfig;
const january27 = threeTestWindows[1] as WindowConfig;

describe('remainingMonths', () => {
  it('counts_whole_years_from_a_summer_window', () => {
    expect(remainingMonths(2027, summer26)).toBe(12);
    expect(remainingMonths(2029, summer26)).toBe(36);
  });

  it('subtracts_six_months_in_a_january_window', () => {
    expect(remainingMonths(2027, january27)).toBe(6);
    expect(remainingMonths(2028, january27)).toBe(18);
    expect(remainingMonths(2029, january27)).toBe(30);
  });

  it('never_goes_negative', () => {
    expect(remainingMonths(2026, january27)).toBe(0);
  });
});

describe('contractDiscount', () => {
  it('applies_the_agreed_curve', () => {
    expect(contractDiscount(36)).toBe(1);
    expect(contractDiscount(30)).toBe(0.95);
    expect(contractDiscount(24)).toBe(0.9);
    expect(contractDiscount(18)).toBe(0.75);
    expect(contractDiscount(12)).toBe(0.5);
    expect(contractDiscount(6)).toBe(0.25);
  });

  it('does_not_discount_long_deals', () => {
    expect(contractDiscount(48)).toBe(1);
    expect(contractDiscount(60)).toBe(1);
  });
});

describe('computeSaleValue', () => {
  it('discounts_a_final_year_player_hard', () => {
    // 40m player, 12 months left in Summer 2026: half price.
    expect(computeSaleValue(40, 2027, summer26)).toBe(20);
  });

  it('discounts_an_18_month_contract_in_january', () => {
    expect(computeSaleValue(40, 2028, january27)).toBe(30);
  });

  it('rounds_to_one_decimal_place', () => {
    // 35 x 0.25 = 8.75 -> 8.8.
    expect(computeSaleValue(35, 2027, january27)).toBe(8.8);
  });
});

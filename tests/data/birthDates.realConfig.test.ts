/**
 * Tests that every real player carries a birth date and that the game's
 * ages follow from it (Sam, 03/10/2026).
 */
import { describe, expect, it } from 'vitest';
import { ageOn, createGame, windowDate } from '../../src/engine';
import { ESTIMATED_BIRTH_DATES, realConfig } from '../../src/data/realConfig';

const state = createGame(realConfig);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('birth dates in the real data', () => {
  it('gives_every_squad_academy_and_loaned_out_player_a_real_one', () => {
    const players = [
      ...state.squad,
      ...state.academy,
      ...state.loanedOut.map((loan) => loan.player),
    ];
    for (const player of players) {
      expect(player.birthDate, player.name).toMatch(ISO_DATE);
      expect(ESTIMATED_BIRTH_DATES.has(player.id), player.name).toBe(false);
    }
  });

  it('gives_every_market_listing_one_estimating_only_the_missing', () => {
    for (const pool of realConfig.marketByWindow) {
      for (const listing of pool) {
        expect(listing.birthDate, listing.name).toMatch(ISO_DATE);
      }
    }
    // 720 market players have no trusted date; estimates are 1 July.
    expect(ESTIMATED_BIRTH_DATES.size).toBe(720);
    const estimated = (realConfig.marketByWindow[0] ?? []).filter((p) =>
      ESTIMATED_BIRTH_DATES.has(p.id),
    );
    expect(estimated.every((p) => p.birthDate?.endsWith('-07-01'))).toBe(true);
  });

  it('reads_the_academy_file_day_first', () => {
    // Listed as 01/09/2007: 1 September, not 9 January.
    const academy = state.academy.find((p) => p.id === 'bailey-hall');
    expect(academy?.birthDate).toBe('2007-09-01');
  });
});

describe('ages from birth dates', () => {
  it('gives_each_market_listing_his_age_on_that_windows_date', () => {
    realConfig.windows.forEach((window, index) => {
      for (const listing of (realConfig.marketByWindow[index] ?? []).slice(0, 200)) {
        expect(listing.age, listing.name).toBe(
          ageOn(listing.birthDate!, windowDate(window)),
        );
      }
    });
  });

  it('makes_mbappe_28_in_january_2027', () => {
    // Born 20/12/1998; the data's whole-year age said 27.
    const mbappe = realConfig.marketByWindow[0]?.find((p) => p.name === 'Kylian Mbappé');
    expect(mbappe?.age).toBe(28);
  });

  it('keeps_an_estimated_players_old_ageing_rule', () => {
    // A 1 July birthday: his recorded age in January, a year more from
    // Summer 2027.
    const [january, summer] = realConfig.marketByWindow;
    const id = [...ESTIMATED_BIRTH_DATES][0]!;
    const inJanuary = january?.find((p) => p.id === id);
    const inSummer = summer?.find((p) => p.id === id);
    if (inJanuary !== undefined && inSummer !== undefined) {
      expect(inSummer.age).toBe(inJanuary.age + 1);
    }
  });
});

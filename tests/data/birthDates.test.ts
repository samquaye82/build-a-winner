/**
 * Tests for the dates of birth carried alongside the generated data.
 *
 * They exist so the age profile chart can show exact ages; review.csv
 * carries whole years only. Coverage is partial by nature, so these guard
 * the shape and the join rather than demanding every player have one.
 */
import { describe, expect, it } from 'vitest';
import gameData from '../../src/data/generated/gameData.json';

describe('birthDates', () => {
  const births: Record<string, string> = gameData.birthDates;

  it('covers most of the dataset', () => {
    const total = gameData.market.length + gameData.squad.length;
    expect(Object.keys(births).length).toBeGreaterThan(total * 0.75);
  });

  it('holds plain YYYY-MM-DD dates only', () => {
    for (const [id, date] of Object.entries(births)) {
      expect(date, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('parses to a real date for every entry', () => {
    for (const [id, date] of Object.entries(births)) {
      expect(Number.isNaN(Date.parse(date)), id).toBe(false);
    }
  });

  it('agrees with the whole-year age the dataset already carries', () => {
    // The two come from different columns of the same source, so a
    // disagreement of more than a year means the join has crossed players.
    const reference = Date.parse(`${gameData.generatedAt}T00:00:00Z`);
    const players = [...gameData.squad, ...gameData.market];
    const wrong: string[] = [];
    for (const player of players) {
      const date = births[player.id];
      if (date === undefined) {
        continue;
      }
      const years = (reference - Date.parse(`${date}T00:00:00Z`)) / 31_557_600_000;
      if (Math.abs(years - player.age) > 1.5) {
        wrong.push(`${player.name}: age ${String(player.age)}, born ${date}`);
      }
    }
    expect(wrong.slice(0, 10)).toEqual([]);
  });

  it('has one for every Arsenal player, the chart’s reference club', () => {
    const arsenal = gameData.market.filter((p) => p.club === 'Arsenal');
    const missing = arsenal.filter((p) => births[p.id] === undefined);
    expect(missing.map((p) => p.name)).toEqual([]);
  });
});

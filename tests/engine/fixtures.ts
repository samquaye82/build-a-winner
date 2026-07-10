/**
 * Fictional fixture data for engine tests.
 *
 * Deliberately not real players: tests must keep working unchanged when the
 * real database arrives in M6. The fixture squad is small but covers every
 * rule-relevant case: locked, home-grown, U21, and expiring contracts.
 */
import type {
  GameConfig,
  MarketPlayer,
  SquadPlayer,
  WindowConfig,
} from '../../src/engine';

/** A single test window: Summer 2026, EUR 100m budget. */
export const testWindow: WindowConfig = {
  id: 'summer-2026',
  label: 'Summer 2026',
  seasonStartYear: 2026,
  budget: 100,
};

/**
 * Builds a squad player with sensible defaults, overridable per test.
 *
 * @param overrides - Fields to override on the default squad player.
 * @returns A complete squad player.
 */
export function makeSquadPlayer(
  overrides: Partial<SquadPlayer> & Pick<SquadPlayer, 'id'>,
): SquadPlayer {
  return {
    name: `Player ${overrides.id}`,
    position: 'CM',
    age: 26,
    homegrown: false,
    quality: 70,
    saleValue: 20,
    locked: false,
    contract: { expiryYear: 2029, salary: 5 },
    ...overrides,
  };
}

/**
 * Builds a market player with sensible defaults, overridable per test.
 *
 * @param overrides - Fields to override on the default market player.
 * @returns A complete market player.
 */
export function makeMarketPlayer(
  overrides: Partial<MarketPlayer> & Pick<MarketPlayer, 'id'>,
): MarketPlayer {
  return {
    name: `Target ${overrides.id}`,
    position: 'ST',
    age: 24,
    homegrown: false,
    quality: 75,
    fee: 40,
    wageDemand: 6,
    contractYears: 5,
    ...overrides,
  };
}

/**
 * Standard fixture squad, 12 players:
 * - gk1 (GK, HG), gk2 (GK)
 * - cb1 (locked star), cb2 (expiring 2027), rb1 (HG), lb1
 * - cm1 (HG, expiring 2027), cm2, am1 (U21 age 19, HG)
 * - rw1, lw1 (U21 age 20), st1 (locked)
 */
export function makeTestSquad(): SquadPlayer[] {
  return [
    makeSquadPlayer({ id: 'gk1', position: 'GK', homegrown: true, saleValue: 15 }),
    makeSquadPlayer({ id: 'gk2', position: 'GK', age: 31, saleValue: 3 }),
    makeSquadPlayer({ id: 'cb1', position: 'CB', quality: 90, locked: true, saleValue: 70 }),
    makeSquadPlayer({ id: 'cb2', position: 'CB', contract: { expiryYear: 2027, salary: 4 }, saleValue: 12 }),
    makeSquadPlayer({ id: 'rb1', position: 'RB', homegrown: true, saleValue: 25 }),
    makeSquadPlayer({ id: 'lb1', position: 'LB', saleValue: 18 }),
    makeSquadPlayer({ id: 'cm1', position: 'CM', homegrown: true, quality: 80, contract: { expiryYear: 2027, salary: 8 }, saleValue: 35 }),
    makeSquadPlayer({ id: 'cm2', position: 'CM', saleValue: 22 }),
    makeSquadPlayer({ id: 'am1', position: 'AM', age: 19, homegrown: true, quality: 78, saleValue: 30 }),
    makeSquadPlayer({ id: 'rw1', position: 'RW', quality: 84, saleValue: 55 }),
    makeSquadPlayer({ id: 'lw1', position: 'LW', age: 20, saleValue: 28 }),
    makeSquadPlayer({ id: 'st1', position: 'ST', quality: 88, locked: true, saleValue: 85 }),
  ];
}

/** Standard fixture market, 4 targets. */
export function makeTestMarket(): MarketPlayer[] {
  return [
    makeMarketPlayer({ id: 'buy-st', position: 'ST', fee: 60, wageDemand: 9, quality: 86 }),
    makeMarketPlayer({ id: 'buy-cb', position: 'CB', fee: 35, wageDemand: 5, quality: 79 }),
    makeMarketPlayer({ id: 'buy-hg', position: 'CM', fee: 25, wageDemand: 4, homegrown: true, quality: 74 }),
    makeMarketPlayer({ id: 'buy-u21', position: 'RW', fee: 20, wageDemand: 2.5, age: 18, quality: 72, contractYears: 4 }),
  ];
}

/**
 * Builds a complete single-window game config from the standard fixtures.
 *
 * @returns A config using the test window, squad and market.
 */
export function makeTestConfig(): GameConfig {
  return {
    windows: [testWindow],
    initialSquad: makeTestSquad(),
    marketByWindow: [makeTestMarket()],
  };
}

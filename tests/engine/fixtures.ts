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
  SquadPlayerSeed,
  WindowConfig,
} from '../../src/engine';

/** A single test window: Summer 2026, EUR 100m budget. */
export const testWindow: WindowConfig = {
  id: 'summer-2026',
  label: 'Summer 2026',
  seasonStartYear: 2026,
  midSeason: false,
  budget: 100,
};

/** The three real windows of a full playthrough, with test budgets. */
export const threeTestWindows: readonly WindowConfig[] = [
  testWindow,
  { id: 'january-2027', label: 'January 2027', seasonStartYear: 2026, midSeason: true, budget: 30 },
  { id: 'summer-2027', label: 'Summer 2027', seasonStartYear: 2027, midSeason: false, budget: 80 },
];

/**
 * Builds a squad player seed with sensible defaults, overridable per test.
 *
 * @param overrides - Fields to override on the default seed.
 * @returns A complete squad player seed.
 */
export function makeSquadPlayer(
  overrides: Partial<SquadPlayerSeed> & Pick<SquadPlayerSeed, 'id'>,
): SquadPlayerSeed {
  return {
    name: `Player ${overrides.id}`,
    position: 'CM',
    age: 26,
    homegrown: false,
    quality: 70,
    baseValue: 20,
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
 * - gk1 (GK, HG), gk2 (GK, 31)
 * - cb1 (locked star), cb2 (expiring 2027), rb1 (HG), lb1
 * - cm1 (HG, quality 80, expiring 2027), cm2, am1 (U21 age 19, HG)
 * - rw1, lw1 (U21 age 20), st1 (locked)
 *
 * Total wage bill 62. Sale values derive from baseValue: unity discount
 * everywhere except the two 2027 expiries, 12 months out at Summer 2026
 * (cb2 6, cm1 17.5).
 */
export function makeTestSquad(): SquadPlayerSeed[] {
  return [
    makeSquadPlayer({ id: 'gk1', position: 'GK', homegrown: true, baseValue: 15 }),
    makeSquadPlayer({ id: 'gk2', position: 'GK', age: 31, baseValue: 3 }),
    makeSquadPlayer({ id: 'cb1', position: 'CB', quality: 90, locked: true, baseValue: 70 }),
    makeSquadPlayer({ id: 'cb2', position: 'CB', contract: { expiryYear: 2027, salary: 4 }, baseValue: 12 }),
    makeSquadPlayer({ id: 'rb1', position: 'RB', homegrown: true, baseValue: 25 }),
    makeSquadPlayer({ id: 'lb1', position: 'LB', baseValue: 18 }),
    makeSquadPlayer({ id: 'cm1', position: 'CM', homegrown: true, quality: 80, contract: { expiryYear: 2027, salary: 8 }, baseValue: 35 }),
    makeSquadPlayer({ id: 'cm2', position: 'CM', baseValue: 22 }),
    makeSquadPlayer({ id: 'am1', position: 'AM', age: 19, homegrown: true, quality: 78, baseValue: 30 }),
    makeSquadPlayer({ id: 'rw1', position: 'RW', quality: 84, baseValue: 55 }),
    makeSquadPlayer({ id: 'lw1', position: 'LW', age: 20, baseValue: 28 }),
    makeSquadPlayer({ id: 'st1', position: 'ST', quality: 88, locked: true, baseValue: 85 }),
  ];
}

/** Standard fixture market for Summer 2026, 4 targets. */
export function makeTestMarket(): MarketPlayer[] {
  return [
    makeMarketPlayer({ id: 'buy-st', position: 'ST', fee: 60, wageDemand: 9, quality: 86 }),
    makeMarketPlayer({ id: 'buy-cb', position: 'CB', fee: 35, wageDemand: 5, quality: 79 }),
    makeMarketPlayer({ id: 'buy-hg', position: 'CM', fee: 25, wageDemand: 4, homegrown: true, quality: 74 }),
    makeMarketPlayer({ id: 'buy-u21', position: 'RW', fee: 20, wageDemand: 2.5, age: 18, quality: 72, contractYears: 4 }),
  ];
}

/**
 * January 2027 fixture market. Deliberately re-lists buy-st (to prove the
 * engine filters players already at the club) alongside a fresh target.
 */
export function makeJanuaryMarket(): MarketPlayer[] {
  return [
    makeMarketPlayer({ id: 'buy-st', position: 'ST', fee: 63, wageDemand: 9, quality: 86 }),
    makeMarketPlayer({ id: 'jan-cm', position: 'CM', fee: 45, wageDemand: 7, quality: 81 }),
  ];
}

/** Summer 2027 fixture market. */
export function makeSummer27Market(): MarketPlayer[] {
  return [
    makeMarketPlayer({ id: 'buy-cb', position: 'CB', fee: 38, wageDemand: 5.5, quality: 79, age: 25 }),
    makeMarketPlayer({ id: 's27-lw', position: 'LW', fee: 70, wageDemand: 8, quality: 84, age: 22 }),
  ];
}

/**
 * Builds a complete single-window game config from the standard fixtures.
 *
 * The SCR settings give the fixture squad a starting cost of 122 (wages 62
 * + baseline 60) against a cap of 170 (200 x 0.85): comfortable, so tests
 * not aimed at the SCR never trip it.
 *
 * @returns A config using the test window, squad and market.
 */
export function makeTestConfig(): GameConfig {
  return {
    windows: [testWindow],
    initialSquad: makeTestSquad(),
    marketByWindow: [makeTestMarket()],
    baselineAmortisation: 60,
    squadCostCapBase: 200,
  };
}

/**
 * Builds a full three-window config from the standard fixtures.
 *
 * @returns A config spanning Summer 2026, January 2027 and Summer 2027.
 */
export function makeThreeWindowConfig(): GameConfig {
  return {
    ...makeTestConfig(),
    windows: threeTestWindows,
    marketByWindow: [makeTestMarket(), makeJanuaryMarket(), makeSummer27Market()],
  };
}

/**
 * The real game configuration: Liverpool, Summer 2026 to Summer 2027.
 *
 * Adapts src/data/generated/gameData.json (produced by npm run
 * generate:data from the scraped dataset) into the engine's GameConfig,
 * applying the hand-editable locked lists at build time so edits to
 * lockedLists.ts take effect on refresh without regeneration.
 *
 * Money constants (provisional, tuned with Sam):
 * - Budgets 250 / 0 / 250: one EUR 250m pot per fiscal year; January
 *   spends only what Summer left over (engine rollover handles this).
 * - SCR: baseline amortisation EUR 140m/yr (the pre-game transfer book),
 *   cap basis EUR 480m, so squad cost starts around two-thirds of the
 *   85% cap and two marquee signings bring genuine squeeze.
 */
import type {
  GameConfig,
  MarketPlayer,
  Position,
  SquadPlayerSeed,
  WindowConfig,
} from '../engine';
import {
  LIVERPOOL_LOCKED,
  MARKET_LOCKED_EXTRA,
  MARKET_UNLOCKED_EXCEPTIONS,
  MARKET_UNTOUCHABLE_MIN_VALUE_M,
} from './lockedLists';
import gameData from './generated/gameData.json';

/** Shape of one generated market entry (see scripts/generate-data.ts). */
interface GeneratedMarketPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  homegrown: boolean;
  quality: number;
  club: string;
  league: string;
  windows: { fee: number; wage: number; years: number; freeAgent?: boolean }[];
}

interface GeneratedSquadPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  homegrown: boolean;
  quality: number;
  baseValue: number;
  contract: { expiryYear: number; salary: number };
}

const BASELINE_AMORTISATION = 140;
const SQUAD_COST_CAP_BASE = 480;
const BUDGETS: readonly number[] = [250, 0, 250];

const windows: WindowConfig[] = (
  gameData.windows as (WindowConfig & { budget: number })[]
).map((window, index) => ({
  id: window.id,
  label: window.label,
  seasonStartYear: window.seasonStartYear,
  midSeason: window.midSeason,
  budget: BUDGETS[index] ?? 0,
}));

const initialSquad: SquadPlayerSeed[] = (
  gameData.squad as GeneratedSquadPlayer[]
).map((player) => ({
  id: player.id,
  name: player.name,
  position: player.position as Position,
  age: player.age,
  homegrown: player.homegrown,
  quality: player.quality,
  baseValue: player.baseValue,
  locked: LIVERPOOL_LOCKED.includes(player.id),
  contract: player.contract,
}));

/** Whether a market player's club refuses to sell (see lockedLists.ts). */
function isUntouchable(player: GeneratedMarketPlayer): boolean {
  if (MARKET_UNLOCKED_EXCEPTIONS.includes(player.id)) {
    return false;
  }
  if (MARKET_LOCKED_EXTRA.includes(player.id)) {
    return true;
  }
  const window0 = player.windows[0];
  return (
    window0 !== undefined && window0.fee >= MARKET_UNTOUCHABLE_MIN_VALUE_M
  );
}

const generatedMarket = gameData.market as GeneratedMarketPlayer[];

const marketByWindow: MarketPlayer[][] = [0, 1, 2].map((windowIndex) =>
  generatedMarket.flatMap((player) => {
    const terms = player.windows[windowIndex];
    if (terms === undefined) {
      return [];
    }
    return [
      {
        id: player.id,
        name: player.name,
        position: player.position as Position,
        // Ages tick at the season boundary into Summer 2027.
        age: windowIndex === 2 ? player.age + 1 : player.age,
        homegrown: player.homegrown,
        quality: player.quality,
        fee: terms.fee,
        wageDemand: terms.wage,
        contractYears: terms.years,
        locked: isUntouchable(player),
        club: player.club,
        league: player.league,
      },
    ];
  }),
);

/** The production game configuration. */
export const realConfig: GameConfig = {
  windows,
  initialSquad,
  marketByWindow,
  baselineAmortisation: BASELINE_AMORTISATION,
  squadCostCapBase: SQUAD_COST_CAP_BASE,
};

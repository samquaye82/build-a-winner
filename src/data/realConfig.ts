/**
 * The real game configuration: Liverpool, Summer 2026 to Summer 2027.
 *
 * Adapts src/data/generated/gameData.json (produced by npm run
 * generate:data from the scraped dataset) into the engine's GameConfig,
 * applying the hand-editable locked lists at build time so edits to
 * lockedLists.ts take effect on refresh without regeneration.
 *
 * Money constants (Sam, 11/07/2026):
 * - Budgets 250 / 0 / 250: one EUR 250m pot per fiscal year; January
 *   spends only what Summer left over (engine rollover handles this).
 * - SCR: 70% of season revenue. Revenues 850 (25/26, the opening
 *   position), 875 (26/27) and 900 (27/28): the cap grows with the club.
 * - Baseline EUR 340m/yr: historic amortisation PLUS the SCR components
 *   the game does not itemise (bonuses, coaching staff, agent fees; our
 *   scraped wages are fixed player salaries only). Calibrated so the
 *   opening SCR sits around 64%, up from the real 60% of 24/25 after the
 *   Isak/Wirtz/Ekitike spree, partly offset by big frees departing.
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
  MARKET_LOCKED_CLUBS,
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
  windows: { fee: number; wage: number; years: number; baseValue?: number; freeAgent?: boolean }[];
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

const BASELINE_AMORTISATION = 340;
const BUDGETS: readonly number[] = [250, 0, 250];
/** Season revenues (EUR m): 25/26 opening basis, then 26/27 and 27/28. */
const REVENUES: readonly number[] = [850, 875, 900];

const windows: WindowConfig[] = (gameData.windows as WindowConfig[]).map(
  (window, index) => ({
    id: window.id,
    label: window.label,
    seasonStartYear: window.seasonStartYear,
    midSeason: window.midSeason,
    budget: BUDGETS[index] ?? 0,
    squadCostCapBase: REVENUES[index] ?? 0,
  }),
);

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

/** Whether a list entry names this player (by slug or display name). */
function listed(list: readonly string[], player: GeneratedMarketPlayer): boolean {
  return list.includes(player.id) || list.includes(player.name);
}

/**
 * Whether a market player's club refuses to sell. Precedence documented
 * in lockedLists.ts: exceptions, then named locks, then rival clubs, then
 * the value threshold.
 */
function isUntouchable(player: GeneratedMarketPlayer): boolean {
  if (listed(MARKET_UNLOCKED_EXCEPTIONS, player)) {
    return false;
  }
  if (listed(MARKET_LOCKED_EXTRA, player)) {
    return true;
  }
  if (MARKET_LOCKED_CLUBS.includes(player.club)) {
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
        baseValue: terms.baseValue,
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
};

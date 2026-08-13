/**
 * The real game configuration: Liverpool, Summer 2026 to Summer 2027.
 *
 * Adapts src/data/generated/gameData.json (produced by npm run
 * generate:data from the scraped dataset) into the engine's GameConfig,
 * applying the hand-editable locked lists at build time so edits to
 * lockedLists.ts take effect on refresh without regeneration.
 *
 * Money constants (Sam, 11/07/2026):
 * - Budgets 200 / 0 / 200: Summer 2026 opens with EUR 200m; January
 *   spends only what Summer left over; Summer 2027 adds a fresh EUR 200m
 *   pot (engine rollover handles the carry-forward).
 * - SCR: 70% of season revenue. Revenues 875 (25/26, the opening
 *   position), 875 (26/27) and 900 (27/28): the cap grows with the club.
 * - Baseline EUR 340m/yr: historic amortisation PLUS the SCR components
 *   the game does not itemise (bonuses, coaching staff, agent fees; our
 *   scraped wages are fixed player salaries only). Calibrated so the
 *   opening SCR sits around 64%, up from the real 60% of 24/25 after the
 *   Isak/Wirtz/Ekitike spree, partly offset by big frees departing.
 */
import type {
  AcademyPlayerSeed,
  GameConfig,
  MarketPlayer,
  Position,
  RivalTeam,
  SquadPlayerSeed,
  WindowConfig,
} from '../engine';
import {
  LIVERPOOL_LOCKED,
  LOANED_IN,
  MARKET_LOCKED_CLUBS,
  MARKET_LOCKED_EXTRA,
  MARKET_UNLOCKED_EXCEPTIONS,
  MARKET_UNTOUCHABLE_MIN_VALUE_M,
} from './lockedLists';
import gameData from './generated/gameData.json';
import academyData from './academy-players.json';

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

/** Shape of one entry in src/data/academy-players.json. */
interface AcademyDataPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  homegrown: boolean;
}

const BASELINE_AMORTISATION = 340;

/**
 * Fixed attributes every academy player carries until promoted (Sam,
 * 25/07/2026). Wage is an in-game weekly figure of EUR 15k, held as the
 * engine's annual EUR m unit (15,000 x 52 = EUR 0.78m/yr). See the
 * fixed_attributes note in academy-players.json.
 */
const ACADEMY_QUALITY = 65;
const ACADEMY_BASE_VALUE = 20;
const ACADEMY_SALARY_EUR_M = 0.78;
const ACADEMY_EXPIRY_YEAR = 2029;
const BUDGETS: readonly number[] = [200, 0, 200];
/** Season revenues (EUR m): 25/26 opening basis, then 26/27 and 27/28. */
const REVENUES: readonly number[] = [875, 875, 900];

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

/**
 * Whether a hand-edited list names a player, by slug or by display name.
 *
 * @param list - The list from lockedLists.ts.
 * @param id - The player's Capology slug.
 * @param name - The player's display name.
 * @returns True when either identifier appears in the list.
 */
function namedIn(list: readonly string[], id: string, name: string): boolean {
  return list.includes(id) || list.includes(name);
}

/** The season a 2026/27 loan runs to, as a contract expiry year. */
const LOAN_EXPIRY_YEAR = 2027;

const initialSquad: SquadPlayerSeed[] = (
  gameData.squad as GeneratedSquadPlayer[]
).map((player) => {
  const onLoan = namedIn(LOANED_IN, player.id, player.name);
  return {
    id: player.id,
    name: player.name,
    position: player.position as Position,
    age: player.age,
    homegrown: player.homegrown,
    quality: player.quality,
    baseValue: player.baseValue,
    locked: namedIn(LIVERPOOL_LOCKED, player.id, player.name),
    onLoan,
    // The dataset carries the loanee's contract with his PARENT club,
    // which runs years beyond the loan (Araujo's to 2031). Left alone it
    // would tell the player his squad is secure when the man leaves in
    // twelve months, and inflate contract health, which is a fifth of the
    // final rating. The loan's own end date is the honest figure.
    contract: onLoan
      ? { ...player.contract, expiryYear: LOAN_EXPIRY_YEAR }
      : player.contract,
  };
});

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

/**
 * The academy pool: promotable youngsters, all sharing the fixed attributes
 * above. Positions, ages and home-grown status are authored in
 * academy-players.json; everything else is applied here.
 */
const academy: AcademyPlayerSeed[] = (
  academyData.players as AcademyDataPlayer[]
).map((player) => ({
  id: player.id,
  name: player.name,
  position: player.position as Position,
  age: player.age,
  homegrown: player.homegrown,
  quality: ACADEMY_QUALITY,
  baseValue: ACADEMY_BASE_VALUE,
  contract: {
    expiryYear: ACADEMY_EXPIRY_YEAR,
    salary: ACADEMY_SALARY_EUR_M,
  },
}));

/**
 * Rival strengths, derived with the same full-squad methodology as Squad
 * quality (0.6 x a club's best XI + 0.4 x the rest of its squad), taken from
 * the Premier League players in the dataset. Computed rather than authored,
 * so the projected league stays consistent with the game world.
 */
const RIVAL_XI_WEIGHT = 0.65;
const RIVAL_DEPTH_WEIGHT = 0.35;

function rivalStrength(qualities: readonly number[]): number {
  const sorted = [...qualities].sort((a, b) => b - a);
  const xi = sorted.slice(0, 11);
  const rest = sorted.slice(11);
  const mean = (xs: readonly number[]): number =>
    xs.reduce((sum, q) => sum + q, 0) / xs.length;
  const depthAverage = rest.length > 0 ? mean(rest) : mean(xi);
  return (
    Math.round((RIVAL_XI_WEIGHT * mean(xi) + RIVAL_DEPTH_WEIGHT * depthAverage) * 10) /
    10
  );
}

const rivalQualities = new Map<string, number[]>();
for (const player of generatedMarket) {
  if (player.league !== 'premier-league') {
    continue;
  }
  const list = rivalQualities.get(player.club) ?? [];
  list.push(player.quality);
  rivalQualities.set(player.club, list);
}

const rivals: RivalTeam[] = [...rivalQualities.entries()]
  .map(([name, qualities]) => ({ name, strength: rivalStrength(qualities) }))
  .sort((a, b) => b.strength - a.strength);

/** The production game configuration. */
export const realConfig: GameConfig = {
  windows,
  initialSquad,
  marketByWindow,
  academy,
  rivals,
  baselineAmortisation: BASELINE_AMORTISATION,
};

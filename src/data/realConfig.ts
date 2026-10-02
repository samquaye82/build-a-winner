/**
 * The real game configuration: Liverpool, Summer 2026 to Summer 2027.
 *
 * Adapts src/data/generated/gameData.json (produced by npm run
 * generate:data from the scraped dataset) into the engine's GameConfig,
 * applying the hand-editable locked lists at build time so edits to
 * lockedLists.ts take effect on refresh without regeneration. The UEFA
 * registration data (uefaRegistration.ts) is applied the same way.
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
  LoanedOutSeed,
  MarketPlayer,
  Position,
  RivalTeam,
  SeasonPoint,
  SquadPlayerSeed,
  UefaTraining,
  WindowConfig,
} from '../engine';
import {
  LIVERPOOL_LOCKED_ALWAYS,
  LIVERPOOL_LOCKED_UNTIL_JANUARY,
  LOANED_IN,
  MARKET_LOCKED_CLUBS,
  MARKET_LOCKED_EXTRA,
  MARKET_UNLOCKED_EXCEPTIONS,
  MARKET_UNTOUCHABLE_MIN_VALUE_M,
} from './lockedLists';
import {
  LIVERPOOL_OUT_ON_LOAN,
  LOANED_OUT,
  type PriorSigningTerms,
} from './loansOut';
import {
  LIVERPOOL_UEFA_REGISTRATION,
  MARKET_CLUB_TRAINED,
} from './uefaRegistration';
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
/**
 * Per-window budgets (EUR m), agreed with Sam (29/09/2026): January 2027
 * opens with EUR 100m, Summer 2027 adds a full EUR 200m, and January 2028
 * adds nothing, spending only what the first two windows left over.
 */
const BUDGETS: readonly number[] = [100, 200, 0];
/**
 * Season revenues (EUR m), which set the squad cost cap. January 2027 is
 * the back half of 2026/27 and keeps that season's 875. Summer 2027 and
 * January 2028 are both 2027/28, so both take one 10% uplift on it
 * (Sam, 29/09/2026), not one uplift each: the cap is a season's, and two
 * windows of one season cannot sit under different caps.
 */
const REVENUE_UPLIFT = 1.1;
const REVENUE_2026_27 = 875;
const REVENUE_2027_28 = REVENUE_2026_27 * REVENUE_UPLIFT;
const REVENUES: readonly number[] = [
  REVENUE_2026_27,
  REVENUE_2027_28,
  REVENUE_2027_28,
];

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

/**
 * Window index from which the board will listen to offers.
 *
 * The protected spine used to be held through the opening summer and
 * released in January. The game now opens in January, so there is no
 * earlier window to hold them through: a player on the protect-until-
 * January list is sellable from the start, and only the always-locked list
 * still bites.
 */
const JANUARY_WINDOW_INDEX = 0;

/**
 * A Liverpool player's UEFA registration facts, looked up by slug or
 * display name in uefaRegistration.ts.
 *
 * @param id - The player's id.
 * @param name - The player's display name.
 * @returns The fields to spread into his seed. Empty when he has no entry,
 *   which leaves him untrained with no known spell, and so on List A; the
 *   data tests fail for any first-team or academy player left that way.
 */
function uefaFor(
  id: string,
  name: string,
): { uefaTraining?: UefaTraining; joined?: SeasonPoint } {
  const entry = LIVERPOOL_UEFA_REGISTRATION.find(
    (candidate) => candidate.player === id || candidate.player === name,
  );
  return entry === undefined
    ? {}
    : { uefaTraining: entry.training, joined: entry.joined };
}

const ownedSquad: SquadPlayerSeed[] = (
  gameData.squad as GeneratedSquadPlayer[]
).map((player) => {
  const lockedAlways = namedIn(LIVERPOOL_LOCKED_ALWAYS, player.id, player.name);
  const lockedUntilJanuary = namedIn(
    LIVERPOOL_LOCKED_UNTIL_JANUARY,
    player.id,
    player.name,
  );
  return {
    id: player.id,
    name: player.name,
    position: player.position as Position,
    age: player.age,
    homegrown: player.homegrown,
    quality: player.quality,
    baseValue: player.baseValue,
    locked: lockedAlways || lockedUntilJanuary,
    ...(lockedUntilJanuary
      ? { unlocksInWindow: JANUARY_WINDOW_INDEX }
      : {}),
    ...uefaFor(player.id, player.name),
    contract: player.contract,
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

/**
 * A market player's UEFA training status, from Liverpool's point of view.
 * Liverpool graduates elsewhere are listed; otherwise home-grown in the
 * Premier League sense means trained in England, so association-trained.
 *
 * @param player - A generated market entry.
 * @returns His training status were Liverpool to sign him.
 */
function marketTraining(player: GeneratedMarketPlayer): UefaTraining {
  if (listed(MARKET_CLUB_TRAINED, player)) {
    return 'club';
  }
  return player.homegrown ? 'association' : 'none';
}

const generatedMarket = gameData.market as GeneratedMarketPlayer[];

/** The window from which every 2026/27 loan has ended and the player is home. */
const LOAN_RETURN_WINDOW_INDEX = 1;

/**
 * Where each loaned-out player spends the 2026/27 season, by player id.
 *
 * Built once, and verified as it is built: an entry naming a player the
 * dataset does not hold, or naming an owner he does not belong to, or
 * sending him to a club the dataset does not model, is reported and
 * dropped. Applying it regardless would move the wrong player, or move him
 * somewhere the game cannot show.
 */
const loanDestinations = new Map<string, { club: string; league: string }>();
{
  const leagueByClub = new Map<string, string>();
  for (const player of generatedMarket) {
    leagueByClub.set(player.club, player.league);
  }

  for (const loan of LOANED_OUT) {
    const source = generatedMarket.find(
      (player) => player.id === loan.player || player.name === loan.player,
    );
    if (source === undefined) {
      console.warn(`Loaned-out player not found: ${loan.player}`);
      continue;
    }
    if (source.club !== loan.from) {
      console.warn(
        `Loaned-out player ${loan.player} is listed at ${source.club}, not ${loan.from}; skipped`,
      );
      continue;
    }
    const league = leagueByClub.get(loan.to);
    if (league === undefined) {
      console.warn(
        `Loaned-out player ${loan.player} sent to ${loan.to}, which the dataset does not hold; skipped`,
      );
      continue;
    }
    loanDestinations.set(source.id, { club: loan.to, league });
  }
}

/**
 * A squad seed for a player Liverpool signed before the game, built from
 * his market listing (which still shows his loan club) and the Liverpool
 * terms authored in loansOut.ts.
 *
 * @param listing - His generated market entry.
 * @param terms - His Liverpool contract and fee.
 * @returns His squad seed.
 */
function priorSigningSeed(
  listing: GeneratedMarketPlayer,
  terms: PriorSigningTerms,
): SquadPlayerSeed {
  return {
    id: listing.id,
    name: listing.name,
    position: listing.position as Position,
    age: listing.age,
    homegrown: listing.homegrown,
    quality: listing.quality,
    baseValue: terms.baseValue,
    locked: false,
    ...uefaFor(listing.id, listing.name),
    priorSigning: { fee: terms.fee, contractYears: terms.contractYears },
    contract: { expiryYear: terms.expiryYear, salary: terms.salary },
  };
}

/**
 * Liverpool players away on loan for 2026/27, rejoining the squad in
 * Summer 2027. Each is looked up in the first team, then the academy, then
 * the market, and verified as he is resolved (see LIVERPOOL_OUT_ON_LOAN).
 * Whoever is resolved here is then left out of the squad, the academy and
 * every market pool: he is Liverpool's, and away.
 */
const loanedOut: LoanedOutSeed[] = LIVERPOOL_OUT_ON_LOAN.flatMap((entry) => {
  const named = (player: { id: string; name: string }): boolean =>
    player.id === entry.player || player.name === entry.player;
  if (!generatedMarket.some((player) => player.club === entry.to)) {
    console.warn(
      `Liverpool loanee ${entry.player} sent to ${entry.to}, which the dataset does not hold; skipped`,
    );
    return [];
  }
  const loan = { club: entry.to, returnsInWindow: LOAN_RETURN_WINDOW_INDEX };

  const firstTeam = ownedSquad.find(named);
  if (firstTeam !== undefined) {
    return [{ ...loan, player: firstTeam }];
  }
  const youth = (academyData.players as AcademyDataPlayer[]).find(named);
  if (youth !== undefined) {
    return [{ ...loan, player: { ...academySeed(youth), locked: false } }];
  }
  const listing = generatedMarket.find(named);
  if (listing === undefined) {
    console.warn(`Liverpool loanee not found: ${entry.player}`);
    return [];
  }
  if (entry.signing === undefined) {
    console.warn(
      `Liverpool loanee ${entry.player} is listed at ${listing.club} with no Liverpool terms; skipped`,
    );
    return [];
  }
  return [{ ...loan, player: priorSigningSeed(listing, entry.signing) }];
});

/** Ids of everyone in `loanedOut`, to keep them out of every other pool. */
const awayIds = new Set(loanedOut.map((loan) => loan.player.id));

const marketByWindow: MarketPlayer[][] = [0, 1, 2].map((windowIndex) =>
  generatedMarket.flatMap((player) => {
    const terms = player.windows[windowIndex];
    if (terms === undefined || awayIds.has(player.id)) {
      return [];
    }
    // On loan for 2026/27, home again by summer 2027. Ownership is not
    // touched: `locked` is computed from the owning club above, so a
    // Manchester United player on loan elsewhere stays unavailable.
    const loan =
      windowIndex < LOAN_RETURN_WINDOW_INDEX
        ? loanDestinations.get(player.id)
        : undefined;
    return [
      {
        id: player.id,
        name: player.name,
        position: player.position as Position,
        // Ages tick at the one season boundary, which now falls between
        // January 2027 and Summer 2027, so both later windows are aged on.
        age: windowIndex >= 1 ? player.age + 1 : player.age,
        homegrown: player.homegrown,
        quality: player.quality,
        uefaTraining: marketTraining(player),
        fee: terms.fee,
        wageDemand: terms.wage,
        contractYears: terms.years,
        baseValue: terms.baseValue,
        locked: isUntouchable(player),
        club: loan?.club ?? player.club,
        league: loan?.league ?? player.league,
      },
    ];
  }),
);

/**
 * Players borrowed for 2026/27, lifted out of the market into the squad.
 *
 * They stay listed at their parent club in the dataset, which is what
 * makes the return work: the engine hides squad players from the market
 * while they are here, and when the loan expires they are already sitting
 * in the Summer 2027 pool at their owner's club, buyable for a fee. The
 * alternative, moving them to Liverpool in the data, stranded them: the
 * player left the squad and existed nowhere.
 *
 * Their contract carries the loan's end date rather than the parent
 * club's, which is both what the squad view should say and what keeps
 * contract health honest.
 */
const loanedIn: SquadPlayerSeed[] = LOANED_IN.flatMap((loan) => {
  const source = generatedMarket.find(
    (player) => player.id === loan.player || player.name === loan.player,
  );
  if (source === undefined) {
    // A loan naming nobody is a dataset error, not a reason to crash a
    // game: the squad simply goes without him.
    console.warn(`Loaned-in player not found in the market: ${loan.player}`);
    return [];
  }
  const terms = source.windows[0];
  return [
    {
      id: source.id,
      name: source.name,
      position: source.position as Position,
      age: source.age,
      homegrown: source.homegrown,
      quality: source.quality,
      baseValue: terms?.baseValue ?? 0,
      locked: false,
      onLoan: true,
      ...uefaFor(source.id, source.name),
      contract: {
        expiryYear: LOAN_EXPIRY_YEAR,
        salary: loan.salaryEurM,
      },
    },
  ];
});

const initialSquad: SquadPlayerSeed[] = [
  ...ownedSquad.filter((player) => !awayIds.has(player.id)),
  ...loanedIn,
];

/**
 * The academy pool: promotable youngsters, all sharing the fixed attributes
 * above. Positions, ages and home-grown status are authored in
 * academy-players.json; everything else is applied here.
 */
const academy: AcademyPlayerSeed[] = (academyData.players as AcademyDataPlayer[])
  .filter((player) => !awayIds.has(player.id))
  .map(academySeed);

/**
 * An academy player's seed: his authored position, age and home-grown
 * status, with the academy's fixed attributes.
 *
 * @param player - His entry in academy-players.json.
 * @returns His seed.
 */
function academySeed(player: AcademyDataPlayer): AcademyPlayerSeed {
  return {
    id: player.id,
    name: player.name,
    position: player.position as Position,
    age: player.age,
    homegrown: player.homegrown,
    quality: ACADEMY_QUALITY,
    baseValue: ACADEMY_BASE_VALUE,
    ...uefaFor(player.id, player.name),
    contract: {
      expiryYear: ACADEMY_EXPIRY_YEAR,
      salary: ACADEMY_SALARY_EUR_M,
    },
  };
}

// An entry naming nobody in the squad, the academy or away on loan is a
// typo or a departed player: report it rather than let it pass silently.
for (const entry of LIVERPOOL_UEFA_REGISTRATION) {
  const liverpool = [
    ...initialSquad,
    ...academy,
    ...loanedOut.map((loan) => loan.player),
  ];
  const matched = liverpool.some(
    (player) => player.id === entry.player || player.name === entry.player,
  );
  if (!matched) {
    console.warn(`UEFA registration entry matches no Liverpool player: ${entry.player}`);
  }
}

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
  loanedOut,
  rivals,
  baselineAmortisation: BASELINE_AMORTISATION,
};

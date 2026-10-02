/**
 * Between-window progression: the deterministic "time passes" step.
 *
 * Applied when a window is submitted, in this documented order:
 *
 *   0. Deregistration penalties: a player still off a registration list as
 *      the window closes loses 20% of his value, once per game (see
 *      rules/deregistration.ts).
 *
 *   1. Contract expiry (season boundaries only): players whose deals end at
 *      or before the new season leave for free.
 *   2. Ages: every player's age is brought up to the new window's date
 *      from his birth date, so he ages on his birthday (rules/age.ts). A
 *      player without one ages a year at a season boundary instead.
 *   3. Value drift: every player's baseValue moves along the age/quality
 *      curve at half the annual rate; saleValue is recomputed from the new
 *      baseValue and remaining contract length.
 *   4. Loan returns: club players away on loan age and drift exactly as in
 *      steps 2 and 3, and those due back join the squad.
 *   5. Market swap: the next window's authored pool opens, minus anyone
 *      already in the squad (a player sold earlier may be re-listed:
 *      buy-backs are allowed).
 *   6. Funds: unspent money rolls forward and the board adds the new
 *      window's budget.
 *
 * A "season boundary" is a transition where seasonStartYear increases
 * (January 2027 -> Summer 2027). Summer 2027 -> January 2028 stays inside
 * the 2027/28 season: no expiry, but values still drift, and a player whose
 * birthday falls in between is a year older.
 *
 * Everything here is pure and derived from config plus current state:
 * no randomness, ever.
 */
import { FREE_AGENT_WAGE_PREMIUM } from './constants';
import { EngineError } from './errors';
import { roundMoney } from './money';
import { ageAfter } from './rules/age';
import {
  fullyRegistered,
  penaliseDeregistrations,
} from './rules/deregistration';
import {
  computeSaleValue,
  contractYearsDemand,
  driftBaseValue,
} from './rules/value';
import { currentWindow } from './state';
import type {
  DepartedPlayer,
  GameState,
  MarketPlayer,
  SquadPlayer,
  WindowConfig,
} from './types';
import { isSubmittable, validateState } from './validate';

/**
 * Submits the current window and advances to the next.
 *
 * @param state - The current game state.
 * @returns The state at the opening of the next window.
 * @throws {EngineError} NO_NEXT_WINDOW when already in the final window;
 *   WINDOW_NOT_SUBMITTABLE while soft-constraint violations remain.
 */
export function advanceWindow(submitted: GameState): GameState {
  const nextIndex = submitted.windowIndex + 1;
  const nextWindow = submitted.config.windows[nextIndex];
  if (nextWindow === undefined) {
    throw new EngineError(
      'NO_NEXT_WINDOW',
      'Already in the final window; the game ends here',
    );
  }
  if (!isSubmittable(submitted)) {
    const summary = validateState(submitted)
      .map((v) => v.code)
      .join(', ');
    throw new EngineError(
      'WINDOW_NOT_SUBMITTABLE',
      `Cannot submit the window with outstanding violations: ${summary}`,
    );
  }

  // 0. The window closes: deregistration penalties fall now, before any
  // progression, so the value drop is in place before value drift.
  const state = penaliseDeregistrations(submitted);

  const seasonBoundary =
    nextWindow.seasonStartYear > currentWindow(state).seasonStartYear;

  // 1. Contract expiry (season boundaries only). Loanees leave on the same
  // schedule but by a different route: their deal was never the club's, so
  // they return to their parent club rather than reaching free agency.
  const expired: DepartedPlayer[] = [];
  const returned: DepartedPlayer[] = [];
  let squad: SquadPlayer[] = [];
  if (seasonBoundary) {
    for (const player of state.squad) {
      if (player.contract.expiryYear > nextWindow.seasonStartYear) {
        squad.push(player);
      } else if (player.onLoan === true) {
        returned.push({ player, reason: 'loan-ended', windowIndex: nextIndex });
      } else {
        expired.push({ player, reason: 'expired', windowIndex: nextIndex });
      }
    }
  } else {
    squad = [...state.squad];
  }

  // 2 + 3. Age to the new window's date, then value drift at that age.
  squad = squad.map((player) =>
    progressPlayer(player, seasonBoundary, nextWindow),
  );

  // 4. Loan returns. A contract that ends while he is away ends there: he
  // leaves as a free agent at the boundary, exactly as he would from the
  // squad, rather than coming back.
  const contracted = state.loanedOut.filter((loan) => {
    if (
      seasonBoundary &&
      loan.player.contract.expiryYear <= nextWindow.seasonStartYear
    ) {
      expired.push({ player: loan.player, reason: 'expired', windowIndex: nextIndex });
      return false;
    }
    return true;
  });
  // A player away is still the club's, so he ages and his value drifts as
  // if he were here; the returners then join the squad, on every list,
  // before the market opens, so it never lists them.
  const loanedOut = contracted.map((loan) => ({
    ...loan,
    player: progressPlayer(loan.player, seasonBoundary, nextWindow),
  }));
  squad = [
    ...squad,
    ...loanedOut
      .filter((loan) => loan.returnsInWindow === nextIndex)
      .map((loan) => fullyRegistered(loan.player)),
  ];

  // 5. Market swap: authored pool minus players already at the club, PLUS
  // the players who just walked: an expired contract makes a free agent,
  // not a ghost. Re-signing your own departed player is allowed, at a
  // free-agency wage premium.
  const squadIds = new Set(squad.map((p) => p.id));
  const freeListings: MarketPlayer[] = expired.map(({ player }) => {
    const age = ageAfter(player, true, nextWindow); // expiry is at a boundary
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      age,
      homegrown: player.homegrown,
      quality: player.quality,
      ...(player.birthDate !== undefined && { birthDate: player.birthDate }),
      // Kept so re-signing a released academy graduate restores him as
      // club-trained. His spell is not kept: leaving interrupted it.
      ...(player.uefaTraining !== undefined && {
        uefaTraining: player.uefaTraining,
      }),
      fee: 0,
      baseValue: driftBaseValue(player.baseValue, age, player.quality),
      wageDemand: roundMoney(player.contract.salary * FREE_AGENT_WAGE_PREMIUM),
      contractYears: contractYearsDemand(age),
      club: 'Free agent',
      league: 'free-agent',
    };
  });
  const pool = (state.config.marketByWindow[nextIndex] ?? []).filter(
    (p) => !squadIds.has(p.id),
  );
  const market = [...pool, ...freeListings];

  // Academy pool carries forward. Players age at season boundaries but their
  // value never drifts (Sam, 25/07/2026), so only the age and its derived
  // sale value change.
  const academy = state.academy.map((player) =>
    progressAcademyPlayer(player, seasonBoundary, nextWindow),
  );

  // 6. Funds roll forward plus the new window's budget.
  return {
    ...state,
    windowIndex: nextIndex,
    funds: roundMoney(state.funds + nextWindow.budget),
    squad,
    market,
    academy,
    loanedOut: loanedOut.filter((loan) => loan.returnsInWindow > nextIndex),
    departed: [...state.departed, ...expired, ...returned],
  };
}

/**
 * Ages an un-promoted academy player across a window transition. Unlike squad
 * players their baseValue does not drift; only the age moves on (to the new
 * window's date) and the sale value is recomputed against the new window.
 *
 * @param player - The academy player before the transition.
 * @param seasonBoundary - Whether this transition crosses seasons.
 * @param nextWindow - The window being opened.
 * @returns The academy player as they stand in the new window.
 */
function progressAcademyPlayer(
  player: SquadPlayer,
  seasonBoundary: boolean,
  nextWindow: WindowConfig,
): SquadPlayer {
  const age = ageAfter(player, seasonBoundary, nextWindow);
  return {
    ...player,
    age,
    saleValue: computeSaleValue(
      player.baseValue,
      player.contract.expiryYear,
      nextWindow,
    ),
  };
}

/**
 * Applies ageing and value drift to a single surviving player.
 *
 * @param player - The player before the transition.
 * @param seasonBoundary - Whether this transition crosses seasons.
 * @param nextWindow - The window being opened.
 * @returns The player as they stand in the new window.
 */
function progressPlayer(
  player: SquadPlayer,
  seasonBoundary: boolean,
  nextWindow: WindowConfig,
): SquadPlayer {
  const age = ageAfter(player, seasonBoundary, nextWindow);
  const baseValue = driftBaseValue(player.baseValue, age, player.quality);

  return {
    ...player,
    age,
    baseValue,
    saleValue: computeSaleValue(baseValue, player.contract.expiryYear, nextWindow),
  };
}

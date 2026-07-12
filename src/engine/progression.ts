/**
 * Between-window progression: the deterministic "time passes" step.
 *
 * Applied when a window is submitted, in this documented order:
 *
 *   1. Contract expiry (season boundaries only): players whose deals end at
 *      or before the new season leave for free.
 *   2. Age tick (season boundaries only): every remaining player ages one
 *      year, which can pull U21s into the registration count.
 *   3. Value drift: every player's baseValue moves along the age/quality
 *      curve at half the annual rate; saleValue is recomputed from the new
 *      baseValue and remaining contract length.
 *   4. Market swap: the next window's authored pool opens, minus anyone
 *      already in the squad (a player sold earlier may be re-listed:
 *      buy-backs are allowed).
 *   5. Funds: unspent money rolls forward and the board adds the new
 *      window's budget.
 *
 * A "season boundary" is a transition where seasonStartYear increases
 * (January 2027 -> Summer 2027). Summer 2026 -> January 2027 stays inside
 * the 2026/27 season: no expiry, no ageing, but values still drift.
 *
 * Everything here is pure and derived from config plus current state:
 * no randomness, ever.
 */
import { FREE_AGENT_WAGE_PREMIUM } from './constants';
import { EngineError } from './errors';
import { roundMoney } from './money';
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
export function advanceWindow(state: GameState): GameState {
  const nextIndex = state.windowIndex + 1;
  const nextWindow = state.config.windows[nextIndex];
  if (nextWindow === undefined) {
    throw new EngineError(
      'NO_NEXT_WINDOW',
      'Already in the final window; the game ends here',
    );
  }
  if (!isSubmittable(state)) {
    const summary = validateState(state)
      .map((v) => v.code)
      .join(', ');
    throw new EngineError(
      'WINDOW_NOT_SUBMITTABLE',
      `Cannot submit the window with outstanding violations: ${summary}`,
    );
  }

  const seasonBoundary =
    nextWindow.seasonStartYear > currentWindow(state).seasonStartYear;

  // 1. Contract expiry (season boundaries only).
  const expired: DepartedPlayer[] = [];
  let squad: SquadPlayer[] = [];
  if (seasonBoundary) {
    for (const player of state.squad) {
      if (player.contract.expiryYear <= nextWindow.seasonStartYear) {
        expired.push({ player, reason: 'expired', windowIndex: nextIndex });
      } else {
        squad.push(player);
      }
    }
  } else {
    squad = [...state.squad];
  }

  // 2 + 3. Age tick, then value drift at the new age.
  squad = squad.map((player) =>
    progressPlayer(player, seasonBoundary, nextWindow),
  );

  // 4. Market swap: authored pool minus players already at the club, PLUS
  // the players who just walked: an expired contract makes a free agent,
  // not a ghost. Re-signing your own departed player is allowed, at a
  // free-agency wage premium.
  const squadIds = new Set(squad.map((p) => p.id));
  const freeListings: MarketPlayer[] = expired.map(({ player }) => {
    const age = player.age + 1; // expiry only happens at season boundaries
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      age,
      homegrown: player.homegrown,
      quality: player.quality,
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

  // 5. Funds roll forward plus the new window's budget.
  return {
    ...state,
    windowIndex: nextIndex,
    funds: roundMoney(state.funds + nextWindow.budget),
    squad,
    market,
    departed: [...state.departed, ...expired],
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
  const age = seasonBoundary ? player.age + 1 : player.age;
  const baseValue = driftBaseValue(player.baseValue, age, player.quality);

  return {
    ...player,
    age,
    baseValue,
    saleValue: computeSaleValue(baseValue, player.contract.expiryYear, nextWindow),
  };
}

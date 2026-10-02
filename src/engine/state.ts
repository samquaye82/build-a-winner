/**
 * Game state construction and lookup helpers.
 */
import { EngineError } from './errors';
import { computeSaleValue } from './rules/value';
import type {
  GameConfig,
  GameState,
  LoanedOutPlayer,
  MarketPlayer,
  SquadPlayer,
  WindowConfig,
} from './types';

/**
 * Creates the initial game state for a playthrough.
 *
 * @param config - Immutable playthrough configuration (windows, starting
 *   squad, market pools).
 * @returns The state at the opening of the first window: full budget, empty
 *   action log, first window's market pool available.
 * @throws {Error} If the config has no windows, the market pools are not
 *   index-aligned with the windows, or a player out on loan returns in a
 *   window that does not exist or after his contract has run out.
 */
export function createGame(config: GameConfig): GameState {
  const firstWindow = config.windows[0];
  if (firstWindow === undefined) {
    throw new Error('GameConfig must define at least one window');
  }
  if (config.marketByWindow.length !== config.windows.length) {
    throw new Error(
      `GameConfig must supply one market pool per window: got ${String(config.marketByWindow.length)} pools for ${String(config.windows.length)} windows`,
    );
  }

  // Derive runtime squad players from authored seeds: sale values are
  // computed, never authored, so the contract-length discount is always
  // consistent with the value model.
  const squad: SquadPlayer[] = config.initialSquad.map((seed) => ({
    ...seed,
    saleValue: computeSaleValue(
      seed.baseValue,
      seed.contract.expiryYear,
      firstWindow,
    ),
  }));

  // Academy players are derived the same way, but land in their own pool:
  // locked defaults to false since the board never blocks a promotion.
  const academy: SquadPlayer[] = (config.academy ?? []).map((seed) => ({
    ...seed,
    locked: false,
    saleValue: computeSaleValue(
      seed.baseValue,
      seed.contract.expiryYear,
      firstWindow,
    ),
  }));

  // Players away on loan are derived the same way and held apart until
  // their return window opens (see progression.ts).
  const loanedOut: LoanedOutPlayer[] = (config.loanedOut ?? []).map((seed) => {
    const returnWindow = config.windows[seed.returnsInWindow];
    if (seed.returnsInWindow < 1 || returnWindow === undefined) {
      throw new Error(
        `${seed.player.name} is set to return in window ${String(seed.returnsInWindow)}, which is not a later window of this game`,
      );
    }
    // A contract that ends before he is back would need him released while
    // away, which the game does not model: reject the config instead.
    if (seed.player.contract.expiryYear <= returnWindow.seasonStartYear) {
      throw new Error(
        `${seed.player.name}'s contract expires in ${String(seed.player.contract.expiryYear)}, before he returns from loan`,
      );
    }
    return {
      ...seed,
      player: {
        ...seed.player,
        saleValue: computeSaleValue(
          seed.player.baseValue,
          seed.player.contract.expiryYear,
          firstWindow,
        ),
      },
    };
  });

  return {
    config,
    windowIndex: 0,
    funds: firstWindow.budget,
    squad,
    market: config.marketByWindow[0] ?? [],
    academy,
    loanedOut,
    departed: [],
    actionLog: [],
  };
}

/**
 * Returns the configuration of the currently open window.
 *
 * @param state - The current game state.
 * @returns The active window's configuration.
 */
export function currentWindow(state: GameState): WindowConfig {
  const window = state.config.windows[state.windowIndex];
  if (window === undefined) {
    // Unreachable if state transitions are correct; guards array access
    // under noUncheckedIndexedAccess.
    throw new Error(`No window configured at index ${String(state.windowIndex)}`);
  }
  return window;
}

/**
 * Finds a squad player by id.
 *
 * @param state - The current game state.
 * @param playerId - The player to find.
 * @returns The squad player.
 * @throws {EngineError} PLAYER_NOT_IN_SQUAD if absent.
 */
export function requireSquadPlayer(
  state: GameState,
  playerId: string,
): SquadPlayer {
  const player = state.squad.find((p) => p.id === playerId);
  if (player === undefined) {
    throw new EngineError(
      'PLAYER_NOT_IN_SQUAD',
      `Player ${playerId} is not in the squad`,
    );
  }
  return player;
}

/**
 * Finds a market player by id in the current window's market.
 *
 * @param state - The current game state.
 * @param playerId - The player to find.
 * @returns The market player.
 * @throws {EngineError} PLAYER_NOT_IN_MARKET if absent.
 */
export function requireMarketPlayer(
  state: GameState,
  playerId: string,
): MarketPlayer {
  const player = state.market.find((p) => p.id === playerId);
  if (player === undefined) {
    throw new EngineError(
      'PLAYER_NOT_IN_MARKET',
      `Player ${playerId} is not in the current market`,
    );
  }
  return player;
}

/**
 * Finds an academy player by id in the current academy pool.
 *
 * @param state - The current game state.
 * @param playerId - The player to find.
 * @returns The academy player.
 * @throws {EngineError} PLAYER_NOT_IN_ACADEMY if absent.
 */
export function requireAcademyPlayer(
  state: GameState,
  playerId: string,
): SquadPlayer {
  const player = state.academy.find((p) => p.id === playerId);
  if (player === undefined) {
    throw new EngineError(
      'PLAYER_NOT_IN_ACADEMY',
      `Player ${playerId} is not in the academy`,
    );
  }
  return player;
}

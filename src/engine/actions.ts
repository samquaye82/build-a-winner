/**
 * Action reducers: the engine's state machine.
 *
 * applyAction is the single entry point. Every reducer is pure: it returns a
 * new GameState and never mutates its input. The applied action is appended
 * to state.actionLog, so replaying a log through applyAction from the same
 * config always reproduces the same state (the determinism contract that a
 * future verified leaderboard depends on).
 *
 * Structurally impossible actions throw EngineError. Soft constraint
 * breaches (budget, quotas) never throw; see validate.ts.
 */
import { EngineError } from './errors';
import { roundMoney } from './money';
import { priceRenewal } from './rules/renewal';
import {
  createGame,
  currentWindow,
  requireMarketPlayer,
  requireSquadPlayer,
} from './state';
import type {
  Action,
  GameConfig,
  GameState,
  MarketPlayer,
  SquadPlayer,
} from './types';

/**
 * Applies a single action to the game state.
 *
 * @param state - The current game state.
 * @param action - The action to apply.
 * @returns The resulting state, with the action appended to the log.
 * @throws {EngineError} When the action is structurally impossible (unknown
 *   player, locked player, invalid renewal, nothing to undo).
 */
export function applyAction(state: GameState, action: Action): GameState {
  const next = reduce(state, action);
  return { ...next, actionLog: [...state.actionLog, action] };
}

/**
 * Replays an action log from scratch.
 *
 * This is the verification primitive: given the same config and log, the
 * result must be identical to the state the actions were originally applied
 * to. A future leaderboard server calls exactly this.
 *
 * @param config - The playthrough configuration.
 * @param actions - The full action log to replay.
 * @returns The state after every action has been applied in order.
 * @throws {EngineError} If any action in the log is invalid, which indicates
 *   a corrupted or forged log.
 */
export function replay(
  config: GameConfig,
  actions: readonly Action[],
): GameState {
  return actions.reduce(applyAction, createGame(config));
}

/**
 * Dispatches an action to its reducer. Exhaustive over Action['type'].
 */
function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'BUY':
      return buy(state, action.playerId);
    case 'UNDO_BUY':
      return undoBuy(state, action.playerId);
    case 'SELL':
      return sell(state, action.playerId);
    case 'UNDO_SELL':
      return undoSell(state, action.playerId);
    case 'RENEW':
      return renew(state, action.playerId, action.newExpiryYear);
    case 'UNDO_RENEW':
      return undoRenew(state, action.playerId);
  }
}

/**
 * Signs a market player: they join the squad on their pre-agreed contract
 * and the fee comes off the funds.
 */
function buy(state: GameState, playerId: string): GameState {
  const marketPlayer = requireMarketPlayer(state, playerId);
  const window = currentWindow(state);

  const signed: SquadPlayer = {
    id: marketPlayer.id,
    name: marketPlayer.name,
    position: marketPlayer.position,
    age: marketPlayer.age,
    homegrown: marketPlayer.homegrown,
    quality: marketPlayer.quality,
    // Until values shift between windows (M2), a new signing can be moved
    // on within the same window for the fee just paid.
    saleValue: marketPlayer.fee,
    locked: false,
    contract: {
      expiryYear: window.seasonStartYear + marketPlayer.contractYears,
      salary: marketPlayer.wageDemand,
    },
    acquisition: {
      fee: marketPlayer.fee,
      windowIndex: state.windowIndex,
      contractYears: marketPlayer.contractYears,
    },
  };

  return {
    ...state,
    funds: roundMoney(state.funds - marketPlayer.fee),
    squad: [...state.squad, signed],
    market: state.market.filter((p) => p.id !== playerId),
  };
}

/**
 * Reverses a purchase made in the current window: the player returns to the
 * market (in their original listing position) and the fee is refunded.
 */
function undoBuy(state: GameState, playerId: string): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (
    player.acquisition === undefined ||
    player.acquisition.windowIndex !== state.windowIndex
  ) {
    throw new EngineError(
      'PLAYER_NOT_BOUGHT_THIS_WINDOW',
      `${player.name} was not bought in the current window`,
    );
  }

  // The market listing is reconstructed from config rather than from the
  // squad entry, so that renewals made since the purchase are discarded
  // cleanly along with the purchase itself.
  const basePool = state.config.marketByWindow[state.windowIndex] ?? [];
  const listing = basePool.find((p) => p.id === playerId);
  if (listing === undefined) {
    // Unreachable while undo is same-window only: a bought player always
    // originates from the current window's pool.
    throw new EngineError(
      'PLAYER_NOT_IN_MARKET',
      `No market listing found to restore for ${player.name}`,
    );
  }

  return {
    ...state,
    funds: roundMoney(state.funds + player.acquisition.fee),
    squad: state.squad.filter((p) => p.id !== playerId),
    market: restoreMarketOrder([...state.market, listing], basePool),
  };
}

/**
 * Sells a squad player: they leave the club and the pre-agreed fee is added
 * to the funds. The board blocks sales of locked players.
 */
function sell(state: GameState, playerId: string): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (player.locked) {
    throw new EngineError(
      'PLAYER_LOCKED',
      `The board will not sanction the sale of ${player.name}`,
    );
  }

  return {
    ...state,
    funds: roundMoney(state.funds + player.saleValue),
    squad: state.squad.filter((p) => p.id !== playerId),
    departed: [
      ...state.departed,
      { player, reason: 'sold', windowIndex: state.windowIndex },
    ],
  };
}

/**
 * Reverses a sale made in the current window: the player rejoins the squad
 * and the fee is handed back.
 */
function undoSell(state: GameState, playerId: string): GameState {
  const departure = state.departed.find(
    (d) =>
      d.player.id === playerId &&
      d.reason === 'sold' &&
      d.windowIndex === state.windowIndex,
  );
  if (departure === undefined) {
    throw new EngineError(
      'PLAYER_NOT_SOLD_THIS_WINDOW',
      `Player ${playerId} was not sold in the current window`,
    );
  }

  return {
    ...state,
    funds: roundMoney(state.funds - departure.player.saleValue),
    squad: [...state.squad, departure.player],
    departed: state.departed.filter((d) => d !== departure),
  };
}

/**
 * Renews a squad player's contract to a new expiry year. The engine prices
 * the salary increase (see rules/renewal.ts); a player may be renewed at
 * most once per playthrough, so the timing of a renewal is itself a
 * strategic decision.
 */
function renew(
  state: GameState,
  playerId: string,
  newExpiryYear: number,
): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (player.renewal !== undefined) {
    throw new EngineError(
      'ALREADY_RENEWED',
      `${player.name} has already been renewed this game`,
    );
  }

  const window = currentWindow(state);
  const newContract = priceRenewal(player, newExpiryYear, window);

  const renewed: SquadPlayer = {
    ...player,
    contract: newContract,
    renewal: {
      previousContract: player.contract,
      windowIndex: state.windowIndex,
    },
  };

  return {
    ...state,
    squad: state.squad.map((p) => (p.id === playerId ? renewed : p)),
  };
}

/**
 * Reverses a renewal made in the current window, restoring the previous
 * contract.
 */
function undoRenew(state: GameState, playerId: string): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (player.renewal?.windowIndex !== state.windowIndex) {
    throw new EngineError(
      'NOT_RENEWED_THIS_WINDOW',
      `${player.name} has no renewal to undo in the current window`,
    );
  }

  const restored: SquadPlayer = {
    ...player,
    contract: player.renewal.previousContract,
  };
  delete restored.renewal;

  return {
    ...state,
    squad: state.squad.map((p) => (p.id === playerId ? restored : p)),
  };
}

/**
 * Sorts a market list back into its base-pool listing order, so undoing a
 * purchase restores the market exactly as it was.
 */
function restoreMarketOrder(
  market: readonly MarketPlayer[],
  basePool: readonly MarketPlayer[],
): MarketPlayer[] {
  const orderById = new Map(basePool.map((p, index) => [p.id, index]));
  return [...market].sort(
    (a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0),
  );
}

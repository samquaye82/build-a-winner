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
import { advanceWindow } from './progression';
import { isLocked } from './rules/lock';
import { priceRenewal } from './rules/renewal';
import { signingWage } from './rules/wageStructure';
import { computeSaleValue } from './rules/value';
import { validateXI } from './scoring';
import {
  createGame,
  currentWindow,
  requireAcademyPlayer,
  requireMarketPlayer,
  requireSquadPlayer,
} from './state';
import { isRegisteredFor } from './rules/deregistration';
import { loanFee, loanReturnWindow } from './rules/loan';
import type {
  Action,
  Competition,
  GameConfig,
  GameState,
  MarketPlayer,
  SquadPlayer,
  XISelection,
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
    case 'PROMOTE':
      return promote(state, action.playerId);
    case 'UNDO_PROMOTE':
      return undoPromote(state, action.playerId);
    case 'DEREGISTER':
      return deregister(state, action.playerId, action.competition);
    case 'REREGISTER':
      return reregister(state, action.playerId, action.competition);
    case 'LOAN_OUT':
      return loanOut(state, action.playerId);
    case 'UNDO_LOAN_OUT':
      return undoLoanOut(state, action.playerId);
    case 'ADVANCE_WINDOW':
      return advanceWindow(state);
    case 'PICK_XI':
      return pickXI(state, action.selection);
  }
}

/**
 * Loans a squad player out to the end of the season. The fee, 15% of his
 * sale value, is banked now; while away he is off every list and his wage
 * leaves the squad cost, though his fee keeps amortising.
 */
function loanOut(state: GameState, playerId: string): GameState {
  const player = requireSquadPlayer(state, playerId);
  // The board's protection covers loans as well as sales (Sam, 02/10/2026).
  if (isLocked(player, state.windowIndex)) {
    throw new EngineError(
      'PLAYER_LOCKED',
      `The board will not sanction loaning out ${player.name}`,
    );
  }
  if (player.onLoan === true) {
    throw new EngineError(
      'PLAYER_ON_LOAN',
      `${player.name} is on loan here and is not the club's to lend`,
    );
  }
  if (state.xi?.playerIds.includes(playerId) === true) {
    throw new EngineError(
      'PLAYER_IN_XI',
      `${player.name} is in your starting eleven; take him out of it first`,
    );
  }

  const fee = loanFee(player);
  return {
    ...state,
    funds: roundMoney(state.funds + fee),
    squad: state.squad.filter((p) => p.id !== playerId),
    loanedOut: [
      ...state.loanedOut,
      {
        player,
        returnsInWindow: loanReturnWindow(state),
        agreed: { windowIndex: state.windowIndex, fee },
      },
    ],
  };
}

/**
 * Reverses a loan agreed in the current window: the player returns to the
 * squad exactly as he left, and the fee is repaid.
 */
function undoLoanOut(state: GameState, playerId: string): GameState {
  const loan = state.loanedOut.find(
    (l) => l.player.id === playerId && l.agreed?.windowIndex === state.windowIndex,
  );
  if (loan?.agreed === undefined) {
    throw new EngineError(
      'PLAYER_NOT_LOANED_THIS_WINDOW',
      `Player ${playerId} was not loaned out in the current window`,
    );
  }
  return {
    ...state,
    funds: roundMoney(state.funds - loan.agreed.fee),
    squad: [...state.squad, loan.player],
    loanedOut: state.loanedOut.filter((l) => l !== loan),
  };
}

/** Display names for competitions in error messages. */
const COMPETITION_NAMES: Readonly<Record<Competition, string>> = {
  PL: 'Premier League',
  UCL: 'Champions League',
};

/**
 * Leaves a squad player off a competition's registration list. Nothing is
 * charged now: the penalty falls only if a window closes with him still off
 * (see rules/deregistration.ts).
 */
function deregister(
  state: GameState,
  playerId: string,
  competition: Competition,
): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (!isRegisteredFor(player, competition)) {
    throw new EngineError(
      'ALREADY_DEREGISTERED',
      `${player.name} is already off the ${COMPETITION_NAMES[competition]} list`,
    );
  }
  // A player off the Premier League list cannot play, so he cannot stay in
  // a picked eleven. Refused rather than silently wiping the selection.
  if (competition === 'PL' && state.xi?.playerIds.includes(playerId) === true) {
    throw new EngineError(
      'PLAYER_IN_XI',
      `${player.name} is in your starting eleven; take him out of it first`,
    );
  }
  const deregisteredFrom = [...(player.deregisteredFrom ?? []), competition];
  return {
    ...state,
    squad: state.squad.map((p) =>
      p.id === playerId ? { ...p, deregisteredFrom } : p,
    ),
  };
}

/**
 * Puts a squad player back on a competition's registration list. Free
 * within the window he was left off in; a penalty already taken at an
 * earlier window's close is not refunded.
 */
function reregister(
  state: GameState,
  playerId: string,
  competition: Competition,
): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (isRegisteredFor(player, competition)) {
    throw new EngineError(
      'NOT_DEREGISTERED',
      `${player.name} is already on the ${COMPETITION_NAMES[competition]} list`,
    );
  }
  const remaining = (player.deregisteredFrom ?? []).filter(
    (c) => c !== competition,
  );
  return {
    ...state,
    squad: state.squad.map((p) => {
      if (p.id !== playerId) {
        return p;
      }
      // Drop the field once he is back on every list, so a registered
      // player looks the same whether or not he was ever left off.
      const { deregisteredFrom: _dropped, ...rest } = p;
      return remaining.length > 0 ? { ...rest, deregisteredFrom: remaining } : rest;
    }),
  };
}

/**
 * Chooses the starting eleven. Only available in the final window; picking
 * again simply replaces the previous selection.
 */
function pickXI(state: GameState, selection: XISelection): GameState {
  if (state.windowIndex !== state.config.windows.length - 1) {
    throw new EngineError(
      'NOT_FINAL_WINDOW',
      'The starting eleven is picked after the final window',
    );
  }
  validateXI(state, selection);
  return { ...state, xi: selection };
}

/**
 * Signs a market player: they join the squad on their pre-agreed contract
 * and the fee comes off the funds.
 */
function buy(state: GameState, playerId: string): GameState {
  const marketPlayer = requireMarketPlayer(state, playerId);
  if (marketPlayer.locked === true) {
    throw new EngineError(
      'PLAYER_LOCKED',
      `${marketPlayer.name}'s club refuses to sell`,
    );
  }
  const window = currentWindow(state);

  // A signing's book value is the fee paid unless the listing carries an
  // explicit base value (free agents cost nothing but are worth plenty).
  const baseValue = marketPlayer.baseValue ?? marketPlayer.fee;
  const signed: SquadPlayer = {
    id: marketPlayer.id,
    name: marketPlayer.name,
    position: marketPlayer.position,
    age: marketPlayer.age,
    ...(marketPlayer.birthDate !== undefined && {
      birthDate: marketPlayer.birthDate,
    }),
    homegrown: marketPlayer.homegrown,
    quality: marketPlayer.quality,
    // Training history belongs to the player and comes with him. Tenure
    // does not: whatever spell he had elsewhere, his time at this club
    // starts in this window.
    ...(marketPlayer.uefaTraining !== undefined && {
      uefaTraining: marketPlayer.uefaTraining,
    }),
    joined: { season: window.seasonStartYear, midSeason: window.midSeason },
    baseValue,
    saleValue: computeSaleValue(
      baseValue,
      window.seasonStartYear + marketPlayer.contractYears,
      window,
    ),
    locked: false,
    contract: {
      expiryYear: window.seasonStartYear + marketPlayer.contractYears,
      // His listed demand, lifted to the club's wage structure where it
      // falls short (rules/wageStructure.ts).
      salary: signingWage(state, marketPlayer),
    },
    acquisition: {
      fee: marketPlayer.fee,
      windowIndex: state.windowIndex,
      contractYears: marketPlayer.contractYears,
    },
    // Kept so undo can restore the exact listing, including free agents that
    // progression created and that are not in the authored config pool.
    boughtFrom: marketPlayer,
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

  // Restore the exact listing captured at buy time; fall back to the authored
  // config pool for safety. The stored listing also covers progression-created
  // free agents, which are not in config. Restoring a fresh listing (rather
  // than the squad entry) discards any renewal made since the purchase.
  const basePool = state.config.marketByWindow[state.windowIndex] ?? [];
  const listing = player.boughtFrom ?? basePool.find((p) => p.id === playerId);
  if (listing === undefined) {
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
 * to the funds. The board blocks sales of locked players, and of anyone
 * signed in the current window.
 *
 * @throws {EngineError} PLAYER_LOCKED, PLAYER_ON_LOAN, or
 *   PLAYER_SIGNED_THIS_WINDOW for a player bought in this window.
 */
function sell(state: GameState, playerId: string): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (isLocked(player, state.windowIndex)) {
    throw new EngineError(
      'PLAYER_LOCKED',
      `The board will not sanction the sale of ${player.name}`,
    );
  }
  if (player.onLoan === true) {
    throw new EngineError(
      'PLAYER_ON_LOAN',
      `${player.name} is on loan and is not the club's to sell`,
    );
  }
  // A signing cannot be sold on in the window he joined (Sam, 03/10/2026).
  // Where a listing's book value runs ahead of its fee (the Manchester City
  // fire sale), buying and selling straight back would print money. UNDO_BUY
  // still reverses a mistaken signing, at the fee actually paid.
  if (player.acquisition?.windowIndex === state.windowIndex) {
    throw new EngineError(
      'PLAYER_SIGNED_THIS_WINDOW',
      `${player.name} was signed this window and cannot be sold until the next`,
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
  if (player.onLoan === true) {
    throw new EngineError(
      'PLAYER_ON_LOAN',
      `${player.name} is on loan; his contract is his parent club's to extend`,
    );
  }
  if (player.renewal !== undefined) {
    throw new EngineError(
      'ALREADY_RENEWED',
      `${player.name} has already been renewed this game`,
    );
  }

  const window = currentWindow(state);
  const newContract = priceRenewal(player, newExpiryYear, window, state.squad);

  const renewed: SquadPlayer = {
    ...player,
    contract: newContract,
    // A longer deal removes the running-down discount, so renewing a
    // final-year player also restores their sale price.
    saleValue: computeSaleValue(player.baseValue, newContract.expiryYear, window),
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

  const previousContract = player.renewal.previousContract;
  const restored: SquadPlayer = {
    ...player,
    contract: previousContract,
    // Undo is same-window only, so the pre-renewal sale value can always be
    // recomputed against the current window.
    saleValue: computeSaleValue(
      player.baseValue,
      previousContract.expiryYear,
      currentWindow(state),
    ),
  };
  delete restored.renewal;

  return {
    ...state,
    squad: state.squad.map((p) => (p.id === playerId ? restored : p)),
  };
}

/**
 * Promotes an academy player into the first-team squad. No fee changes hands
 * (they come through the academy), so no acquisition is recorded and the
 * player adds wages but no amortisation to the squad cost. From now on they
 * count towards every registration and topline figure and can be sold.
 */
function promote(state: GameState, playerId: string): GameState {
  const player = requireAcademyPlayer(state, playerId);
  const window = currentWindow(state);

  const promoted: SquadPlayer = {
    ...player,
    // Recompute against the current window so the sale value is consistent
    // with the discount curve at the moment of promotion.
    saleValue: computeSaleValue(player.baseValue, player.contract.expiryYear, window),
    promotion: { windowIndex: state.windowIndex },
  };

  return {
    ...state,
    squad: [...state.squad, promoted],
    academy: state.academy.filter((p) => p.id !== playerId),
  };
}

/**
 * Reverses a promotion made in the current window: the player returns to the
 * academy pool. Any renewal agreed since the promotion is unwound with it,
 * mirroring how undoing a purchase discards later renewals.
 */
function undoPromote(state: GameState, playerId: string): GameState {
  const player = requireSquadPlayer(state, playerId);
  if (player.promotion?.windowIndex !== state.windowIndex) {
    throw new EngineError(
      'PLAYER_NOT_PROMOTED_THIS_WINDOW',
      `${player.name} has no promotion to undo in the current window`,
    );
  }

  // Restore the pre-promotion contract if the player was renewed after being
  // promoted, so the whole promotion unwinds cleanly.
  const contract =
    player.renewal?.windowIndex === state.windowIndex
      ? player.renewal.previousContract
      : player.contract;

  const restored: SquadPlayer = {
    ...player,
    contract,
    saleValue: computeSaleValue(
      player.baseValue,
      contract.expiryYear,
      currentWindow(state),
    ),
  };
  delete restored.promotion;
  delete restored.renewal;

  const basePool = state.config.academy ?? [];
  return {
    ...state,
    squad: state.squad.filter((p) => p.id !== playerId),
    academy: restoreAcademyOrder([...state.academy, restored], basePool),
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
  // Listings not in the authored pool (restored free agents) sort to the end,
  // where progression originally placed them.
  const rank = (id: string): number =>
    orderById.get(id) ?? Number.MAX_SAFE_INTEGER;
  return [...market].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * Sorts an academy list back into its authored order, so undoing a promotion
 * restores the pool exactly as it was.
 */
function restoreAcademyOrder(
  academy: readonly SquadPlayer[],
  basePool: readonly { id: string }[],
): SquadPlayer[] {
  const orderById = new Map(basePool.map((p, index) => [p.id, index]));
  return [...academy].sort(
    (a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0),
  );
}

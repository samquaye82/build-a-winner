/**
 * Public entry point for the game engine.
 *
 * The engine is a pure, deterministic TypeScript module with no React or DOM
 * dependencies. It models the game as a state machine:
 *
 *   (GameState, Action) -> GameState
 *
 * Purity and determinism are hard requirements: identical action sequences
 * must always produce identical states and scores. This is what allows a
 * future verified leaderboard to replay a client's action log server-side
 * and recompute the score independently (see replay in actions.ts).
 *
 */

/**
 * Version of the engine's rules and data model.
 *
 * Bump whenever a rules change would make scores incomparable with earlier
 * versions; a future leaderboard must only compare like-for-like versions.
 */
export const ENGINE_VERSION = '0.7.0';

export type {
  Action,
  Acquisition,
  Contract,
  DepartedPlayer,
  DepartureReason,
  GameConfig,
  GameState,
  MarketPlayer,
  PlayerCore,
  Position,
  Renewal,
  SquadPlayer,
  SquadPlayerSeed,
  WindowConfig,
  WindowId,
  XISelection,
} from './types';

export {
  FORMATIONS,
  type Formation,
  type FormationId,
  type FormationSlot,
} from './formations';
export { scoreGame, validateXI, type ScoreBreakdown } from './scoring';

export { EngineError, type EngineErrorCode } from './errors';
export type { Violation, ViolationCode } from './rules/violations';

export { applyAction, replay } from './actions';
export { createGame, currentWindow } from './state';
export { validateState, isSubmittable } from './validate';
export { countRegistration, isU21 } from './rules/registration';
export { priceRenewal } from './rules/renewal';
export { computeSquadCost, type SquadCostBreakdown } from './rules/scr';
export {
  annualValueGrowthRate,
  computeSaleValue,
  contractDiscount,
  contractYearsDemand,
  remainingMonths,
} from './rules/value';
export { roundMoney } from './money';

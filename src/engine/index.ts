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
export const ENGINE_VERSION = '0.24.0';

export type {
  AcademyPlayerSeed,
  Action,
  Acquisition,
  AgreedLoan,
  Competition,
  Contract,
  DepartedPlayer,
  DepartureReason,
  GameConfig,
  GameState,
  LoanedOutPlayer,
  LoanedOutSeed,
  MarketPlayer,
  PlayerCore,
  Position,
  PriorSigning,
  Promotion,
  Renewal,
  RivalTeam,
  SeasonPoint,
  SquadPlayer,
  SquadPlayerSeed,
  UefaTraining,
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
export {
  autoPickBestXI,
  scoreGame,
  scoreProvisional,
  validateXI,
  type ScoreBreakdown,
} from './scoring';
export {
  rivalsAt,
  seasonVerdict,
  simulateSeason,
  // Building blocks, exported so a whole-league projection can run the very
  // model the game's own projection runs.
  expectedGoals,
  fullSquadStrength,
  matchOutcome,
  roundRecord,
  stretchStrength,
  type SeasonProjection,
} from './simulation';
export {
  MIN_VIABLE_SQUAD_SIZE,
  UNVIABLE_SQUAD_MAX_SCORE,
} from './constants';

export { EngineError, type EngineErrorCode } from './errors';
export type { Violation, ViolationCode } from './rules/violations';

export { applyAction, replay } from './actions';
export {
  createGame,
  currentWindow,
  requireAcademyPlayer,
  requireMarketPlayer,
  requireSquadPlayer,
} from './state';
export { validateState, isSubmittable } from './validate';
export { isLocked } from './rules/lock';
export { countRegistration, isU21 } from './rules/registration';
export { priceRenewal } from './rules/renewal';
export { computeSquadCost, type SquadCostBreakdown } from './rules/scr';
export { loanFee, loanReturnWindow } from './rules/loan';
export { ageAt, ageOn, windowDate } from './rules/age';
export {
  isDeregistered,
  isRegisteredFor,
  registeredFor,
} from './rules/deregistration';
export {
  assignUefaLists,
  isListBEligible,
  meetsListBTenure,
  seasonTime,
  validateUefaRegistration,
  type UefaRegistration,
} from './rules/uefa';
export {
  annualValueGrowthRate,
  computeSaleValue,
  contractDiscount,
  contractYearsDemand,
  remainingMonths,
} from './rules/value';
export { roundMoney } from './money';

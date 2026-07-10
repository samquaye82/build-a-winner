/**
 * Structured error model for the engine.
 *
 * Reducers throw EngineError for actions that are structurally impossible
 * (unknown player, selling a locked player, renewing twice in a window).
 * Soft constraint breaches (over budget, quota exceeded) are NOT errors:
 * they are reported as violations by validate.ts so the player can explore
 * invalid squads freely and only submission is blocked.
 */

/** Machine-readable reasons an action can be rejected outright. */
export type EngineErrorCode =
  | 'PLAYER_NOT_IN_MARKET'
  | 'PLAYER_NOT_IN_SQUAD'
  | 'PLAYER_LOCKED'
  | 'PLAYER_NOT_BOUGHT_THIS_WINDOW'
  | 'PLAYER_NOT_SOLD_THIS_WINDOW'
  | 'ALREADY_RENEWED'
  | 'NOT_RENEWED_THIS_WINDOW'
  | 'INVALID_EXPIRY_YEAR'
  | 'NO_NEXT_WINDOW'
  | 'WINDOW_NOT_SUBMITTABLE'
  | 'NOT_FINAL_WINDOW'
  | 'INVALID_XI'
  | 'XI_NOT_PICKED';

/**
 * Error thrown by reducers for structurally invalid actions.
 *
 * @remarks The UI should make these unreachable (e.g. locked players are not
 * clickable), so an EngineError surfacing in production indicates a bug, not
 * bad user input.
 */
export class EngineError extends Error {
  /** Machine-readable rejection reason. */
  readonly code: EngineErrorCode;

  /**
   * @param code - Machine-readable rejection reason.
   * @param message - Human-readable explanation for logs and debugging.
   */
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

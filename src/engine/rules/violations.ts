/**
 * Shared violation model for soft constraints.
 *
 * Violations are how the engine reports rule breaches without blocking
 * exploration: the player can assemble an illegal squad freely, sees the
 * violations live on the dashboard, and is only stopped at submission.
 * Contrast with EngineError (errors.ts), which rejects structurally
 * impossible actions outright.
 */

/** Machine-readable soft-constraint breach codes. */
export type ViolationCode =
  | 'OVER21_LIMIT_EXCEEDED'
  | 'NON_HOMEGROWN_LIMIT_EXCEEDED'
  | 'SQUAD_TOO_SMALL'
  | 'NOT_ENOUGH_GOALKEEPERS'
  | 'BUDGET_EXCEEDED'
  | 'SCR_EXCEEDED';

/** A single soft-constraint breach, ready for display. */
export interface Violation {
  code: ViolationCode;
  /** Human-readable description in British English. */
  message: string;
}

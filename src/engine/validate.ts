/**
 * Aggregate validation for the current window.
 *
 * Collects soft-constraint violations from every rule module. The UI shows
 * these live; submission (advancing the window, or finishing the game) is
 * only allowed when the list is empty.
 */
import { validateBudget } from './rules/budget';
import { validateRegistration } from './rules/registration';
import { validateScr } from './rules/scr';
import type { Violation } from './rules/violations';
import type { GameState } from './types';

/**
 * Validates the game state against all soft constraints.
 *
 * @param state - The current game state.
 * @returns All current violations; empty when the plan is submittable.
 */
export function validateState(state: GameState): Violation[] {
  return [
    ...validateBudget(state),
    ...validateRegistration(state.squad),
    ...validateScr(state),
  ];
}

/**
 * Whether the current window can be submitted.
 *
 * @param state - The current game state.
 * @returns True when no violations remain.
 */
export function isSubmittable(state: GameState): boolean {
  return validateState(state).length === 0;
}

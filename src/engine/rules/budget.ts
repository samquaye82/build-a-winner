/**
 * Budget rule: funds may dip negative while the player experiments, but a
 * window cannot be submitted in the red. Funds arithmetic itself lives in
 * the reducers; this module only judges the result.
 */
import type { GameState } from '../types';
import type { Violation } from './violations';

/**
 * Validates the funds position of the current window.
 *
 * @param state - The current game state.
 * @returns A violation when funds are negative; otherwise empty.
 */
export function validateBudget(state: GameState): Violation[] {
  if (state.funds >= 0) {
    return [];
  }
  return [
    {
      code: 'BUDGET_EXCEEDED',
      message: `Plan is EUR ${String(Math.abs(state.funds))}m over budget`,
    },
  ];
}

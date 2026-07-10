/**
 * Squad cost ratio (SCR) rule.
 *
 * Models the Premier League's squad cost control: annual squad cost (wages
 * plus transfer-fee amortisation) may not exceed SCR_LIMIT of the club's
 * cap basis. This is the constraint that rolls across windows: a signing's
 * amortisation and wages burden every later window until the player is
 * sold.
 *
 * Amortisation model:
 * - The starting squad carries a single club-level baseline
 *   (GameConfig.baselineAmortisation). Selling a starting player removes
 *   their wage but never reduces the baseline (no per-player book values).
 * - In-game signings amortise as fee / contract years at signing. Renewing
 *   a signed player does NOT re-spread the fee over the new term (no
 *   Chelsea-style amortisation games).
 */
import { SCR_LIMIT } from '../constants';
import { roundMoney } from '../money';
import type { GameState } from '../types';
import type { Violation } from './violations';

/**
 * Full squad cost breakdown, for validation and the UI dashboard.
 */
export interface SquadCostBreakdown {
  /** Sum of all squad salaries (EUR m per year). */
  wageBill: number;
  /** Club-level amortisation from pre-game signings (EUR m per year). */
  baselineAmortisation: number;
  /** Amortisation from in-game signings still at the club (EUR m/year). */
  signingAmortisation: number;
  /** Total annual squad cost (EUR m). */
  total: number;
  /** The cap the total is measured against: capBase * SCR_LIMIT (EUR m). */
  cap: number;
  /** total / capBase, rounded to three decimal places. */
  ratio: number;
}

/**
 * Computes the current squad cost breakdown.
 *
 * @param state - The current game state.
 * @returns The breakdown, all figures rounded.
 */
export function computeSquadCost(state: GameState): SquadCostBreakdown {
  let wageBill = 0;
  let signingAmortisation = 0;

  for (const player of state.squad) {
    wageBill += player.contract.salary;
    if (player.acquisition !== undefined) {
      signingAmortisation +=
        player.acquisition.fee / player.acquisition.contractYears;
    }
  }

  wageBill = roundMoney(wageBill);
  signingAmortisation = roundMoney(signingAmortisation);
  const total = roundMoney(
    wageBill + state.config.baselineAmortisation + signingAmortisation,
  );

  return {
    wageBill,
    baselineAmortisation: state.config.baselineAmortisation,
    signingAmortisation,
    total,
    cap: roundMoney(state.config.squadCostCapBase * SCR_LIMIT),
    ratio: Math.round((total / state.config.squadCostCapBase) * 1000) / 1000,
  };
}

/**
 * Validates the squad cost ratio.
 *
 * @param state - The current game state.
 * @returns A violation when squad cost exceeds the cap; otherwise empty.
 */
export function validateScr(state: GameState): Violation[] {
  const cost = computeSquadCost(state);
  if (cost.total <= cost.cap) {
    return [];
  }
  return [
    {
      code: 'SCR_EXCEEDED',
      message: `Squad cost EUR ${String(cost.total)}m is ${String(Math.round(cost.ratio * 100))}% of the cap basis; the limit is ${String(Math.round(SCR_LIMIT * 100))}%`,
    },
  ];
}

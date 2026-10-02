/**
 * Loans agreed during the game (Sam, 02/10/2026): what one costs the
 * borrowing club, and when the player comes back.
 */
import { LOAN_FEE_SHARE } from '../constants';
import { roundMoney } from '../money';
import { currentWindow } from '../state';
import type { GameState, SquadPlayer } from '../types';

/**
 * The fee for loaning a player out now: 15% of his sale value.
 *
 * @param player - The squad player.
 * @returns The loan fee in EUR m, rounded to the engine's money precision.
 */
export function loanFee(player: Pick<SquadPlayer, 'saleValue'>): number {
  return roundMoney(player.saleValue * LOAN_FEE_SHARE);
}

/**
 * The window a loan agreed now ends in: the first window of the next
 * season. A loan runs to the end of the season it starts in, so from
 * January 2027 he is back for Summer 2027; from Summer 2027 or January
 * 2028 he is back in Summer 2028, after the game's last window, which is
 * reported as the index just past it.
 *
 * @param state - The game state when the loan is agreed.
 * @returns Index of the window he rejoins the squad in.
 */
export function loanReturnWindow(state: GameState): number {
  const season = currentWindow(state).seasonStartYear;
  const next = state.config.windows.findIndex(
    (window, index) => index > state.windowIndex && window.seasonStartYear > season,
  );
  return next === -1 ? state.config.windows.length : next;
}

/**
 * Whether the board will sanction a player's sale right now.
 *
 * A lock is not necessarily for the whole game. The board protects the
 * spine through the opening window and then listens to offers, so
 * "locked" is a question about a player AND a window, never about a
 * player alone.
 */
import type { SquadPlayer } from '../types';

/**
 * Whether a player is unsellable in the given window.
 *
 * @param player - The squad player.
 * @param windowIndex - Index of the window being played.
 * @returns True when the board still refuses to sanction a sale.
 */
export function isLocked(
  player: Pick<SquadPlayer, 'locked' | 'unlocksInWindow'>,
  windowIndex: number,
): boolean {
  if (!player.locked) {
    return false;
  }
  return (
    player.unlocksInWindow === undefined || windowIndex < player.unlocksInWindow
  );
}

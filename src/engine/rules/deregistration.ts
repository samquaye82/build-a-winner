/**
 * Deregistration: leaving a squad player off a competition's registration
 * list without selling him (Sam, 02/10/2026).
 *
 * Clubs really do this to make a squad comply. The player stays under
 * contract, so his wage and any amortisation stay in the squad cost, but
 * he is outside that competition's registration rules. Off the Premier
 * League list he cannot play either: he is left out of the XI, squad
 * quality, balance and the season projection, though still counted in
 * contract health, age profile and value.
 *
 * It is not free. A window that closes with a player still off any list
 * penalises him once per game: his value drops by DEREGISTRATION_VALUE_DROP
 * and the final score loses DEREGISTRATION_SCORE_PENALTY points of value
 * created. Putting him back or selling him before the window closes avoids
 * both; putting him back later does not refund them. The game's end is the
 * final window's close, so a player still off a list then is penalised too.
 */
import { DEREGISTRATION_VALUE_DROP } from '../constants';
import { roundMoney } from '../money';
import type { Competition, GameState, SquadPlayer } from '../types';

/**
 * Whether a player is registered for a competition.
 *
 * @param player - A squad player.
 * @param competition - The competition.
 * @returns False only when he has been left off that competition's list.
 */
export function isRegisteredFor(
  player: Pick<SquadPlayer, 'deregisteredFrom'>,
  competition: Competition,
): boolean {
  return !(player.deregisteredFrom ?? []).includes(competition);
}

/**
 * The part of a squad registered for a competition, in squad order. For the
 * Premier League these are also the players who can play.
 *
 * @param squad - The squad.
 * @param competition - The competition.
 * @returns The registered players.
 */
export function registeredFor<T extends Pick<SquadPlayer, 'deregisteredFrom'>>(
  squad: readonly T[],
  competition: Competition,
): T[] {
  return squad.filter((player) => isRegisteredFor(player, competition));
}

/**
 * Whether a player is off any list.
 *
 * @param player - A squad player.
 * @returns True when he has been left off at least one competition.
 */
export function isDeregistered(
  player: Pick<SquadPlayer, 'deregisteredFrom'>,
): boolean {
  return (player.deregisteredFrom ?? []).length > 0;
}

/**
 * A player's base value after the deregistration drop.
 *
 * @param baseValue - His base value before it.
 * @returns The reduced value, rounded to the engine's money precision.
 */
export function droppedValue(baseValue: number): number {
  return roundMoney(baseValue * (1 - DEREGISTRATION_VALUE_DROP));
}

/**
 * Whether a squad player is due the deregistration penalty at the close of
 * the current window: still off a list, and not already penalised this
 * game.
 *
 * @param state - The game state at the close.
 * @param player - A squad player.
 * @returns True when the close penalises him.
 */
export function isDuePenalty(state: GameState, player: SquadPlayer): boolean {
  return (
    isDeregistered(player) &&
    !state.deregistrationPenalties.includes(player.id)
  );
}

/**
 * Closes the current window for deregistration purposes: every player due
 * the penalty loses DEREGISTRATION_VALUE_DROP of his base value and is
 * recorded as penalised. Called when a window is submitted, before
 * progression, so the drop is in place before value drift.
 *
 * @param state - The game state at the close.
 * @returns The state with the penalties applied.
 */
export function penaliseDeregistrations(state: GameState): GameState {
  const due = state.squad.filter((player) => isDuePenalty(state, player));
  if (due.length === 0) {
    return state;
  }
  const dueIds = new Set(due.map((player) => player.id));
  return {
    ...state,
    squad: state.squad.map((player) =>
      dueIds.has(player.id)
        ? { ...player, baseValue: droppedValue(player.baseValue) }
        : player,
    ),
    deregistrationPenalties: [
      ...state.deregistrationPenalties,
      ...due.map((player) => player.id),
    ],
  };
}

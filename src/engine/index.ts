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
 * and recompute the score independently.
 *
 * Modules (arriving in M1 and M2):
 *   - types.ts        Player, Contract, WindowState, GameState, Action
 *   - actions.ts      buy / sell / renew reducers
 *   - rules/          registration, budget, and squad cost ratio validation
 *   - progression.ts  deterministic between-window ageing, value shifts and
 *                     market evolution
 *   - scoring.ts      final squad rating (designed in M3)
 */

/**
 * Version of the engine's rules and data model.
 *
 * Bump whenever a rules change would make scores incomparable with earlier
 * versions; a future leaderboard must only compare like-for-like versions.
 */
export const ENGINE_VERSION = '0.1.0';

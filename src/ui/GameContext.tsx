/**
 * Game state provider: the single bridge between React and the engine.
 *
 * Components read GameState and dispatch engine Actions; every rule lives in
 * the engine. The provider's only responsibilities are holding the state and
 * routing actions through applyAction.
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  applyAction,
  createGame,
  EngineError,
  type Action,
  type GameConfig,
  type GameState,
} from '../engine';

interface GameContextValue {
  state: GameState;
  /** Applies an engine action; returns false if the engine rejected it. */
  dispatch: (action: Action) => boolean;
}

const GameContext = createContext<GameContextValue | null>(null);

/**
 * Provides game state to the component tree.
 *
 * @param props.config - The playthrough configuration.
 * @param props.children - The application tree.
 * @returns The provider element.
 */
export function GameProvider({
  config,
  children,
}: {
  config: GameConfig;
  children: React.ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<GameState>(() => createGame(config));

  const dispatch = useCallback((action: Action): boolean => {
    let accepted = true;
    setState((current) => {
      try {
        return applyAction(current, action);
      } catch (error) {
        // UI guards should make engine rejections unreachable; surface any
        // that slip through rather than swallowing them.
        if (error instanceof EngineError) {
          console.error(`Engine rejected ${action.type}: ${error.message}`);
          accepted = false;
          return current;
        }
        throw error;
      }
    });
    return accepted;
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

/**
 * Accesses the game state and dispatcher.
 *
 * @returns The context value.
 * @throws {Error} If used outside a GameProvider.
 */
export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (value === null) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return value;
}

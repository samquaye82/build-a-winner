/**
 * Root application component.
 *
 * Placeholder shell for M0. The real UI (transfer window screens, constraint
 * dashboard, pick-your-XI phase, end screen) arrives in M4, after the engine
 * is complete and the visual design has been agreed.
 */
import { ENGINE_VERSION } from '../engine';

/**
 * Renders the application shell.
 *
 * @returns The root React element for the game.
 */
export function App(): React.JSX.Element {
  return (
    <main>
      <h1>Sporting Director Game</h1>
      <p>Engine v{ENGINE_VERSION}. UI under construction.</p>
    </main>
  );
}

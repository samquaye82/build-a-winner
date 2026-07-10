/**
 * Root application component: wires the game provider to the three UI
 * phases. The engine owns all rules; this component only decides which
 * screen is showing.
 *
 * Phases: 'window' (the three transfer windows) -> 'xi' (squad selection,
 * final window only, can return to the window) -> 'end' (rating).
 */
import { useState } from 'react';
import { devConfig } from '../data/devConfig';
import { GameProvider } from './GameContext';
import { EndScreen } from './components/EndScreen';
import { Masthead } from './components/Masthead';
import { WindowScreen } from './components/WindowScreen';
import { XIScreen } from './components/XIScreen';
import './styles/app.css';

type Phase = 'window' | 'xi' | 'end';

/** Masthead context labels for the non-window phases. */
const PHASE_LABELS: Partial<Record<Phase, string>> = {
  xi: 'Pick your XI',
  end: 'Final rating',
};

/**
 * Renders the application.
 *
 * @returns The root React element for the game.
 */
export function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('window');

  return (
    <GameProvider config={devConfig}>
      <Masthead phaseLabel={PHASE_LABELS[phase]} />
      {phase === 'window' && (
        <WindowScreen
          onEnterXI={() => {
            setPhase('xi');
          }}
        />
      )}
      {phase === 'xi' && (
        <XIScreen
          onBack={() => {
            setPhase('window');
          }}
          onConfirmed={() => {
            setPhase('end');
          }}
        />
      )}
      {phase === 'end' && <EndScreen />}
    </GameProvider>
  );
}

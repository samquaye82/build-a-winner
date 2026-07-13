/**
 * Root application component: wires the game provider to the UI phases.
 * The engine owns all rules; this component only decides which screen is
 * showing.
 *
 * Phases: 'start' (landing / rules) -> 'window' (the three transfer
 * windows) -> 'summary' (the one interim review, after Summer 2026) -> 'xi'
 * (squad selection, can return to the window) -> 'end' (rating).
 */
import { useState } from 'react';
import { realConfig } from '../data/realConfig';
import { GameProvider } from './GameContext';
import { EndScreen } from './components/EndScreen';
import { LandingScreen } from './components/LandingScreen';
import { Masthead } from './components/Masthead';
import { SummaryScreen } from './components/SummaryScreen';
import { WindowScreen } from './components/WindowScreen';
import { XIScreen } from './components/XIScreen';
import './styles/app.css';

type Phase = 'start' | 'window' | 'summary' | 'xi' | 'end';

/** Masthead context labels for the non-window phases. */
const PHASE_LABELS: Partial<Record<Phase, string>> = {
  summary: 'Window review',
  xi: 'Pick your XI',
  end: 'Final rating',
};

/**
 * Renders the application.
 *
 * @returns The root React element for the game.
 */
export function App(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('start');
  // Remounting the provider with a fresh key rebuilds the game from
  // scratch: the whole reset mechanism.
  const [gameKey, setGameKey] = useState(0);

  function reset(): void {
    if (globalThis.confirm('Start again? All three windows will be reset.')) {
      setGameKey((key) => key + 1);
      setPhase('start');
    }
  }

  // The landing screen sits outside the game chrome: no masthead, no
  // mounted game until the player starts.
  if (phase === 'start') {
    return (
      <LandingScreen
        onStart={() => {
          setPhase('window');
        }}
      />
    );
  }

  return (
    <GameProvider key={gameKey} config={realConfig}>
      <Masthead phaseLabel={PHASE_LABELS[phase]} onReset={reset} />
      {phase === 'window' && (
        <WindowScreen
          onEnterXI={() => {
            setPhase('xi');
          }}
          onReviewWindow={() => {
            setPhase('summary');
          }}
        />
      )}
      {phase === 'summary' && (
        <SummaryScreen
          onContinue={() => {
            setPhase('window');
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

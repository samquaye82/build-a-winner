/**
 * End screen placeholder: shows the rating so the M4 flow is complete
 * end to end. M5 replaces this with the full dark-red shareable design
 * (design.md §7).
 */
import { scoreGame } from '../../engine';
import { useGame } from '../GameContext';

/**
 * Renders the placeholder end screen.
 *
 * @returns The end screen element.
 */
export function EndScreen(): React.JSX.Element {
  const { state } = useGame();
  const breakdown = scoreGame(state);

  return (
    <main className="page">
      <span className="pill">Final rating</span>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 72, margin: '8px 0' }}>
        {breakdown.total}/100
      </h2>
      <p className="intro">
        Squad quality {breakdown.squadQuality.score} · Balance{' '}
        {breakdown.balance.score} · Age {breakdown.ageProfile.score} · Contracts{' '}
        {breakdown.contractHealth.score} · Value created{' '}
        {breakdown.valueCreated.score}
      </p>
      <p className="intro">Full end screen arrives with M5.</p>
    </main>
  );
}

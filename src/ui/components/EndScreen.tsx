/**
 * The final rating screen (design.md §7): the one dark, dramatic screen.
 * Deep red backdrop, gold hero rating, component bars, the story of the
 * three windows, the chosen XI on a mini pitch, and a share action.
 */
import { useState } from 'react';
import {
  ENGINE_VERSION,
  FORMATIONS,
  scoreGame,
  type ScoreBreakdown,
} from '../../engine';
import { useGame } from '../GameContext';
import { buildShareText, endSummary, formatMoney } from '../helpers';
import { initials, SLOT_COORDS } from './pitchLayout';

/** Display rows for the five score components, in weight order. */
function componentRows(b: ScoreBreakdown): { label: string; score: number }[] {
  return [
    { label: 'Squad quality', score: b.squadQuality.score },
    { label: 'Balance', score: b.balance.score },
    { label: 'Age profile', score: b.ageProfile.score },
    { label: 'Contract health', score: b.contractHealth.score },
    { label: 'Value created', score: b.valueCreated.score },
  ];
}

/**
 * Renders the end screen.
 *
 * @returns The end screen element.
 */
export function EndScreen(): React.JSX.Element {
  const { state } = useGame();
  const [shared, setShared] = useState(false);
  const breakdown = scoreGame(state);
  const summary = endSummary(state);

  const xi = state.xi;
  const formation = xi === undefined ? undefined : FORMATIONS[xi.formationId];
  const coords = xi === undefined ? undefined : SLOT_COORDS[xi.formationId];
  const byId = new Map(state.squad.map((p) => [p.id, p]));

  /** Shares via the Web Share API, falling back to the clipboard. */
  async function share(): Promise<void> {
    const text = buildShareText(state, breakdown);

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        setShared(true);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // The player closed the share sheet; not a failure.
          return;
        }
        // Desktop browsers often expose navigator.share but refuse to open
        // a sheet; fall through to the clipboard instead.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
    } catch {
      // Clipboard refused (permissions); the button simply stays unchanged.
    }
  }

  return (
    <div className="end-screen">
      <main className="page">
        <div className="end-hero">
          <span className="end-label">Final rating</span>
          <div className="end-rating">{breakdown.total}</div>
          <span className="end-outof">/ 100</span>
        </div>

        <div className="end-bars">
          {componentRows(breakdown).map((row) => (
            <div key={row.label} className="end-bar-row">
              <span className="end-bar-label">{row.label}</span>
              <div className="end-bar-track">
                <span style={{ width: `${String(row.score)}%` }} />
              </div>
              <span className="end-bar-value">{row.score}</span>
            </div>
          ))}
        </div>

        <div className="end-stats">
          <div className="end-stat">
            <span className="label">Net spend</span>
            <span className="value">{formatMoney(summary.netSpend)}</span>
            <span className="sub">
              {summary.signings} in · {summary.sales} out
            </span>
          </div>
          <div className="end-stat">
            <span className="label">Squad value</span>
            <span className="value">{formatMoney(summary.squadValue)}</span>
          </div>
          <div className="end-stat">
            <span className="label">Funds left</span>
            <span className="value">{formatMoney(summary.fundsLeft)}</span>
          </div>
          <div className="end-stat">
            <span className="label">Lost on frees</span>
            <span className="value">{summary.freeExits.length}</span>
            {summary.freeExits.length > 0 && (
              <span className="sub">{summary.freeExits.join(', ')}</span>
            )}
          </div>
        </div>

        {formation !== undefined && coords !== undefined && xi !== undefined && (
          <>
            <div className="end-xi-label">Your XI · {xi.formationId}</div>
            <div className="pitch pitch-mini">
              {formation.slots.map((slot, index) => {
                const [x, y] = coords[index] ?? [50, 50];
                const player = byId.get(xi.playerIds[index] ?? '');
                return (
                  <div
                    key={`${xi.formationId}-${String(index)}`}
                    className="slot filled"
                    style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
                  >
                    <span className="roundel">
                      {player === undefined ? slot.label : initials(player.name)}
                    </span>
                    <span className="slot-name">
                      {player?.name.split(' ').pop() ?? slot.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="end-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              void share();
            }}
          >
            {shared ? '✓ Copied · share it' : 'Share your window'}
          </button>
        </div>

        <p className="end-footnote">
          Deterministic rating · engine v{ENGINE_VERSION}. Same decisions,
          same score, every time.
        </p>
      </main>
    </div>
  );
}

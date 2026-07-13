/**
 * The final rating screen (design.md §7): the one dark, dramatic screen.
 * Deep red backdrop, gold hero rating, component bars, the story of the
 * three windows, the chosen XI on a mini pitch, and a share action.
 */
import { useState } from 'react';
import {
  ENGINE_VERSION,
  FORMATIONS,
  MIN_VIABLE_SQUAD_SIZE,
  scoreGame,
  UNVIABLE_SQUAD_MAX_SCORE,
} from '../../engine';
import { useGame } from '../GameContext';
import {
  buildShareText,
  endSummary,
  formatMoney,
  groupByPosition,
  POSITION_LABELS,
  scoreComponentRows,
  verdict,
} from '../helpers';
import { initials, SLOT_COORDS } from './pitchLayout';

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
          <p className="end-verdict">{verdict(breakdown.total)}</p>
          {breakdown.squadSizeCapped && (
            <p className="end-cap-note">
              Squad below {MIN_VIABLE_SQUAD_SIZE} players: not fit for
              purpose, so your rating is capped at {UNVIABLE_SQUAD_MAX_SCORE}
              {breakdown.rawTotal > breakdown.total
                ? ` (${String(breakdown.rawTotal)} before the cap).`
                : '.'}
            </p>
          )}
        </div>

        <div className="end-bars">
          {scoreComponentRows(breakdown).map((row) => (
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
          <div className="end-team">
            <div className="end-team-xi">
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
            </div>

            <div className="end-team-depth">
              <div className="end-xi-label">The rest of the squad</div>
              <div className="end-squad">
                {groupByPosition(
                  state.squad.filter((p) => !xi.playerIds.includes(p.id)),
                ).map(([position, group]) => (
                  <div className="end-squad-group" key={position}>
                    <span className="end-squad-pos">
                      {POSITION_LABELS[position]}
                    </span>
                    <div className="end-squad-players">
                      {group.map((player) => (
                        <span className="end-squad-player" key={player.id}>
                          <b>{player.quality}</b> {player.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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

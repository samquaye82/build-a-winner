/**
 * The interim window review (Sam, 13/07/2026): a read-only checkpoint shown
 * once, after the Summer 2026 window is submitted and before it advances.
 *
 * It borrows the end screen's chrome (dark hero, component bars, the story
 * of the window, a squad overview) but never picks an XI: the rating is
 * provisional, computed against an auto-picked best eleven. The final rating
 * still comes from the player's own XI at the end of the game. The single
 * Continue button commits the window and moves the game on.
 */
import {
  currentWindow,
  EngineError,
  scoreProvisional,
  type ScoreBreakdown,
} from '../../engine';
import { useGame } from '../GameContext';
import {
  endSummary,
  formatMoney,
  groupByPosition,
  POSITION_LABELS,
  scoreComponentRows,
} from '../helpers';

/**
 * Renders the interim window-review screen.
 *
 * @param props.onContinue - Called after the window is committed, to navigate
 *   the app on to the next window screen.
 * @returns The summary screen element.
 */
export function SummaryScreen({
  onContinue,
}: {
  onContinue: () => void;
}): React.JSX.Element {
  const { state, dispatch } = useGame();
  const window = currentWindow(state);
  const nextWindow = state.config.windows[state.windowIndex + 1];
  const summary = endSummary(state);

  // The provisional rating needs a fillable XI. A legal squad can, in
  // principle, lack the bodies to field any formation (e.g. no striker
  // registered); degrade to the overview rather than crash the review.
  let breakdown: ScoreBreakdown | undefined;
  try {
    breakdown = scoreProvisional(state);
  } catch (error) {
    if (!(error instanceof EngineError)) {
      throw error;
    }
  }

  return (
    <div className="end-screen summary-screen">
      <main className="page">
        <div className="end-hero">
          <span className="end-label">{window.label} review</span>
          <div className="end-rating">{breakdown?.total ?? '—'}</div>
          <span className="end-outof">/ 100 provisional</span>
          <p className="end-verdict">
            {breakdown === undefined
              ? 'Your squad cannot yet field a full XI, so a provisional rating is not available. Review your squad below before continuing.'
              : 'A snapshot of where the squad stands. This provisional rating uses a best available eleven; your final rating comes from the XI you pick at the end.'}
          </p>
        </div>

        {breakdown !== undefined && (
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
        )}

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
            <span className="label">Squad size</span>
            <span className="value">{state.squad.length}</span>
          </div>
        </div>

        <div>
          <div className="end-xi-label">Your squad</div>
          <div className="end-squad">
            {groupByPosition(state.squad).map(([position, group]) => (
              <div className="end-squad-group" key={position}>
                <span className="end-squad-pos">{POSITION_LABELS[position]}</span>
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

        <div className="end-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              // Advancing is one-way: this is the real commit point for the
              // window the review covers.
              dispatch({ type: 'ADVANCE_WINDOW' });
              onContinue();
            }}
          >
            Continue to {nextWindow?.label ?? 'the next window'} ▸
          </button>
        </div>
      </main>
    </div>
  );
}

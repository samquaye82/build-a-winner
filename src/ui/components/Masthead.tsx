/**
 * The red masthead: wordmark plus current window context (design.md §3).
 */
import { currentWindow } from '../../engine';
import { useGame } from '../GameContext';

/**
 * Renders the masthead bar.
 *
 * @param props.phaseLabel - Optional override for the right-hand context,
 *   e.g. "Pick your XI" once the windows are done.
 * @param props.onReset - Starts the whole game again (confirmed upstream).
 * @returns The masthead element.
 */
export function Masthead({
  phaseLabel,
  onReset,
}: {
  phaseLabel?: string;
  onReset: () => void;
}): React.JSX.Element {
  const { state } = useGame();
  const window = currentWindow(state);
  const context =
    phaseLabel ??
    `${window.label} · Window ${String(state.windowIndex + 1)} of ${String(state.config.windows.length)}`;

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <span className="wordmark">Build a Winner</span>
        <span className="masthead-right">
          <span className="window-context">{context}</span>
          <button type="button" className="reset-btn" onClick={onReset}>
            ↺ Reset
          </button>
        </span>
      </div>
    </header>
  );
}

/**
 * The main transfer-window screen: intro, constraint dashboard, tabbed
 * squad / market / renewals lists with position filters, and the submit
 * footer that advances the window (or hands over to the XI phase).
 */
import { useState } from 'react';
import { currentWindow, isSubmittable, type Position } from '../../engine';
import { useGame } from '../GameContext';
import { groupByPosition, POSITION_LABELS, POSITION_ORDER } from '../helpers';
import { Dashboard } from './Dashboard';
import { MarketCard, RenewalCard, SoldCard, SquadCard } from './PlayerCards';

type Tab = 'squad' | 'market' | 'renewals';

/**
 * Renders the window screen.
 *
 * @param props.onEnterXI - Called when the final window is submitted and
 *   the game moves to squad selection.
 * @returns The window screen element.
 */
export function WindowScreen({ onEnterXI }: { onEnterXI: () => void }): React.JSX.Element {
  const { state, dispatch } = useGame();
  const [tab, setTab] = useState<Tab>('squad');
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');

  const window = currentWindow(state);
  const isFinalWindow = state.windowIndex === state.config.windows.length - 1;
  const submittable = isSubmittable(state);
  const nextWindow = state.config.windows[state.windowIndex + 1];

  const soldThisWindow = state.departed.filter(
    (d) => d.reason === 'sold' && d.windowIndex === state.windowIndex,
  );

  const byFilter = <T extends { position: Position }>(players: readonly T[]): T[] =>
    filter === 'ALL' ? [...players] : players.filter((p) => p.position === filter);

  return (
    <main className="page">
      <p className="intro">
        You are the Sporting Director. Plan all three windows in one sitting:
        buy, sell and renew under the registration rules and the squad cost
        ratio. Contracts tick down between windows; unrenewed, unsold deals
        walk for free when the season turns.
      </p>

      <Dashboard />

      <div className="window-footer">
        {isFinalWindow ? (
          <button type="button" className="btn-primary" disabled={!submittable} onClick={onEnterXI}>
            Submit squad → pick your XI ▸
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={!submittable}
            onClick={() => {
              // Advancing is one-way; make the player mean it.
              if (
                globalThis.confirm(
                  `Submit ${window.label}? You cannot reopen this window.`,
                )
              ) {
                dispatch({ type: 'ADVANCE_WINDOW' });
              }
            }}
          >
            Submit window → {nextWindow?.label ?? ''} ▸
          </button>
        )}
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          className={tab === 'squad' ? 'active' : ''}
          onClick={() => setTab('squad')}
        >
          Current Squad ({state.squad.length})
        </button>
        <button
          type="button"
          className={tab === 'market' ? 'active' : ''}
          onClick={() => setTab('market')}
        >
          Transfer Market ({state.market.length})
        </button>
        <button
          type="button"
          className={tab === 'renewals' ? 'active' : ''}
          onClick={() => setTab('renewals')}
        >
          Renewals
        </button>
      </div>

      <div className="filters">
        <button
          type="button"
          className={filter === 'ALL' ? 'active' : ''}
          onClick={() => setFilter('ALL')}
        >
          All
        </button>
        {POSITION_ORDER.map((position) => (
          <button
            key={position}
            type="button"
            className={filter === position ? 'active' : ''}
            onClick={() => setFilter(position)}
          >
            {position}
          </button>
        ))}
      </div>

      {tab === 'squad' && (
        <>
          {groupByPosition(byFilter(state.squad)).map(([position, group]) => (
            <section key={position}>
              <span className="pill">{POSITION_LABELS[position]}</span>
              <div className="card-grid">
                {group.map((player) => (
                  <SquadCard key={player.id} player={player} />
                ))}
              </div>
            </section>
          ))}
          {soldThisWindow.length > 0 && (
            <section>
              <span className="pill">Sold this window</span>
              <div className="card-grid">
                {soldThisWindow.map((d) => (
                  <SoldCard key={d.player.id} player={d.player} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'market' &&
        groupByPosition(byFilter(state.market)).map(([position, group]) => (
          <section key={position}>
            <span className="pill">{POSITION_LABELS[position]}</span>
            <div className="card-grid">
              {group.map((player) => (
                <MarketCard key={player.id} player={player} />
              ))}
            </div>
          </section>
        ))}

      {tab === 'renewals' &&
        groupByPosition(byFilter(state.squad)).map(([position, group]) => (
          <section key={position}>
            <span className="pill">{POSITION_LABELS[position]}</span>
            <div className="card-grid">
              {group.map((player) => (
                <RenewalCard key={player.id} player={player} />
              ))}
            </div>
          </section>
        ))}
    </main>
  );
}

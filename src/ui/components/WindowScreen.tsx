/**
 * The main transfer-window screen: intro, constraint dashboard, tabbed
 * squad / market / renewals lists with position filters, and the submit
 * footer that advances the window (or hands over to the XI phase).
 */
import { useState } from 'react';
import { currentWindow, isSubmittable, type Position } from '../../engine';
import { CITY_SANCTION } from '../../data/citySanction';
import { useGame } from '../GameContext';
import { POSITION_ORDER } from '../helpers';
import { Dashboard } from './Dashboard';
import { MarketBrowser } from './MarketBrowser';
import { AcademyList } from './AcademyList';
import { RenewalsList } from './RenewalsList';
import { SquadList } from './SquadList';

type Tab = 'squad' | 'market' | 'academy' | 'renewals';

/**
 * Renders the window screen.
 *
 * @param props.onEnterXI - Called when the final window is submitted and
 *   the game moves to squad selection.
 * @param props.onSanctionNews - Called after advancing into the window the
 *   Manchester City sanction starts in, to break the news.
 * @returns The window screen element.
 */
export function WindowScreen({
  onEnterXI,
  onSanctionNews,
}: {
  onEnterXI: () => void;
  onSanctionNews: () => void;
}): React.JSX.Element {
  const { state, dispatch } = useGame();
  const [tab, setTab] = useState<Tab>('squad');
  const [filter, setFilter] = useState<Position | 'ALL'>('ALL');

  const window = currentWindow(state);
  const isFinalWindow = state.windowIndex === state.config.windows.length - 1;
  const submittable = isSubmittable(state);
  const nextWindow = state.config.windows[state.windowIndex + 1];

  return (
    <main className="page game-page window-page">
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
            Submit final squad ▸
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
                // The City sanction is announced as its window opens.
                if (nextWindow?.id === CITY_SANCTION.fromWindowId) {
                  onSanctionNews();
                }
              }
            }}
          >
            Submit {window.label} ▸
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
          className={tab === 'academy' ? 'active' : ''}
          onClick={() => setTab('academy')}
        >
          Academy ({state.academy.length})
        </button>
        <button
          type="button"
          className={tab === 'renewals' ? 'active' : ''}
          onClick={() => setTab('renewals')}
        >
          Renewals
        </button>
      </div>

      {tab !== 'market' && (
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
      )}

      {tab === 'squad' && <SquadList filter={filter} />}

      {tab === 'market' && <MarketBrowser />}

      {tab === 'academy' && <AcademyList filter={filter} />}

      {tab === 'renewals' && <RenewalsList filter={filter} />}
    </main>
  );
}

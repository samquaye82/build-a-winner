/**
 * The market browser (Sam's interaction model, 11/07/2026): dropdown
 * filters and search over the full market, a compact ranked result list,
 * and a detail card revealed on click where the buy decision happens.
 */
import { useEffect, useRef, useState } from 'react';
import { type MarketPlayer, type Position } from '../../engine';
import { useGame } from '../GameContext';
import {
  clubsIn,
  EMPTY_FILTERS,
  filterMarket,
  formatMoney,
  LEAGUE_LABELS,
  leaguesIn,
  POSITION_ORDER,
  type MarketFilters,
} from '../helpers';
import { MarketCard } from './PlayerCards';

/** One compact result row. */
function ResultRow({
  player,
  selected,
  onSelect,
}: {
  player: MarketPlayer;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`market-row${selected ? ' active' : ''}${player.locked === true ? ' row-locked' : ''}`}
      onClick={onSelect}
    >
      <span className="q">{player.quality}</span>
      <span className="market-row-name">
        {player.name}
        {player.locked === true ? ' 🔒' : ''}
      </span>
      <span className="market-row-meta">
        {player.position} · {player.age} · {player.club ?? ''}
      </span>
      <span className="market-row-fee">
        {player.fee === 0 ? 'Free' : formatMoney(player.fee)}
      </span>
    </button>
  );
}

/**
 * Renders the market browser.
 *
 * @returns The browser element.
 */
export function MarketBrowser(): React.JSX.Element {
  const { state } = useGame();
  const [filters, setFilters] = useState<MarketFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const { results, total } = filterMarket(state.market, filters);
  const selected =
    selectedId === null
      ? undefined
      : state.market.find((p) => p.id === selectedId);

  // The revealed card must actually be seen (Sam's below-the-fold note).
  useEffect(() => {
    if (selected !== undefined) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selected]);

  function update(partial: Partial<MarketFilters>): void {
    setFilters((current) => ({ ...current, ...partial }));
    setSelectedId(null);
  }

  return (
    <section>
      <div className="market-controls">
        <input
          type="search"
          placeholder="Search players…"
          value={filters.query}
          onChange={(event) => {
            update({ query: event.target.value });
          }}
          aria-label="Search players"
        />
        <select
          value={filters.league}
          onChange={(event) => {
            update({ league: event.target.value, club: 'ALL' });
          }}
          aria-label="League"
        >
          <option value="ALL">All leagues</option>
          {leaguesIn(state.market).map((league) => (
            <option key={league} value={league}>
              {LEAGUE_LABELS[league] ?? league}
            </option>
          ))}
        </select>
        <select
          value={filters.club}
          onChange={(event) => {
            update({ club: event.target.value });
          }}
          aria-label="Club"
        >
          <option value="ALL">All clubs</option>
          {clubsIn(state.market, filters.league).map((club) => (
            <option key={club} value={club}>
              {club}
            </option>
          ))}
        </select>
        <select
          value={filters.position}
          onChange={(event) => {
            update({ position: event.target.value as Position | 'ALL' });
          }}
          aria-label="Position"
        >
          <option value="ALL">All positions</option>
          {POSITION_ORDER.map((position) => (
            <option key={position} value={position}>
              {position}
            </option>
          ))}
        </select>
      </div>

      {selected !== undefined && (
        <div className="market-detail" ref={detailRef}>
          <MarketCard player={selected} onBought={() => { setSelectedId(null); }} />
        </div>
      )}

      <p className="market-count">
        {total === 0
          ? 'No players match. Loosen the filters.'
          : total > results.length
            ? `Showing the top ${String(results.length)} of ${String(total)} matches by rating. Refine to narrow.`
            : `${String(total)} match${total === 1 ? '' : 'es'}.`}
      </p>

      <div className="market-results">
        {results.map((player) => (
          <ResultRow
            key={player.id}
            player={player}
            selected={player.id === selectedId}
            onSelect={() => {
              setSelectedId(player.id === selectedId ? null : player.id);
            }}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The market browser (Sam's interaction model, 11/07/2026): dropdown
 * filters and search over the full market, a compact ranked result list in
 * pages of MARKET_PAGE_SIZE, and a detail card revealed on click where the
 * buy decision happens. Age and maximum-fee filters and the pages added
 * 03/10/2026; since 04/10/2026 the card opens directly beneath its row.
 */
import { useState } from 'react';
import { type Position } from '../../engine';
import { useGame } from '../GameContext';
import {
  clubsIn,
  EMPTY_FILTERS,
  filterMarket,
  formatMoney,
  LEAGUE_LABELS,
  leaguesIn,
  MARKET_AGE_BANDS,
  MARKET_FEE_LIMITS,
  MARKET_PAGE_SIZE,
  POSITION_ORDER,
  type MarketFilters,
} from '../helpers';
import { MarketCard } from './PlayerCards';
import { PlayerRow } from './PlayerRow';

/**
 * Renders the market browser.
 *
 * @returns The browser element.
 */
export function MarketBrowser(): React.JSX.Element {
  const { state } = useGame();
  const [filters, setFilters] = useState<MarketFilters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const { results, total, page: shownPage, pageCount } = filterMarket(
    state.market,
    filters,
    MARKET_PAGE_SIZE,
    page,
  );
  function update(partial: Partial<MarketFilters>): void {
    setFilters((current) => ({ ...current, ...partial }));
    // New filters mean a new list: start it from the top.
    setPage(0);
    setSelectedId(null);
  }

  function goToPage(next: number): void {
    setPage(next);
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
        <select
          value={filters.age}
          onChange={(event) => {
            update({ age: event.target.value });
          }}
          aria-label="Age"
        >
          <option value="ALL">All ages</option>
          {MARKET_AGE_BANDS.map((band) => (
            <option key={band.id} value={band.id}>
              {band.label}
            </option>
          ))}
        </select>
        <select
          value={filters.maxFee === null ? 'ALL' : String(filters.maxFee)}
          onChange={(event) => {
            const { value } = event.target;
            update({ maxFee: value === 'ALL' ? null : Number(value) });
          }}
          aria-label="Maximum fee"
        >
          <option value="ALL">Any price</option>
          {MARKET_FEE_LIMITS.map((limit) => (
            <option key={limit} value={String(limit)}>
              {limit === 0 ? 'Free only' : `Up to ${formatMoney(limit)}`}
            </option>
          ))}
        </select>
      </div>

      <p className="market-count">
        {total === 0
          ? 'No players match. Loosen the filters.'
          : `${total.toLocaleString('en-GB')} match${total === 1 ? '' : 'es'}, best rated first.`}
      </p>

      <div className="player-rows">
        {results.map((player) => (
          <PlayerRow
            key={player.id}
            quality={player.quality}
            name={player.name}
            locked={player.locked === true}
            meta={`${player.position} · ${String(player.age)} · ${player.club ?? ''}`}
            price={player.fee === 0 ? 'Free' : formatMoney(player.fee)}
            open={player.id === selectedId}
            onToggle={() => {
              setSelectedId(player.id === selectedId ? null : player.id);
            }}
          >
            <MarketCard
              player={player}
              onBought={() => {
                setSelectedId(null);
              }}
            />
          </PlayerRow>
        ))}
      </div>

      {pageCount > 1 && (
        <nav className="market-pages" aria-label="Market pages">
          <button
            type="button"
            className="btn-secondary"
            disabled={shownPage === 0}
            onClick={() => {
              goToPage(shownPage - 1);
            }}
          >
            ◂ Previous
          </button>
          <span className="market-page-label">
            Page {shownPage + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={shownPage === pageCount - 1}
            onClick={() => {
              goToPage(shownPage + 1);
            }}
          >
            Next ▸
          </button>
        </nav>
      )}
    </section>
  );
}

/**
 * The squad tab as a list (Sam, 04/10/2026), in the transfer market's
 * style: one compact row per player, the full card opening directly
 * beneath the row that was clicked. Players sold this window and players
 * away on loan come first, then the squad under its position headings,
 * each group by rating and then sale value.
 */
import { isLocked, type Position } from '../../engine';
import { useGame } from '../GameContext';
import { formatMoney, loanReturnLabel } from '../helpers';
import { Badges, LoanedOutCard, SoldCard, SquadCard } from './PlayerCards';
import { PlayerRow, PositionSections, useOpenRow } from './PlayerRow';

/**
 * Renders the squad tab's list.
 *
 * @param props.filter - The position filter chosen above the list; 'ALL'
 *   shows every position. Sold and loaned-out players are always shown, as
 *   they were when the tab showed cards.
 * @returns The list element.
 */
export function SquadList({
  filter,
}: {
  filter: Position | 'ALL';
}): React.JSX.Element {
  const { state } = useGame();
  // One card open at a time, across every section of the tab.
  const [openId, toggle] = useOpenRow();

  const soldThisWindow = state.departed.filter(
    (d) => d.reason === 'sold' && d.windowIndex === state.windowIndex,
  );

  return (
    <>
      {/* Sales sit above the squad so they are never below the fold. */}
      {soldThisWindow.length > 0 && (
        <section>
          <span className="pill">Sold this window</span>
          <div className="player-rows">
            {soldThisWindow.map(({ player }) => (
              <PlayerRow
                key={player.id}
                quality={player.quality}
                name={player.name}
                meta={`${player.position} · ${String(player.age)}`}
                price={`+${formatMoney(player.saleValue)}`}
                priceClass="in"
                open={openId === player.id}
                onToggle={() => {
                  toggle(player.id);
                }}
              >
                <SoldCard player={player} />
              </PlayerRow>
            ))}
          </div>
        </section>
      )}

      {/* Players away on loan come back on their own, so January can plan
          around them; read-only until they return. */}
      {state.loanedOut.length > 0 && (
        <section>
          <span className="pill">Out on loan</span>
          <div className="player-rows">
            {state.loanedOut.map((loan) => {
              const { player } = loan;
              const returnsIn = loanReturnLabel(state.config.windows, loan);
              return (
                <PlayerRow
                  key={player.id}
                  quality={player.quality}
                  name={player.name}
                  meta={`${player.position} · ${String(player.age)}${loan.club === undefined ? '' : ` · At ${loan.club}`}`}
                  price={`Back ${returnsIn}`}
                  priceClass="note"
                  open={openId === player.id}
                  onToggle={() => {
                    toggle(player.id);
                  }}
                >
                  <LoanedOutCard loan={loan} returnsIn={returnsIn} />
                </PlayerRow>
              );
            })}
          </div>
        </section>
      )}

      <PositionSections
        players={state.squad}
        filter={filter}
        renderRow={(player) => {
          const locked = isLocked(player, state.windowIndex);
          // Only a player the club can sell has a price to show, as on his
          // card.
          const sellable = !locked && player.onLoan !== true;
          return (
            <PlayerRow
              key={player.id}
              quality={player.quality}
              name={player.name}
              labels={<Badges player={player} />}
              locked={locked}
              meta={`${player.position} · ${String(player.age)}`}
              price={sellable ? `+${formatMoney(player.saleValue)}` : 'Not for sale'}
              priceClass={sellable ? 'in' : 'note'}
              open={openId === player.id}
              onToggle={() => {
                toggle(player.id);
              }}
            >
              <SquadCard player={player} />
            </PlayerRow>
          );
        }}
      />
    </>
  );
}

/**
 * Player card components (design.md §3): notched muted cards with oversized
 * quality numbers, metadata rows, and the buy / sell / renew / undo actions.
 */
import { currentWindow, type MarketPlayer, type SquadPlayer } from '../../engine';
import { useGame } from '../GameContext';
import {
  formatExpiry,
  formatMoney,
  formatSalary,
  playerBadges,
  renewalOptions,
} from '../helpers';

/** Shared badge row for a squad player. */
function Badges({ player }: { player: SquadPlayer }): React.JSX.Element {
  const { state } = useGame();
  const window = currentWindow(state);
  return (
    <>
      {playerBadges(player, window).map((b) => (
        <span key={b.kind} className={`badge ${b.kind}`}>
          {b.label}
        </span>
      ))}
    </>
  );
}

/**
 * A current-squad player card with a sell action (or a padlock).
 *
 * @param props.player - The squad player to render.
 * @returns The card element.
 */
export function SquadCard({ player }: { player: SquadPlayer }): React.JSX.Element {
  const { state, dispatch } = useGame();
  const boughtThisWindow =
    player.acquisition?.windowIndex === state.windowIndex;

  return (
    <article
      className={`player-card${player.locked ? ' locked' : ''}${boughtThisWindow ? ' selected-buy' : ''}`}
    >
      <div className="quality">{player.quality}</div>
      <h3 className="name">
        {player.name}
        {player.locked ? ' 🔒' : ''}
      </h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        <Badges player={player} />
      </div>
      <div className="contract">
        <strong>{formatSalary(player.contract.salary)}</strong> ·{' '}
        {formatExpiry(player.contract.expiryYear)}
      </div>
      <div className="actions">
        {player.locked ? (
          <span className="fee">🔒 Locked</span>
        ) : (
          <>
            <span className="fee in">+{formatMoney(player.saleValue)}</span>
            {boughtThisWindow ? (
              <button
                type="button"
                className="action-link"
                onClick={() => dispatch({ type: 'UNDO_BUY', playerId: player.id })}
              >
                Undo buy
              </button>
            ) : (
              <button
                type="button"
                className="action-link"
                onClick={() => dispatch({ type: 'SELL', playerId: player.id })}
              >
                Sell
              </button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

/**
 * A transfer-market card with a buy action.
 *
 * @param props.player - The market player to render.
 * @returns The card element.
 */
export function MarketCard({ player }: { player: MarketPlayer }): React.JSX.Element {
  const { dispatch } = useGame();
  return (
    <article className="player-card">
      <div className="quality">{player.quality}</div>
      <h3 className="name">{player.name}</h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        {player.age <= 21 ? (
          <span className="badge u21">U21</span>
        ) : player.homegrown ? (
          <span className="badge hg">HG</span>
        ) : null}
      </div>
      <div className="contract">
        Wants <strong>{formatSalary(player.wageDemand)}</strong> ·{' '}
        {player.contractYears}-year deal
      </div>
      <div className="actions">
        <span className="fee">{formatMoney(player.fee)}</span>
        <button
          type="button"
          className="action-link"
          onClick={() => dispatch({ type: 'BUY', playerId: player.id })}
        >
          Buy
        </button>
      </div>
    </article>
  );
}

/**
 * A card for a player sold this window, with undo.
 *
 * @param props.player - The departed squad player.
 * @returns The card element.
 */
export function SoldCard({ player }: { player: SquadPlayer }): React.JSX.Element {
  const { dispatch } = useGame();
  return (
    <article className="player-card selected-sale">
      <div className="quality">{player.quality}</div>
      <h3 className="name">{player.name}</h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        <span>Sold</span>
      </div>
      <div className="actions">
        <span className="fee in">+{formatMoney(player.saleValue)}</span>
        <button
          type="button"
          className="action-link"
          onClick={() => dispatch({ type: 'UNDO_SELL', playerId: player.id })}
        >
          Undo sale
        </button>
      </div>
    </article>
  );
}

/**
 * A renewals-tab card: current terms plus every priced extension on offer.
 *
 * @param props.player - The squad player to render.
 * @returns The card element.
 */
export function RenewalCard({ player }: { player: SquadPlayer }): React.JSX.Element {
  const { state, dispatch } = useGame();
  const window = currentWindow(state);
  const options = renewalOptions(player, window);
  const renewedThisWindow = player.renewal?.windowIndex === state.windowIndex;
  const renewedEarlier =
    player.renewal !== undefined && !renewedThisWindow;

  return (
    <article className={`player-card${renewedThisWindow ? ' selected-buy' : ''}`}>
      <div className="quality">{player.quality}</div>
      <h3 className="name">{player.name}</h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        <Badges player={player} />
      </div>
      <div className="contract">
        Current: <strong>{formatSalary(player.contract.salary)}</strong> ·{' '}
        {formatExpiry(player.contract.expiryYear)}
      </div>
      {renewedThisWindow ? (
        <div className="actions">
          <span className="fee in">✓ Renewed</span>
          <button
            type="button"
            className="action-link"
            onClick={() => dispatch({ type: 'UNDO_RENEW', playerId: player.id })}
          >
            Undo renewal
          </button>
        </div>
      ) : renewedEarlier ? (
        <div className="contract">Renewed in an earlier window: no second bite.</div>
      ) : (
        <div className="renew-options">
          {options.map((option) => (
            <button
              key={option.newExpiryYear}
              type="button"
              onClick={() =>
                dispatch({
                  type: 'RENEW',
                  playerId: player.id,
                  newExpiryYear: option.newExpiryYear,
                })
              }
            >
              to {String(option.newExpiryYear)} · {formatSalary(option.contract.salary)}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

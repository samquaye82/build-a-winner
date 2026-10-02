/**
 * Player card components (design.md §3): notched muted cards with oversized
 * quality numbers, metadata rows, and the buy / sell / renew / undo actions.
 */
import {
  currentWindow,
  isLocked,
  type LoanedOutPlayer,
  type MarketPlayer,
  type SquadPlayer,
} from '../../engine';
import { useGame } from '../GameContext';
import {
  formatExpiry,
  formatMoney,
  formatWage,
  formatWeeklyWage,
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
  const promotedThisWindow =
    player.promotion?.windowIndex === state.windowIndex;
  // A lock can lift mid-game, so it is a question about this window.
  const locked = isLocked(player, state.windowIndex);

  return (
    <article
      className={`player-card${locked ? ' locked' : ''}${boughtThisWindow || promotedThisWindow ? ' selected-buy' : ''}`}
    >
      <div className="quality">{player.quality}</div>
      <h3 className="name">
        {player.name}
        {locked ? ' 🔒' : ''}
      </h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        <Badges player={player} />
      </div>
      <div className="contract">
        <strong>{formatWage(player.contract.salary)}</strong> ·{' '}
        {formatExpiry(player.contract.expiryYear)}
      </div>
      <div className="actions">
        {locked ? (
          <span className="fee">🔒 Locked</span>
        ) : player.onLoan === true ? (
          // A loanee belongs to another club: no sale value, no sale. The
          // badge already says he is on loan, so this only needs to explain
          // the missing button.
          <span className="fee">Not for sale</span>
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
            ) : promotedThisWindow ? (
              // A player promoted this window can be sold like any other, or
              // the promotion undone: offer both.
              <>
                <button
                  type="button"
                  className="action-link"
                  onClick={() => dispatch({ type: 'SELL', playerId: player.id })}
                >
                  Sell
                </button>
                <button
                  type="button"
                  className="action-link"
                  onClick={() => dispatch({ type: 'UNDO_PROMOTE', playerId: player.id })}
                >
                  Undo promote
                </button>
              </>
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
 * An academy-tab card with a promote action. Mirrors the squad card layout
 * but shows the fixed academy terms and, in place of a sale value, the
 * one-click promotion into the first-team squad.
 *
 * @param props.player - The academy player to render.
 * @returns The card element.
 */
export function AcademyCard({ player }: { player: SquadPlayer }): React.JSX.Element {
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
        <span className="badge free">Academy</span>
      </div>
      <div className="contract">
        <strong>{formatWage(player.contract.salary)}</strong> ·{' '}
        {formatExpiry(player.contract.expiryYear)}
      </div>
      <div className="actions">
        <span className="fee">{formatMoney(player.baseValue)}</span>
        <button
          type="button"
          className="action-link"
          onClick={() => dispatch({ type: 'PROMOTE', playerId: player.id })}
        >
          Promote
        </button>
      </div>
    </article>
  );
}

/**
 * A transfer-market card with a buy action (or a locked notice when the
 * player's club refuses to sell).
 *
 * @param props.player - The market player to render.
 * @param props.onBought - Optional callback after a successful purchase.
 * @returns The card element.
 */
export function MarketCard({
  player,
  onBought,
}: {
  player: MarketPlayer;
  onBought?: () => void;
}): React.JSX.Element {
  const { dispatch } = useGame();
  const isFree = player.fee === 0;
  const isLocked = player.locked === true;

  return (
    <article className={`player-card${isLocked ? ' locked' : ''}`}>
      <div className="quality">{player.quality}</div>
      <h3 className="name">
        {player.name}
        {isLocked ? ' 🔒' : ''}
      </h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        {player.club !== undefined && <span>{player.club}</span>}
        {player.age <= 21 ? (
          <span className="badge u21">U21</span>
        ) : player.homegrown ? (
          <span className="badge hg">HG</span>
        ) : null}
        {isFree && <span className="badge free">Free agent</span>}
      </div>
      <div className="contract">
        Wants <strong>{formatWage(player.wageDemand)}</strong> ·{' '}
        {player.contractYears}-year deal
      </div>
      <div className="actions">
        {isLocked ? (
          <span className="fee">Club refuses to sell</span>
        ) : (
          <>
            <span className="fee">
              {isFree ? 'Free' : formatMoney(player.fee)}
            </span>
            <button
              type="button"
              className="action-link"
              onClick={() => {
                if (dispatch({ type: 'BUY', playerId: player.id })) {
                  onBought?.();
                }
              }}
            >
              Buy
            </button>
          </>
        )}
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
 * A read-only card for a club player away on loan: who he is, where he is,
 * and the window he rejoins the squad in. No actions, because a player
 * away cannot be sold or renewed until he is back.
 *
 * @param props.loan - The player away on loan.
 * @param props.returnsIn - Label of the window he returns in.
 * @returns The card element.
 */
export function LoanedOutCard({
  loan,
  returnsIn,
}: {
  loan: LoanedOutPlayer;
  returnsIn: string;
}): React.JSX.Element {
  const { player } = loan;
  return (
    <article className="player-card">
      <div className="quality">{player.quality}</div>
      <h3 className="name">{player.name}</h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        <span>At {loan.club}</span>
      </div>
      <div className="actions">
        <span>Back in {returnsIn}</span>
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
        Current: <strong>{formatWage(player.contract.salary)}</strong> ·{' '}
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
      ) : player.onLoan === true ? (
        <div className="contract">
          On loan: his contract is his parent club&rsquo;s to extend.
        </div>
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
              to {String(option.newExpiryYear)} · {formatWeeklyWage(option.contract.salary)}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

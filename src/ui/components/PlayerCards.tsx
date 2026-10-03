/**
 * Player card components (design.md §3): notched muted cards with oversized
 * quality numbers, metadata rows, and the buy / sell / renew / undo actions.
 */
import {
  currentWindow,
  isLocked,
  isRegisteredFor,
  loanFee,
  signingWage,
  type Competition,
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
  // Only a player the club can sell has a price to show.
  const sellable = !locked && player.onLoan !== true;

  return (
    <article
      className={`player-card${locked ? ' locked' : ''}${boughtThisWindow || promotedThisWindow ? ' selected-buy' : ''}`}
    >
      {/* The price sits level with the rating (Sam, 04/10/2026). */}
      <div className="card-top">
        <div className="quality">{player.quality}</div>
        {sellable && (
          <span className="fee in">+{formatMoney(player.saleValue)}</span>
        )}
      </div>
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
      <div className="actions buttons">
        {locked ? (
          <span className="fee">🔒 Locked</span>
        ) : player.onLoan === true ? (
          // A loanee belongs to another club: no sale value, no sale. The
          // badge already says he is on loan, so this only needs to explain
          // the missing button.
          <span className="fee">Not for sale</span>
        ) : (
          <>
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
                <LoanButton player={player} />
                <button
                  type="button"
                  className="action-link"
                  onClick={() => dispatch({ type: 'UNDO_PROMOTE', playerId: player.id })}
                >
                  Undo promote
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="action-link"
                  onClick={() => dispatch({ type: 'SELL', playerId: player.id })}
                >
                  Sell
                </button>
                <LoanButton player={player} />
              </>
            )}
          </>
        )}
      </div>
      <RegistrationToggles player={player} />
    </article>
  );
}

/**
 * Loans a player out to the end of the season, showing the fee it brings
 * in (15% of his sale value, from the engine).
 *
 * @param props.player - The squad player.
 * @returns The button.
 */
function LoanButton({ player }: { player: SquadPlayer }): React.JSX.Element {
  const { dispatch } = useGame();
  return (
    <button
      type="button"
      className="action-link action-loan"
      title="Off every list and off the wage bill until the end of the season; his fee keeps amortising."
      onClick={() => dispatch({ type: 'LOAN_OUT', playerId: player.id })}
    >
      Loan +{formatMoney(loanFee(player))}
    </button>
  );
}

/** Short names for the registration toggles. */
const COMPETITION_LABELS: Readonly<Record<Competition, string>> = {
  PL: 'PL',
  UCL: 'UCL',
};

/**
 * Deregister / re-register buttons for each competition. Shown for every
 * squad player, locked or on loan included: leaving a player off a list is
 * not a sale. The cost falls only if a window closes with him still off.
 *
 * @param props.player - The squad player.
 * @returns The toggle row.
 */
function RegistrationToggles({
  player,
}: {
  player: SquadPlayer;
}): React.JSX.Element {
  const { dispatch } = useGame();
  const competitions: readonly Competition[] = ['PL', 'UCL'];
  return (
    <div className="actions buttons">
      {competitions.map((competition) => {
        const registered = isRegisteredFor(player, competition);
        return (
          <button
            key={competition}
            type="button"
            className="action-link"
            title={
              registered
                ? 'Still under contract. If the window closes with him off the list, he loses 20% of his value and costs 10 points of value created.'
                : undefined
            }
            onClick={() =>
              dispatch({
                type: registered ? 'DEREGISTER' : 'REREGISTER',
                playerId: player.id,
                competition,
              })
            }
          >
            {registered ? 'Deregister' : 'Re-register'}{' '}
            {COMPETITION_LABELS[competition]}
          </button>
        );
      })}
    </div>
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
  const { state, dispatch } = useGame();
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
        Wants <strong>{formatWage(signingWage(state, player))}</strong> ·{' '}
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
 * A card for a club player away on loan: who he is, where he is when that
 * is known, and when he rejoins the squad. A player away cannot be sold or
 * renewed; the only action is undoing a loan agreed this window, which
 * repays its fee.
 *
 * @param props.loan - The player away on loan.
 * @param props.returnsIn - When he returns, e.g. "Summer 2027".
 * @returns The card element.
 */
export function LoanedOutCard({
  loan,
  returnsIn,
}: {
  loan: LoanedOutPlayer;
  returnsIn: string;
}): React.JSX.Element {
  const { state, dispatch } = useGame();
  const { player } = loan;
  const agreedNow = loan.agreed?.windowIndex === state.windowIndex;
  return (
    <article className={`player-card${agreedNow ? ' selected-sale' : ''}`}>
      <div className="quality">{player.quality}</div>
      <h3 className="name">{player.name}</h3>
      <div className="meta">
        <span>{player.position}</span>
        <span>{player.age}</span>
        {loan.club !== undefined && <span>At {loan.club}</span>}
      </div>
      <div className="actions">
        <span>Back in {returnsIn}</span>
        {agreedNow && loan.agreed !== undefined && (
          <>
            <span className="fee in">+{formatMoney(loan.agreed.fee)}</span>
            <button
              type="button"
              className="action-link"
              onClick={() =>
                dispatch({ type: 'UNDO_LOAN_OUT', playerId: player.id })
              }
            >
              Undo loan
            </button>
          </>
        )}
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
  const options = renewalOptions(player, window, state.squad);
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

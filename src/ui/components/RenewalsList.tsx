/**
 * The renewals tab as a list (Sam, 04/10/2026), in the squad tab's style:
 * one row per squad player under position headings, by rating and then
 * sale value. The price column holds what matters for a renewal, when
 * his contract ends (or that it has been renewed); the card with the
 * priced extensions opens beneath the row.
 */
import type { Position, SquadPlayer } from '../../engine';
import { useGame } from '../GameContext';
import { formatExpiry } from '../helpers';
import { Badges, RenewalCard } from './PlayerCards';
import { PlayerRow, PositionSections, useOpenRow } from './PlayerRow';

/**
 * The renewals row's right-hand note.
 *
 * @param player - The squad player.
 * @param windowIndex - The current window.
 * @returns "✓ Renewed" for a renewal this window, "Renewed" for an earlier
 *   one (one per player per game), otherwise when his deal expires.
 */
function renewalNote(player: SquadPlayer, windowIndex: number): string {
  if (player.renewal?.windowIndex === windowIndex) {
    return '✓ Renewed';
  }
  if (player.renewal !== undefined) {
    return 'Renewed';
  }
  return formatExpiry(player.contract.expiryYear);
}

/**
 * Renders the renewals tab's list.
 *
 * @param props.filter - The position filter chosen above the list; 'ALL'
 *   shows every position.
 * @returns The list element.
 */
export function RenewalsList({
  filter,
}: {
  filter: Position | 'ALL';
}): React.JSX.Element {
  const { state } = useGame();
  const [openId, toggle] = useOpenRow();

  return (
    <PositionSections
      players={state.squad}
      filter={filter}
      renderRow={(player) => (
        // No padlock here: a lock stops a sale, not a new contract.
        <PlayerRow
          key={player.id}
          quality={player.quality}
          name={player.name}
          labels={<Badges player={player} />}
          meta={`${player.position} · ${String(player.age)}`}
          price={renewalNote(player, state.windowIndex)}
          priceClass="note"
          open={openId === player.id}
          onToggle={() => {
            toggle(player.id);
          }}
        >
          <RenewalCard player={player} />
        </PlayerRow>
      )}
    />
  );
}

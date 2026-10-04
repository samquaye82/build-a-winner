/**
 * The academy tab as a list (Sam, 04/10/2026), in the squad tab's style:
 * one row per academy player under position headings, by rating and then
 * value, the card with its Promote button opening beneath the row.
 */
import type { Position } from '../../engine';
import { useGame } from '../GameContext';
import { formatMoney } from '../helpers';
import { AcademyCard, Badges } from './PlayerCards';
import { PlayerRow, PositionSections, useOpenRow } from './PlayerRow';

/**
 * Renders the academy tab's list.
 *
 * @param props.filter - The position filter chosen above the list; 'ALL'
 *   shows every position.
 * @returns The list, or a note once every academy player is promoted.
 */
export function AcademyList({
  filter,
}: {
  filter: Position | 'ALL';
}): React.JSX.Element {
  const { state } = useGame();
  const [openId, toggle] = useOpenRow();

  if (state.academy.length === 0) {
    return <p className="intro">No academy players left to promote.</p>;
  }

  return (
    <PositionSections
      players={state.academy}
      filter={filter}
      renderRow={(player) => (
        <PlayerRow
          key={player.id}
          quality={player.quality}
          name={player.name}
          labels={<Badges player={player} />}
          meta={`${player.position} · ${String(player.age)}`}
          // His value, as on his card: not money in, so not green.
          price={formatMoney(player.baseValue)}
          open={openId === player.id}
          onToggle={() => {
            toggle(player.id);
          }}
        >
          <AcademyCard player={player} />
        </PlayerRow>
      )}
    />
  );
}

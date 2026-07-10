/**
 * The pick-your-XI screen: formation chips, a tap-to-fill pitch, and the
 * confirm action that dispatches PICK_XI (design.md §3, pitch spec).
 */
import { useState } from 'react';
import {
  FORMATIONS,
  type FormationId,
  type SquadPlayer,
} from '../../engine';
import { useGame } from '../GameContext';

/**
 * Pitch coordinates per formation, index-aligned with the formation's
 * slots. Percentages of the pitch box: x from left, y from top (attack at
 * the top, keeper at the bottom).
 */
const SLOT_COORDS: Readonly<Record<FormationId, readonly [number, number][]>> = {
  '4-3-3': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [70, 48], [50, 54], [30, 48], [78, 22], [50, 14], [22, 22]],
  '4-3-2-1': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [70, 52], [50, 56], [30, 52], [65, 30], [35, 30], [50, 12]],
  '4-4-2': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [82, 44], [62, 48], [38, 48], [18, 44], [60, 16], [40, 16]],
  '4-2-3-1': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [60, 56], [40, 56], [80, 32], [50, 34], [20, 32], [50, 12]],
  '3-5-2': [[50, 90], [70, 74], [50, 76], [30, 74], [86, 50], [66, 50], [50, 56], [34, 50], [14, 50], [60, 16], [40, 16]],
  '3-4-3': [[50, 90], [70, 74], [50, 76], [30, 74], [85, 48], [62, 50], [38, 50], [15, 48], [76, 20], [50, 14], [24, 20]],
};

/** Initials shown in a filled roundel, e.g. "Enzo Rossi" -> "ER". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

/**
 * Renders the XI selection screen.
 *
 * @param props.onBack - Returns to the final transfer window.
 * @param props.onConfirmed - Called after PICK_XI is accepted.
 * @returns The XI screen element.
 */
export function XIScreen({
  onBack,
  onConfirmed,
}: {
  onBack: () => void;
  onConfirmed: () => void;
}): React.JSX.Element {
  const { state, dispatch } = useGame();
  const [formationId, setFormationId] = useState<FormationId>('4-3-3');
  // picks[slotIndex] = playerId | null, aligned with the formation slots.
  const [picks, setPicks] = useState<(string | null)[]>(Array(11).fill(null));
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const formation = FORMATIONS[formationId];
  const coords = SLOT_COORDS[formationId];
  const byId = new Map(state.squad.map((p) => [p.id, p]));
  const pickedIds = new Set(picks.filter((id): id is string => id !== null));
  const pickedCount = pickedIds.size;

  /** Eligible, unpicked squad players for a slot, best first. */
  function optionsFor(slotIndex: number): SquadPlayer[] {
    const slot = formation.slots[slotIndex];
    if (slot === undefined) {
      return [];
    }
    return state.squad
      .filter((p) => slot.eligible.includes(p.position) && !pickedIds.has(p.id))
      .sort((a, b) => b.quality - a.quality);
  }

  function changeFormation(next: FormationId): void {
    // Slot shapes change; the safe deterministic behaviour is a clean sheet.
    setFormationId(next);
    setPicks(Array(11).fill(null));
    setActiveSlot(null);
  }

  function fillSlot(slotIndex: number, playerId: string): void {
    setPicks((current) => current.map((id, i) => (i === slotIndex ? playerId : id)));
    setActiveSlot(null);
  }

  function clearSlot(slotIndex: number): void {
    setPicks((current) => current.map((id, i) => (i === slotIndex ? null : id)));
    setActiveSlot(slotIndex);
  }

  function confirm(): void {
    const playerIds = picks.filter((id): id is string => id !== null);
    if (
      playerIds.length === 11 &&
      dispatch({ type: 'PICK_XI', selection: { formationId, playerIds } })
    ) {
      onConfirmed();
    }
  }

  return (
    <main className="page">
      <p className="intro">
        The windows are shut. Choose a shape and pick the eleven you will be
        judged on: tap a spot, then tap a player.
      </p>

      <div className="formation-chips">
        {(Object.keys(FORMATIONS) as FormationId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={id === formationId ? 'active' : ''}
            onClick={() => changeFormation(id)}
          >
            {id}
          </button>
        ))}
      </div>

      <div className="pitch">
        {formation.slots.map((slot, index) => {
          const [x, y] = coords[index] ?? [50, 50];
          const player = picks[index] != null ? byId.get(picks[index]) : undefined;
          return (
            <button
              key={`${formationId}-${String(index)}`}
              type="button"
              className={`slot${player !== undefined ? ' filled' : ''}`}
              style={{ left: `${String(x)}%`, top: `${String(y)}%` }}
              onClick={() =>
                player !== undefined ? clearSlot(index) : setActiveSlot(index)
              }
            >
              <span className="roundel">
                {player !== undefined ? initials(player.name) : '+'}
              </span>
              <span className="slot-name">
                {player !== undefined ? player.name.split(' ').pop() : slot.label}
              </span>
            </button>
          );
        })}
      </div>

      {activeSlot !== null && (
        <div className="slot-picker">
          <span className="pill">
            Pick a {formation.slots[activeSlot]?.label ?? ''}
          </span>
          <div className="options">
            {optionsFor(activeSlot).map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => fillSlot(activeSlot, player.id)}
              >
                {player.name} · {player.position} · {player.quality}
              </button>
            ))}
            {optionsFor(activeSlot).length === 0 && (
              <p className="xi-status">No eligible players left for this slot.</p>
            )}
          </div>
        </div>
      )}

      <div className="xi-footer">
        <button type="button" className="btn-secondary" onClick={onBack}>
          ◂ Back to the window
        </button>
        <span className="xi-status">{pickedCount}/11 picked</span>
        <button
          type="button"
          className="btn-primary"
          disabled={pickedCount !== 11}
          onClick={confirm}
        >
          Confirm XI → final rating ▸
        </button>
      </div>
    </main>
  );
}

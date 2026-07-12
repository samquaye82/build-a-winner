/**
 * The pick-your-XI screen: formation chips, a tap-to-fill pitch, and the
 * confirm action that dispatches PICK_XI (design.md §3, pitch spec).
 */
import { useEffect, useRef, useState } from 'react';
import {
  FORMATIONS,
  type FormationId,
  type SquadPlayer,
} from '../../engine';
import { useGame } from '../GameContext';
import { groupByPosition, POSITION_LABELS } from '../helpers';
import { initials, SLOT_COORDS } from './pitchLayout';

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
  const pickerRef = useRef<HTMLDivElement>(null);

  // The picker opens below the pitch; bring it into view when it appears
  // (Sam's below-the-fold fix).
  useEffect(() => {
    if (activeSlot !== null) {
      pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSlot]);

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

      <div className="xi-layout">
        <div className="xi-main">
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
        <div className="slot-picker" ref={pickerRef}>
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
        </div>

        <aside className="xi-squad">
          <span className="pill">Full squad</span>
          {groupByPosition(state.squad).map(([position, group]) => (
            <div key={position}>
              <div className="xi-squad-group">{POSITION_LABELS[position]}</div>
              {group.map((player) => {
                const picked = pickedIds.has(player.id);
                const eligible =
                  !picked &&
                  activeSlot !== null &&
                  (formation.slots[activeSlot]?.eligible.includes(
                    player.position,
                  ) ??
                    false);
                return (
                  <button
                    key={player.id}
                    type="button"
                    className={`xi-squad-row${picked ? ' picked' : ''}${eligible ? ' eligible' : ''}`}
                    disabled={!eligible}
                    onClick={() => {
                      if (activeSlot !== null) {
                        fillSlot(activeSlot, player.id);
                      }
                    }}
                  >
                    <span className="q">{player.quality}</span>
                    <span className="xi-squad-name">{player.name}</span>
                    <span className="xi-squad-pos">
                      {picked ? '✓ XI' : player.position}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>
      </div>

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

/**
 * Formation definitions for the pick-your-XI phase.
 *
 * A formation is eleven slots, each restricted to the positions that can
 * fill it. Slot labels are what the UI paints on the pitch. Wide slots (W)
 * take either winger; wing-back slots (WB) take either full-back; central
 * slots are strict, so a squad with no attacking midfielders simply cannot
 * play 4-2-3-1.
 */
import type { Position } from './types';

/** The six selectable shapes, matching the original game. */
export type FormationId =
  | '4-3-3'
  | '4-3-2-1'
  | '4-4-2'
  | '4-2-3-1'
  | '3-5-2'
  | '3-4-3';

/** One position in a formation and who may occupy it. */
export interface FormationSlot {
  /** Pitch label, e.g. 'GK', 'CB', 'W', 'WB'. */
  label: string;
  /** Positions eligible to fill this slot. */
  eligible: readonly Position[];
}

/** A complete eleven-slot formation. */
export interface Formation {
  id: FormationId;
  slots: readonly FormationSlot[];
}

const GK: FormationSlot = { label: 'GK', eligible: ['GK'] };
const RB: FormationSlot = { label: 'RB', eligible: ['RB'] };
const LB: FormationSlot = { label: 'LB', eligible: ['LB'] };
const CB: FormationSlot = { label: 'CB', eligible: ['CB'] };
const CM: FormationSlot = { label: 'CM', eligible: ['CM'] };
const AM: FormationSlot = { label: 'AM', eligible: ['AM'] };
const ST: FormationSlot = { label: 'ST', eligible: ['ST'] };
/** Wide attacker: either winger. */
const W: FormationSlot = { label: 'W', eligible: ['RW', 'LW'] };
/** Wing-back in a back three: either full-back. */
const WB: FormationSlot = { label: 'WB', eligible: ['RB', 'LB'] };

/** All selectable formations, keyed by id. */
export const FORMATIONS: Readonly<Record<FormationId, Formation>> = {
  '4-3-3': { id: '4-3-3', slots: [GK, RB, CB, CB, LB, CM, CM, CM, W, ST, W] },
  '4-3-2-1': { id: '4-3-2-1', slots: [GK, RB, CB, CB, LB, CM, CM, CM, AM, AM, ST] },
  '4-4-2': { id: '4-4-2', slots: [GK, RB, CB, CB, LB, W, CM, CM, W, ST, ST] },
  '4-2-3-1': { id: '4-2-3-1', slots: [GK, RB, CB, CB, LB, CM, CM, W, AM, W, ST] },
  '3-5-2': { id: '3-5-2', slots: [GK, CB, CB, CB, WB, CM, CM, CM, WB, ST, ST] },
  '3-4-3': { id: '3-4-3', slots: [GK, CB, CB, CB, WB, CM, CM, WB, W, ST, W] },
};

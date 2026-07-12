/**
 * Formation definitions for the pick-your-XI phase.
 *
 * A formation is eleven slots, each restricted to the positions that can
 * fill it. Slot labels are what the UI paints on the pitch. Eligibility
 * works in positional groups (Sam, 12/07/2026): any defender can fill any
 * defensive slot, any midfielder any midfield slot, either winger any
 * wide slot; strikers are strikers, keepers are keepers.
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

/** The positional groups that gate slot eligibility. */
const DEFENDERS: readonly Position[] = ['RB', 'CB', 'LB'];
const MIDFIELDERS: readonly Position[] = ['CM', 'AM'];
const WINGERS: readonly Position[] = ['RW', 'LW'];

const GK: FormationSlot = { label: 'GK', eligible: ['GK'] };
const RB: FormationSlot = { label: 'RB', eligible: DEFENDERS };
const LB: FormationSlot = { label: 'LB', eligible: DEFENDERS };
const CB: FormationSlot = { label: 'CB', eligible: DEFENDERS };
const CM: FormationSlot = { label: 'CM', eligible: MIDFIELDERS };
const AM: FormationSlot = { label: 'AM', eligible: MIDFIELDERS };
const ST: FormationSlot = { label: 'ST', eligible: ['ST'] };
/** Wide attacker: either winger. */
const W: FormationSlot = { label: 'W', eligible: WINGERS };
/** Wing-back in a back three: any defender. */
const WB: FormationSlot = { label: 'WB', eligible: DEFENDERS };

/** All selectable formations, keyed by id. */
export const FORMATIONS: Readonly<Record<FormationId, Formation>> = {
  '4-3-3': { id: '4-3-3', slots: [GK, RB, CB, CB, LB, CM, CM, CM, W, ST, W] },
  '4-3-2-1': { id: '4-3-2-1', slots: [GK, RB, CB, CB, LB, CM, CM, CM, AM, AM, ST] },
  '4-4-2': { id: '4-4-2', slots: [GK, RB, CB, CB, LB, W, CM, CM, W, ST, ST] },
  '4-2-3-1': { id: '4-2-3-1', slots: [GK, RB, CB, CB, LB, CM, CM, W, AM, W, ST] },
  '3-5-2': { id: '3-5-2', slots: [GK, CB, CB, CB, WB, CM, CM, CM, WB, ST, ST] },
  '3-4-3': { id: '3-4-3', slots: [GK, CB, CB, CB, WB, CM, CM, WB, W, ST, W] },
};

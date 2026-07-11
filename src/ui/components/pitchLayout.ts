/**
 * Pitch coordinates per formation, index-aligned with each formation's
 * slots. Shared by the XI picker and the end screen's mini pitch.
 * Percentages of the pitch box: x from left, y from top (attack at the
 * top, keeper at the bottom).
 */
import type { FormationId } from '../../engine';

export const SLOT_COORDS: Readonly<Record<FormationId, readonly [number, number][]>> = {
  '4-3-3': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [70, 48], [50, 54], [30, 48], [78, 22], [50, 14], [22, 22]],
  '4-3-2-1': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [70, 52], [50, 56], [30, 52], [65, 30], [35, 30], [50, 12]],
  '4-4-2': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [82, 44], [62, 48], [38, 48], [18, 44], [60, 16], [40, 16]],
  '4-2-3-1': [[50, 90], [83, 70], [63, 74], [37, 74], [17, 70], [60, 56], [40, 56], [80, 32], [50, 34], [20, 32], [50, 12]],
  '3-5-2': [[50, 90], [70, 74], [50, 76], [30, 74], [86, 50], [66, 50], [50, 56], [34, 50], [14, 50], [60, 16], [40, 16]],
  '3-4-3': [[50, 90], [70, 74], [50, 76], [30, 74], [85, 48], [62, 50], [38, 50], [15, 48], [76, 20], [50, 14], [24, 20]],
};

/**
 * Initials for a filled roundel, e.g. "Enzo Rossi" -> "ER".
 *
 * @param name - The player's full name.
 * @returns Up to two uppercase initials.
 */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
}

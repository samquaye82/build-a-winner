/**
 * The compact player row shared by the transfer market and the squad tab
 * (Sam, 04/10/2026): rating, name with its labels, a details line and a
 * price, in one line. Clicking the row opens the player's full card
 * directly beneath it, so the decision happens where the eye already is
 * rather than at the top of the list.
 */
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Renders one player row and, while open, its card beneath it.
 *
 * @param props.quality - The player's rating.
 * @param props.name - The player's display name.
 * @param props.labels - Badges shown after the name (HG, U21, Expiring...).
 * @param props.locked - True to show the padlock and dim the row.
 * @param props.meta - The small-caps details line, e.g. "CM · 25 · Arsenal".
 * @param props.price - The right-hand price or note.
 * @param props.priceClass - Extra class for the price: 'in' for money the
 *   club would receive, 'note' for words rather than money.
 * @param props.open - Whether the card is showing.
 * @param props.onToggle - Called when the row is clicked.
 * @param props.children - The card to show while open.
 * @returns The row element.
 */
export function PlayerRow({
  quality,
  name,
  labels,
  locked = false,
  meta,
  price,
  priceClass,
  open,
  onToggle,
  children,
}: {
  quality: number;
  name: string;
  labels?: ReactNode;
  locked?: boolean;
  meta: string;
  price: ReactNode;
  priceClass?: 'in' | 'note';
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}): React.JSX.Element {
  const detailRef = useRef<HTMLDivElement>(null);

  // The card opens below the row, which may be near the bottom of the
  // screen: bring it into view without jumping further than needed.
  useEffect(() => {
    if (open) {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [open]);

  return (
    <div className="player-row-item">
      <button
        type="button"
        className={`player-row${open ? ' active' : ''}${locked ? ' row-locked' : ''}`}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="q">{quality}</span>
        <span className="player-row-name">
          {name}
          {locked ? ' 🔒' : ''}
          {labels}
        </span>
        <span className="player-row-meta">{meta}</span>
        <span className={`player-row-price${priceClass === undefined ? '' : ` ${priceClass}`}`}>
          {price}
        </span>
      </button>
      {open && (
        <div className="player-row-detail" ref={detailRef}>
          {children}
        </div>
      )}
    </div>
  );
}

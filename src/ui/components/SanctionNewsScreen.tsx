/**
 * The Manchester City sanction news page (Sam, 03/10/2026): shown once,
 * between January 2027 and Summer 2027, in the place the interim review
 * used to take. A white page with the number of charges in sky blue and a
 * short explanation in navy.
 *
 * Read-only: the window it follows has already been committed, so the
 * single button only moves on. The sanction itself is data
 * (src/data/citySanction.ts); the copy below assumes its half-price
 * multiplier.
 */
import { currentWindow } from '../../engine';
import { CITY_SANCTION } from '../../data/citySanction';
import { useGame } from '../GameContext';

/**
 * Renders the sanction news page.
 *
 * @param props.onContinue - Called when the player moves on to the window
 *   the sanction opens in.
 * @returns The news page element.
 */
export function SanctionNewsScreen({
  onContinue,
}: {
  onContinue: () => void;
}): React.JSX.Element {
  const { state } = useGame();
  // The window has already advanced, so the current one is where the
  // sanction starts.
  const window = currentWindow(state);

  return (
    <main className="page sanction-screen">
      <div className="sanction-number">{CITY_SANCTION.charges}</div>
      <p className="sanction-copy">
        Manchester City have been found guilty of breaking the Premier
        League’s financial rules, and the points deduction has followed.
        Their players want out, and the club is ready to deal. From{' '}
        {window.label}, every Manchester City player is available for half
        his transfer fee. Wage demands are unchanged.
      </p>
      <button type="button" className="btn-primary" onClick={onContinue}>
        Continue to {window.label} ▸
      </button>
    </main>
  );
}

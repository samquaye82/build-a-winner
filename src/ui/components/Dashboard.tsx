/**
 * The constraint dashboard: funds, registration counts, SCR meter and squad
 * size as muted tiles, plus the live violations panel (design.md §3).
 */
import {
  computeSquadCost,
  countRegistration,
  validateState,
} from '../../engine';
import {
  NON_HOMEGROWN_LIMIT,
  OVER21_REGISTRATION_LIMIT,
  SCR_LIMIT,
} from '../../engine/constants';
import { formatMoney } from '../helpers';
import { useGame } from '../GameContext';

/**
 * Renders the dashboard tiles and the violations / all-clear panel.
 *
 * @returns The dashboard element.
 */
export function Dashboard(): React.JSX.Element {
  const { state } = useGame();
  const counts = countRegistration(state.squad);
  const cost = computeSquadCost(state);
  const violations = validateState(state);

  const scrShare = cost.ratio / SCR_LIMIT; // 1.0 = exactly at the limit
  const scrClass =
    scrShare > 1 ? 'scr-over' : scrShare > 0.82 ? 'scr-warn' : 'scr-ok';
  const has = (code: string): boolean =>
    violations.some((v) => v.code === code);

  return (
    <>
      <div className="dashboard">
        <div className={`tile${has('BUDGET_EXCEEDED') ? ' violating' : ''}`}>
          <div className="label">Funds</div>
          <div className="value">{formatMoney(state.funds)}</div>
        </div>
        <div className="tile">
          <div className="label">Home-grown</div>
          <div className="value">{counts.homegrown}</div>
          <div className="sub">of {counts.total} in squad</div>
        </div>
        <div className={`tile${has('NON_HOMEGROWN_LIMIT_EXCEEDED') ? ' violating' : ''}`}>
          <div className="label">Non-home-grown</div>
          <div className="value">
            {counts.nonHomegrownOver21} / {NON_HOMEGROWN_LIMIT}
          </div>
        </div>
        <div className={`tile${has('OVER21_LIMIT_EXCEEDED') ? ' violating' : ''}`}>
          <div className="label">Over-21 registered</div>
          <div className="value">
            {counts.over21} / {OVER21_REGISTRATION_LIMIT}
          </div>
        </div>
        <div className={`tile${has('SCR_EXCEEDED') ? ' violating' : ''}`}>
          <div className="label">Squad cost ratio</div>
          <div className="value">{Math.round(cost.ratio * 100)}%</div>
          <div className={`scr-meter ${scrClass}`}>
            <span style={{ width: `${String(Math.min(100, scrShare * 100))}%` }} />
          </div>
          <div className="sub">
            {formatMoney(cost.total)} of {formatMoney(cost.cap)} cap
          </div>
        </div>
        <div className={`tile${has('SQUAD_TOO_SMALL') || has('NOT_ENOUGH_GOALKEEPERS') ? ' violating' : ''}`}>
          <div className="label">Squad size</div>
          <div className="value">{counts.total}</div>
          <div className="sub">{counts.u21} U21 exempt</div>
        </div>
      </div>

      {violations.length > 0 ? (
        <div className="violations" role="alert">
          <ul>
            {violations.map((v) => (
              <li key={v.code}>{v.message}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="all-clear">✓ Valid squad. Ready to submit.</div>
      )}
    </>
  );
}

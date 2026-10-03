/**
 * Landing / start screen: the game's title, the rules, and START GAME.
 *
 * Shown before the provider mounts a game, so it takes no game state; the
 * numbers here are copy, deliberately matching realConfig's constants.
 * Keep them in sync if the budgets or rules move.
 */

/** One rule block: a heading and its explanation. */
const RULES: readonly { heading: string; body: string }[] = [
  {
    heading: 'Three windows, one sitting',
    body: 'Liverpool need you! You are now Liverpool’s Sporting Director. Channel the Spirit of Big Jorg Schmadtke and plan the January 2027, Summer 2027 and January 2028 windows back to back. There are no save games: every decision stands. Your job is to build a squad that can win the Premier League and Champions League in the 2027/28 season.',
  },
  {
    heading: 'Buy, sell, renew',
    body: 'Sign players from across Europe’s top leagues, sell those you can spare, and renew expiring contracts before your best players walk for free. You start with a €100m budget; unspent funds roll into future windows, and a fresh €200m arrives in Summer 2027. Rivals (Manchester United, Everton) will not sell to you and realistically some superstars are out of reach.',
  },
  {
    heading: 'Stay legal',
    body: 'Keep inside the Premier League and Champions League squad rules: 25 registered players over 21, at most 17 of them non-home-grown. Under-21s are exempt.',
  },
  {
    heading: 'Mind the squad cost ratio',
    body: 'Wages plus transfer amortisation must stay within 70% of the club’s revenue. Big signings bite for years; letting stars leave on frees eases the books but wrecks the squad.',
  },
  {
    heading: 'Time moves on',
    body: 'Between windows players age and values shift. Contracts that expire without a renewal leave for nothing, then reappear in the market as free agents.',
  },
  {
    heading: 'Then pick your XI',
    body: 'When the windows shut, choose a formation and your starting eleven. You are rated out of 100 on squad quality and depth, balance, age profile, contract health and the value you created. Liverpool already have a good team: your job is to make it elite and future-proof.',
  },
];

/**
 * Renders the landing screen.
 *
 * @param props.onStart - Begins a new game (moves to the January 2027
 *   window).
 * @returns The landing screen element.
 */
export function LandingScreen({ onStart }: { onStart: () => void }): React.JSX.Element {
  return (
    <div className="landing">
      <div className="landing-hero">
        <span className="landing-kicker">The transfer window game</span>
        <h1 className="landing-title">Build a Winner</h1>
        <p className="landing-sub">Liverpool FC · January 2027 to January 2028</p>
        <p className="landing-sub">Made by Sam Talks Football (<a href="https://www.youtube.com/channel/UC95-i8y0dBFfmrNHBU00CRg">@sam-talks-football</a>)</p>
      </div>

      <div className="landing-body">
        <ol className="landing-rules">
          {RULES.map((rule, index) => (
            <li key={rule.heading}>
              <span className="landing-rule-num">{index + 1}</span>
              <div>
                <h2>{rule.heading}</h2>
                <p>{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="landing-cta">
          <button type="button" className="btn-primary landing-start" onClick={onStart}>
            Start game ▸
          </button>
        </div>
        <p>This is a work of fiction created for entertainment purposes only. It is not officially endorsed by Liverpool FC or the Premier League, and is not intended to simulate or represent official club operations. The game uses a fictional transfer budget and player valuations for gameplay purposes.</p>
      </div>
    </div>
  );
}

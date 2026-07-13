/**
 * Pure presentation helpers: formatting, grouping and view-model builders.
 * No React, no DOM: everything here is unit-tested in a plain node
 * environment. Rendering components stay dumb.
 */
import {
  MAX_CONTRACT_YEARS,
} from '../engine/constants';
import {
  isU21,
  priceRenewal,
  remainingMonths,
  roundMoney,
  type Contract,
  type GameState,
  type MarketPlayer,
  type Position,
  type ScoreBreakdown,
  type SquadPlayer,
  type WindowConfig,
} from '../engine';

/** Display order for position groups, defence to attack. */
export const POSITION_ORDER: readonly Position[] = [
  'GK', 'RB', 'LB', 'CB', 'CM', 'AM', 'RW', 'LW', 'ST',
];

/** Full display names for position group headers. */
export const POSITION_LABELS: Readonly<Record<Position, string>> = {
  GK: 'Goalkeepers',
  RB: 'Right Backs',
  LB: 'Left Backs',
  CB: 'Central Defenders',
  CM: 'Central Midfielders',
  AM: 'Attacking Midfielders',
  RW: 'Right Wingers',
  LW: 'Left Wingers',
  ST: 'Strikers',
};

/**
 * Formats a monetary amount in EUR m for display.
 *
 * @param amount - The amount in EUR m.
 * @returns E.g. "€60m", "€12.5m", "€-20m".
 */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount * 10) / 10;
  return `€${String(rounded)}m`;
}

/**
 * Formats an annual salary for display.
 *
 * @param salary - Annual salary in EUR m.
 * @returns E.g. "€8.5m/yr".
 */
export function formatSalary(salary: number): string {
  return `${formatMoney(salary)}/yr`;
}

/**
 * Formats a salary as a weekly wage, football-discourse style.
 *
 * @param salary - Annual salary in EUR m.
 * @returns E.g. "€163k/wk"; wages above EUR 1m a week show as "€1.2m/wk".
 */
export function formatWeeklyWage(salary: number): string {
  const weeklyThousands = (salary * 1_000_000) / 52 / 1_000;
  if (weeklyThousands >= 1_000) {
    return `€${String(Math.round(weeklyThousands / 100) / 10)}m/wk`;
  }
  return `€${String(Math.round(weeklyThousands))}k/wk`;
}

/**
 * Formats a salary with the weekly wage leading and the annual figure in
 * brackets (Sam, 12/07/2026: wage discourse is weekly-first).
 *
 * @param salary - Annual salary in EUR m.
 * @returns E.g. "€163k/wk (€8.5m/yr)".
 */
export function formatWage(salary: number): string {
  return `${formatWeeklyWage(salary)} (${formatSalary(salary)})`;
}

/**
 * Formats a contract expiry as the season-end month/year.
 *
 * @param expiryYear - Season-end expiry year.
 * @returns E.g. "expires 06/2028" (DD/MM/YYYY convention, month shown).
 */
export function formatExpiry(expiryYear: number): string {
  return `expires 06/${String(expiryYear)}`;
}

/**
 * Groups players by position in display order, omitting empty groups.
 *
 * @param players - Any list of players with a position.
 * @returns Ordered [position, players] pairs.
 */
export function groupByPosition<T extends { position: Position }>(
  players: readonly T[],
): [Position, T[]][] {
  return POSITION_ORDER.map(
    (position): [Position, T[]] => [
      position,
      players.filter((p) => p.position === position),
    ],
  ).filter(([, group]) => group.length > 0);
}

/** One selectable renewal deal, priced by the engine. */
export interface RenewalOption {
  newExpiryYear: number;
  contract: Contract;
}

/**
 * Builds the priced renewal options for a squad player in a window: every
 * legal new expiry year with the salary the player would accept.
 *
 * @param player - The squad player.
 * @param window - The current window.
 * @returns Options in ascending expiry order; empty if the player has
 *   already renewed or no legal extension exists.
 */
export function renewalOptions(
  player: SquadPlayer,
  window: WindowConfig,
): RenewalOption[] {
  if (player.renewal !== undefined) {
    return [];
  }
  const options: RenewalOption[] = [];
  const maxExpiry = window.seasonStartYear + MAX_CONTRACT_YEARS;
  for (let year = player.contract.expiryYear + 1; year <= maxExpiry; year += 1) {
    options.push({
      newExpiryYear: year,
      contract: priceRenewal(player, year, window),
    });
  }
  return options;
}

/**
 * Whether a player's contract expires within 12 months of the given window
 * (the UI's "expiring" warning badge).
 *
 * @param player - The squad player.
 * @param window - The current window.
 * @returns True when 12 or fewer months remain.
 */
export function isExpiring(player: SquadPlayer, window: WindowConfig): boolean {
  return remainingMonths(player.contract.expiryYear, window) <= 12;
}

/** Display names for the market browser's league filter. */
export const LEAGUE_LABELS: Readonly<Record<string, string>> = {
  'premier-league': 'Premier League',
  'la-liga': 'La Liga',
  bundesliga: 'Bundesliga',
  'serie-a': 'Serie A',
  'ligue-1': 'Ligue 1',
  'primeira-liga': 'Primeira Liga',
  eredivisie: 'Eredivisie',
  'pro-league': 'Belgian Pro League',
  championship: 'Championship (relegated)',
  'free-agent': 'Free agents',
};

/** Accent-insensitive lowercase form for search ("Ekitiké" matches "ekitike"). */
function searchable(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** The market browser's filter state. */
export interface MarketFilters {
  query: string;
  league: string;
  club: string;
  position: Position | 'ALL';
}

/** An unfiltered browser. */
export const EMPTY_FILTERS: MarketFilters = {
  query: '',
  league: 'ALL',
  club: 'ALL',
  position: 'ALL',
};

/**
 * Filters and ranks the market for the browser.
 *
 * @param market - The current window's market pool.
 * @param filters - Active filter state.
 * @param limit - Maximum results to return (the UI shows a refine hint).
 * @returns The top matches (best quality first) and the total match count.
 */
export function filterMarket(
  market: readonly MarketPlayer[],
  filters: MarketFilters,
  limit = 30,
): { results: MarketPlayer[]; total: number } {
  const query = searchable(filters.query.trim());
  const matches = market.filter((player) => {
    if (filters.league !== 'ALL' && player.league !== filters.league) {
      return false;
    }
    if (filters.club !== 'ALL' && player.club !== filters.club) {
      return false;
    }
    if (filters.position !== 'ALL' && player.position !== filters.position) {
      return false;
    }
    return query === '' || searchable(player.name).includes(query);
  });
  const ranked = [...matches].sort(
    (a, b) => b.quality - a.quality || a.name.localeCompare(b.name),
  );
  return { results: ranked.slice(0, limit), total: matches.length };
}

/**
 * The league keys present in a market pool, in display order.
 *
 * @param market - The market pool.
 * @returns League keys ordered as in LEAGUE_LABELS.
 */
export function leaguesIn(market: readonly MarketPlayer[]): string[] {
  const present = new Set(
    market.map((p) => p.league).filter((l): l is string => l !== undefined),
  );
  return Object.keys(LEAGUE_LABELS).filter((key) => present.has(key));
}

/**
 * The clubs available under the current league filter, alphabetically.
 *
 * @param market - The market pool.
 * @param league - Selected league key, or 'ALL'.
 * @returns Sorted club names.
 */
export function clubsIn(
  market: readonly MarketPlayer[],
  league: string,
): string[] {
  const clubs = new Set(
    market
      .filter((p) => league === 'ALL' || p.league === league)
      .map((p) => p.club)
      .filter((c): c is string => c !== undefined),
  );
  return [...clubs].sort((a, b) => a.localeCompare(b));
}

/** Verdict tiers by final rating (Sam, 13/07/2026), highest first. */
const VERDICTS: readonly { min: number; text: string }[] = [
  { min: 91, text: 'Job done. You’ve built a squad for a dynasty.' },
  { min: 86, text: 'Success! This squad should be one of the favourites to win the Premier League and/or Champions League.' },
  { min: 81, text: 'You’re not one of the favourites, but you’ve got a puncher’s chance to win a major trophy.' },
  { min: 76, text: 'The most this squad should expect is to qualify for the top four and maybe win a domestic trophy.' },
  { min: 71, text: 'You’ve built a Europa League level squad. Good, but still not good enough for LFC.' },
  { min: 0, text: 'This squad is not LFC standard. You’ve failed, and you’re fired.' },
];

/**
 * The end-screen verdict for a final rating. A rating of 70 falls into the
 * failed tier (the tiers begin at 71); everything is covered from 0 up.
 *
 * @param total - The rating out of 100.
 * @returns The matching verdict text.
 */
export function verdict(total: number): string {
  return VERDICTS.find((tier) => total >= tier.min)?.text ?? '';
}

/** The story of a finished playthrough, for the end screen. */
export interface EndSummary {
  /** Players signed in-game (still here or since moved on). */
  signings: number;
  /** Total fees paid (EUR m). */
  spent: number;
  /** Players sold. */
  sales: number;
  /** Total fees banked (EUR m). */
  raised: number;
  /** spent - raised (EUR m); negative means a net profit. */
  netSpend: number;
  /** Names of players whose contracts expired unrenewed and unsold. */
  freeExits: string[];
  /** Final squad value (sum of base values, EUR m). */
  squadValue: number;
  /** Funds left unspent (EUR m). */
  fundsLeft: number;
}

/**
 * Summarises a finished playthrough for the end screen.
 *
 * @param state - The final game state.
 * @returns Totals derived from squad acquisitions and departures.
 */
export function endSummary(state: GameState): EndSummary {
  const everyone = [
    ...state.squad,
    ...state.departed.map((d) => d.player),
  ];
  const signings = everyone.filter((p) => p.acquisition !== undefined);
  const sold = state.departed.filter((d) => d.reason === 'sold');

  const spent = roundMoney(
    signings.reduce((sum, p) => sum + (p.acquisition?.fee ?? 0), 0),
  );
  const raised = roundMoney(
    sold.reduce((sum, d) => sum + d.player.saleValue, 0),
  );

  return {
    signings: signings.length,
    spent,
    sales: sold.length,
    raised,
    netSpend: roundMoney(spent - raised),
    freeExits: state.departed
      .filter((d) => d.reason === 'expired')
      .map((d) => d.player.name),
    squadValue: roundMoney(
      state.squad.reduce((sum, p) => sum + p.baseValue, 0),
    ),
    fundsLeft: state.funds,
  };
}

/**
 * Builds the plain-text share summary for the end screen's share button.
 *
 * @param state - The final game state.
 * @param breakdown - The score breakdown for the same state.
 * @returns A short multi-line summary suitable for a social post.
 */
export function buildShareText(
  state: GameState,
  breakdown: ScoreBreakdown,
): string {
  const summary = endSummary(state);
  const shape = state.xi?.formationId ?? '';
  return [
    `Sporting Director: ${String(breakdown.total)}/100`,
    `Three windows, ${String(summary.signings)} in, ${String(summary.sales)} out, net spend ${formatMoney(summary.netSpend)}.`,
    `Final squad value ${formatMoney(summary.squadValue)} in a ${shape}.`,
  ].join('\n');
}

/**
 * The status badges shown on a player card.
 *
 * @param player - The squad player.
 * @param window - The current window.
 * @returns Badge descriptors in display order.
 */
export function playerBadges(
  player: SquadPlayer,
  window: WindowConfig,
): { kind: 'u21' | 'hg' | 'expiring'; label: string }[] {
  const badges: { kind: 'u21' | 'hg' | 'expiring'; label: string }[] = [];
  if (isU21(player)) {
    badges.push({ kind: 'u21', label: 'U21' });
  } else if (player.homegrown) {
    badges.push({ kind: 'hg', label: 'HG' });
  }
  if (isExpiring(player, window)) {
    badges.push({ kind: 'expiring', label: 'Expiring' });
  }
  return badges;
}

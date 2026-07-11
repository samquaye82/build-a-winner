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

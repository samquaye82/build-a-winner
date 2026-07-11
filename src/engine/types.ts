/**
 * Core data model for the game engine.
 *
 * Everything here is plain, immutable data. Reducers in actions.ts return new
 * state objects; nothing in the engine mutates in place. All monetary figures
 * are in millions of euros (EUR m) per year unless stated otherwise.
 */

/** Playing positions, matching the market and squad filter groups. */
export type Position =
  | 'GK'
  | 'RB'
  | 'LB'
  | 'CB'
  | 'CM'
  | 'AM'
  | 'RW'
  | 'LW'
  | 'ST';

/**
 * Identifiers for the three transfer windows the player plans through.
 * Summer 2026 and January 2027 belong to the 2026/27 season; Summer 2027
 * opens the 2027/28 season.
 */
export type WindowId = 'summer-2026' | 'january-2027' | 'summer-2027';

/**
 * A player's employment terms with the club.
 */
export interface Contract {
  /**
   * The season-end year in which the contract expires. For example, 2028
   * means the deal runs until 30/06/2028. A player whose contract expires
   * before the next window leaves for free unless renewed or sold first.
   */
  expiryYear: number;
  /** Annual gross salary in EUR m. */
  salary: number;
}

/**
 * Attributes shared by squad and market players.
 */
export interface PlayerCore {
  /** Stable unique identifier; also the key used in the action log. */
  id: string;
  name: string;
  position: Position;
  /** Age at the current window. Ages tick between seasons, not windows. */
  age: number;
  /**
   * Whether the player qualifies as home-grown under Premier League rules
   * (club- or association-trained). Independent of age: a U21 player carries
   * this flag for when they age past the U21 exemption.
   */
  homegrown: boolean;
  /**
   * Overall ability on a 0-100 scale. Drives the final squad rating and the
   * deterministic value progression between windows. Visible to the player
   * as part of making informed decisions.
   */
  quality: number;
}

/**
 * A record of how a squad player was acquired during the game. Present only
 * on players bought in-game; the starting squad carries no acquisition data
 * and therefore no transfer-fee amortisation burden (a deliberate
 * simplification: the game starts with a clean amortisation slate).
 */
export interface Acquisition {
  /** Transfer fee paid, in EUR m. */
  fee: number;
  /** Index of the window in which the player was signed. */
  windowIndex: number;
  /** Contract length in years agreed at signing; caps fee amortisation. */
  contractYears: number;
}

/**
 * A record of a contract renewal, kept so the renewal can be undone within
 * the window it was made in. A player may be renewed at most once per
 * playthrough: renew early and cheap, or late and expensive, but only once.
 */
export interface Renewal {
  /** The contract as it stood before the renewal. */
  previousContract: Contract;
  /** Index of the window in which the renewal was agreed. */
  windowIndex: number;
}

/**
 * Authored form of a squad player, as written in the data files. The engine
 * derives the runtime SquadPlayer from this at game start.
 */
export interface SquadPlayerSeed extends PlayerCore {
  /**
   * Underlying market value in EUR m, before the contract-length discount.
   * Drifts deterministically between windows with age and quality.
   */
  baseValue: number;
  /** True when the board refuses to sanction a sale. */
  locked: boolean;
  contract: Contract;
}

/**
 * A player currently registered at the club.
 */
export interface SquadPlayer extends SquadPlayerSeed {
  /**
   * Pre-agreed fee (EUR m) received if the player is sold this window.
   * Derived, never authored: baseValue discounted by remaining contract
   * length (a player running down their deal sells cheap). Recomputed on
   * renewal and on every window transition.
   */
  saleValue: number;
  /** Present only for players bought during the game. */
  acquisition?: Acquisition;
  /** Present only once renewed; a player renews at most once per game. */
  renewal?: Renewal;
}

/**
 * A player available to buy in a window's transfer market. Fees and contract
 * demands are pre-agreed: there is no negotiation phase.
 */
export interface MarketPlayer extends PlayerCore {
  /** Transfer fee (EUR m) required to sign the player. */
  fee: number;
  /** Annual salary (EUR m) the player will sign for. */
  wageDemand: number;
  /** Contract length in years the player demands. */
  contractYears: number;
  /**
   * Underlying market value (EUR m) if it differs from the fee. Free
   * agents cost nothing but are not worth nothing: without this, a free
   * signing would carry a zero book value forever.
   */
  baseValue?: number;
  /** True when the player's club refuses to sell: visible, unbuyable. */
  locked?: boolean;
  /** Current club, for the market browser. */
  club?: string;
  /** League key, for the market browser. */
  league?: string;
}

/** Why a player is no longer at the club. 'expired' arrives with M2. */
export type DepartureReason = 'sold' | 'expired';

/**
 * A player who has left the club during the game, retained so sales can be
 * undone within the same window and so the end screen can tell the story.
 */
export interface DepartedPlayer {
  player: SquadPlayer;
  reason: DepartureReason;
  windowIndex: number;
}

/**
 * Static configuration for a single transfer window.
 */
export interface WindowConfig {
  id: WindowId;
  /** Human-readable label, e.g. "Summer 2026". */
  label: string;
  /**
   * First calendar year of the season this window belongs to (2026 for both
   * 2026/27 windows, 2027 for Summer 2027). Contract arithmetic anchors
   * here: a five-year deal signed in a window expires seasonStartYear + 5.
   */
  seasonStartYear: number;
  /**
   * True for January windows. Mid-season, every contract is six months
   * closer to expiry than whole-year arithmetic suggests, which matters to
   * the sale-value discount curve.
   */
  midSeason: boolean;
  /** Fresh transfer budget (EUR m) granted by the board for this window. */
  budget: number;
  /**
   * Club revenue (EUR m) for the season this window belongs to: the basis
   * the squad cost ratio is measured against. Rising revenue across the
   * game's windows buys extra SCR headroom each season.
   */
  squadCostCapBase: number;
}

/**
 * Immutable configuration for an entire playthrough: the windows, the
 * starting squad, the market pool for each window, and the club's squad
 * cost ratio (SCR) baseline.
 */
export interface GameConfig {
  windows: readonly WindowConfig[];
  initialSquad: readonly SquadPlayerSeed[];
  /** One market pool per window, index-aligned with `windows`. */
  marketByWindow: readonly (readonly MarketPlayer[])[];
  /**
   * Annual squad cost (EUR m) already on the club's books at game start
   * beyond current fixed player salaries: historic transfer amortisation
   * plus the SCR components the game does not itemise (bonuses, coaching
   * staff wages, agent fees). A club-level total: starting squad players
   * carry no individual book values, so selling one removes their wage
   * from the SCR but never touches this baseline.
   */
  baselineAmortisation: number;
}

/**
 * Actions a player can take. The action log is the complete, replayable
 * record of a playthrough: replaying it through the reducers must always
 * reproduce the same final state (the determinism contract).
 */
/**
 * The starting eleven chosen in the final phase. playerIds are index-aligned
 * with the formation's slots.
 */
export interface XISelection {
  formationId: import('./formations').FormationId;
  playerIds: readonly string[];
}

export type Action =
  | { type: 'BUY'; playerId: string }
  | { type: 'UNDO_BUY'; playerId: string }
  | { type: 'SELL'; playerId: string }
  | { type: 'UNDO_SELL'; playerId: string }
  | { type: 'RENEW'; playerId: string; newExpiryYear: number }
  | { type: 'UNDO_RENEW'; playerId: string }
  /**
   * Submits the current window and opens the next. One-way: earlier windows
   * cannot be reopened. Rejected while soft-constraint violations remain.
   */
  | { type: 'ADVANCE_WINDOW' }
  /**
   * Chooses the starting eleven. Final window only; re-picking overwrites.
   * Part of the action log so a replay can recompute the score.
   */
  | { type: 'PICK_XI'; selection: XISelection };

/**
 * The complete game state at any point in a playthrough.
 */
export interface GameState {
  config: GameConfig;
  /** Index into config.windows for the window currently open. */
  windowIndex: number;
  /**
   * Funds available to spend (EUR m): this window's budget, plus rolled-over
   * funds from earlier windows, plus sale proceeds, minus fees paid. May go
   * negative mid-plan; validation flags it, submission blocks on it.
   */
  funds: number;
  squad: readonly SquadPlayer[];
  /** Players still available to buy in the current window. */
  market: readonly MarketPlayer[];
  departed: readonly DepartedPlayer[];
  /** The chosen starting eleven; set by PICK_XI in the final window. */
  xi?: XISelection;
  /** Append-only record of every action applied so far. */
  actionLog: readonly Action[];
}

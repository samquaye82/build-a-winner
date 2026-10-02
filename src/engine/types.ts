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
 * January 2027 sits mid-season in 2026/27; Summer 2027 opens the 2027/28
 * season and January 2028 sits mid-season within it. Only one season
 * boundary is crossed, between the first window and the second.
 */
export type WindowId = 'january-2027' | 'summer-2027' | 'january-2028';

/**
 * UEFA locally-trained status, relative to the club that holds the player.
 *
 * Locally trained means registered for three entire seasons, or 36 months,
 * between the ages of 15 and 21:
 * - 'club': with the club itself (club-trained);
 * - 'association': with another club in the same national association
 *   (association-trained);
 * - 'none': neither.
 *
 * Distinct from `homegrown`, the Premier League's rule, which does not
 * tell the two kinds apart. UEFA does: List A reserves eight places for
 * locally trained players, and at most four of them may be
 * association-trained.
 */
export type UefaTraining = 'club' | 'association' | 'none';

/**
 * A point in the game calendar, in the same terms the windows use: the
 * season's start year, and whether the point falls mid-season (January)
 * rather than at the season's opening (summer). 2026/27's January window
 * is { season: 2026, midSeason: true }.
 */
export interface SeasonPoint {
  season: number;
  midSeason: boolean;
}

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
  /**
   * UEFA locally-trained status relative to the player's current club.
   * Absent means 'none'. Held static across the game, and authored as the
   * status the player has, or will have, once it can matter: training only
   * counts on List A, and a player still accruing it is 21 or under, so he
   * sits on List B whenever he has been at the club long enough to accrue
   * it.
   */
  uefaTraining?: UefaTraining;
  /**
   * When the player's current, uninterrupted spell at his club began. Sets
   * UEFA List B tenure, which needs two years. Absent means unknown, and an
   * unknown spell never counts as long enough. A signing's spell starts in
   * the window he joins in, so the engine stamps it on purchase.
   */
  joined?: SeasonPoint;
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
 * A record that a player was promoted from the academy into the first-team
 * squad, kept so the promotion can be undone within the window it was made
 * in. Present only on players promoted during the game.
 */
export interface Promotion {
  /** Index of the window in which the player was promoted. */
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
  /**
   * Window index from which a locked player becomes sellable. Absent means
   * the lock never lifts. The board protects the spine through the opening
   * window and then listens to offers, so protection is a decision deferred
   * rather than a permanent exemption.
   */
  unlocksInWindow?: number;
  /**
   * True when the player is at the club on loan for the season. He fills a
   * registration slot and plays, but he is not the club's to sell: the game
   * models no loan mechanics beyond this, so he simply cannot be traded.
   */
  onLoan?: boolean;
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
  /**
   * The market listing this player was signed from, retained so a same-window
   * undo can restore it exactly. Needed because progression-created free
   * agents (an expired player who re-entered the market) are not in the
   * authored config pool, so the listing cannot be reconstructed from config.
   */
  boughtFrom?: MarketPlayer;
  /** Present only once renewed; a player renews at most once per game. */
  renewal?: Renewal;
  /**
   * Present only for players promoted from the academy during the game.
   * Promoted players carry no acquisition (they arrive for free), so they
   * add wages but no amortisation to the squad cost.
   */
  promotion?: Promotion;
}

/**
 * Authored form of an academy player, as written in the data files. Academy
 * players sit outside the first-team squad: they are invisible to every
 * topline number, the registration count and the squad cost until promoted
 * (see the PROMOTE action). The engine derives a runtime SquadPlayer from
 * this at game start, exactly as it does for the starting squad.
 */
export interface AcademyPlayerSeed extends PlayerCore {
  /**
   * Underlying market value in EUR m, before the contract-length discount.
   * Academy values are fixed: unlike squad players they do not drift between
   * windows (Sam, 25/07/2026), though the player still ages.
   */
  baseValue: number;
  contract: Contract;
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

/**
 * Why a player is no longer at the club. 'expired' arrives with M2.
 * 'loan-ended' is distinct from 'expired' because the two lead somewhere
 * different: an expired player becomes a free agent anyone can sign, while
 * a loanee simply goes back to the club that owns him.
 */
export type DepartureReason = 'sold' | 'expired' | 'loan-ended';

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
 * A rival club for the end-of-game season projection. Strength is a single
 * 0-100 rating in the same units as player quality; the simulation treats it
 * as both the rival's attack and defence.
 */
export interface RivalTeam {
  name: string;
  /** Overall strength, 0-100 (same scale as player quality). */
  strength: number;
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
   * Academy players available to promote into the first-team squad. A single
   * pool shared across all windows: it is not authored per window, and it
   * carries forward (minus anyone already promoted) as the game advances.
   * Optional so configs without an academy stay valid.
   */
  academy?: readonly AcademyPlayerSeed[];
  /**
   * Rival clubs for the end-of-game season projection: each is played home
   * and away, so nineteen rivals make a 38-game season. Optional; the
   * simulation falls back to a league of average opponents when absent.
   */
  rivals?: readonly RivalTeam[];
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
   * Promotes an academy player into the first-team squad. Free of charge;
   * from this point they count towards every topline number and the squad
   * cost, and become sellable. Undoable within the window it was made in.
   */
  | { type: 'PROMOTE'; playerId: string }
  | { type: 'UNDO_PROMOTE'; playerId: string }
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
  /**
   * Academy players not yet promoted. Runtime SquadPlayers (they carry a
   * derived saleValue) but held apart from `squad` so they are excluded from
   * every rule and topline figure until PROMOTE moves them across.
   */
  academy: readonly SquadPlayer[];
  departed: readonly DepartedPlayer[];
  /** The chosen starting eleven; set by PICK_XI in the final window. */
  xi?: XISelection;
  /** Append-only record of every action applied so far. */
  actionLog: readonly Action[];
}

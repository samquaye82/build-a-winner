/**
 * Final squad rating.
 *
 * Five weighted components (re-weighted with Sam, 13/07/2026):
 *
 *   Squad Quality  35%  0.6 x XI average quality + 0.4 x depth (best ten
 *                       outside the XI; missing bodies score zero)
 *   Balance        25%  positional coverage against the healthy-squad
 *                       template; extras beyond the template earn nothing
 *   Age profile    15%  per-player age-band scores, averaged
 *   Contract health 20% per-player remaining-months scores at game end,
 *                       weighted by quality (a star running down their deal
 *                       hurts far more than a reserve)
 *   Value created   5%  (final squad value + funds) vs (starting squad
 *                       value + all budgets granted); players away on
 *                       loan count on both sides
 *
 * Component scores are 0-100 and rounded to one decimal; the total is a
 * whole number. A squad below MIN_VIABLE_SQUAD_SIZE is not fit for
 * purpose and its total is capped at UNVIABLE_SQUAD_MAX_SCORE, however
 * strong the XI. Everything is pure and deterministic.
 */
import {
  AGE_SCORE_BANDS,
  BALANCE_QUALITY_REFERENCE,
  BALANCE_TEMPLATE,
  CONTRACT_HEALTH_BY_MONTHS,
  CONTRACT_QUALITY_PIVOT,
  CONTRACT_QUALITY_SCALE,
  CONTRACT_WAGE_PENALTY_PER_M,
  DEREGISTRATION_SCORE_PENALTY,
  MIN_VIABLE_SQUAD_SIZE,
  SCORING_WEIGHTS,
  SQUAD_QUALITY_DEPTH_WEIGHT,
  SQUAD_QUALITY_XI_WEIGHT,
  UNVIABLE_SQUAD_MAX_SCORE,
  VALUE_CREATED_BASE,
  VALUE_CREATED_SLOPE,
} from './constants';
import { EngineError } from './errors';
import { FORMATIONS, type Formation, type FormationId } from './formations';
import { roundMoney } from './money';
import {
  droppedValue,
  isDuePenalty,
  isRegisteredFor,
  registeredFor,
} from './rules/deregistration';
import { remainingMonths } from './rules/value';
import { currentWindow } from './state';
import type { GameState, SquadPlayer, XISelection } from './types';

/** Full rating breakdown, for the end screen and tests. */
export interface ScoreBreakdown {
  squadQuality: { xiAverage: number; depthAverage: number; score: number };
  balance: { score: number };
  ageProfile: { score: number };
  contractHealth: { score: number };
  valueCreated: {
    ratio: number;
    /** The component score, after any deregistration penalty. */
    score: number;
    /** Players penalised for deregistration this game. */
    deregistered: number;
    /** Points taken off the component for them. */
    penalty: number;
  };
  /**
   * The weighted rating before the squad-size cap. Equals total unless the
   * squad is below MIN_VIABLE_SQUAD_SIZE.
   */
  rawTotal: number;
  /** True when total was capped because the squad is too small. */
  squadSizeCapped: boolean;
  /** The final rating out of 100, whole number (post-cap). */
  total: number;
}

/**
 * Validates an XI selection against the squad and formation.
 *
 * @param state - The current game state.
 * @param selection - The proposed starting eleven.
 * @throws {EngineError} INVALID_XI when the selection is malformed: unknown
 *   formation, wrong length, duplicates, players not in the squad, a
 *   player off the Premier League list, or a player in a slot their
 *   position cannot fill.
 */
export function validateXI(state: GameState, selection: XISelection): void {
  // Typed as possibly-undefined deliberately: a replayed action log from an
  // untrusted client may carry a formation id the type system never saw.
  const formation: Formation | undefined = FORMATIONS[selection.formationId];
  if (formation === undefined) {
    throw new EngineError(
      'INVALID_XI',
      `Unknown formation ${String(selection.formationId)}`,
    );
  }
  if (selection.playerIds.length !== formation.slots.length) {
    throw new EngineError(
      'INVALID_XI',
      `An XI needs ${String(formation.slots.length)} players; got ${String(selection.playerIds.length)}`,
    );
  }
  if (new Set(selection.playerIds).size !== selection.playerIds.length) {
    throw new EngineError('INVALID_XI', 'The XI contains duplicate players');
  }

  const byId = new Map(state.squad.map((p) => [p.id, p]));
  formation.slots.forEach((slot, index) => {
    const playerId = selection.playerIds[index];
    const player = playerId === undefined ? undefined : byId.get(playerId);
    if (player === undefined) {
      throw new EngineError(
        'INVALID_XI',
        `Player ${String(playerId)} is not in the squad`,
      );
    }
    if (!isRegisteredFor(player, 'PL')) {
      throw new EngineError(
        'INVALID_XI',
        `${player.name} is off the Premier League list and cannot play`,
      );
    }
    if (!slot.eligible.includes(player.position)) {
      throw new EngineError(
        'INVALID_XI',
        `${player.name} (${player.position}) cannot fill the ${slot.label} slot`,
      );
    }
  });
}

/**
 * Computes the final rating for a finished game.
 *
 * @param state - The game state after the final window, with an XI picked.
 * @returns The full score breakdown.
 * @throws {EngineError} XI_NOT_PICKED if no XI has been chosen.
 */
export function scoreGame(state: GameState): ScoreBreakdown {
  if (state.xi === undefined) {
    throw new EngineError(
      'XI_NOT_PICKED',
      'Pick a starting eleven before scoring the game',
    );
  }
  // Defensive re-validation: state.xi was validated by PICK_XI, but scoring
  // may also be called on replayed or reconstructed states.
  validateXI(state, state.xi);

  // Only players on the Premier League list can play, so only they count
  // towards quality, depth, balance and the size cap. Age, contracts and
  // value judge every player the club holds: a deregistered player is still
  // the club's, and so is one still away on loan (Sam, 02/10/2026).
  const playable = registeredFor(state.squad, 'PL');
  const held = clubPlayers(state);
  const xiIds = new Set(state.xi.playerIds);
  const xiPlayers = playable.filter((p) => xiIds.has(p.id));
  const rest = playable.filter((p) => !xiIds.has(p.id));

  const squadQuality = scoreSquadQuality(xiPlayers, rest);
  const balance = scoreBalance(playable);
  const ageProfile = scoreAgeProfile(held);
  const contractHealth = scoreContractHealth(state);
  const valueCreated = scoreValueCreated(state);

  const rawTotal = Math.round(
    SCORING_WEIGHTS.squadQuality * squadQuality.score +
      SCORING_WEIGHTS.balance * balance.score +
      SCORING_WEIGHTS.ageProfile * ageProfile.score +
      SCORING_WEIGHTS.contractHealth * contractHealth.score +
      SCORING_WEIGHTS.valueCreated * valueCreated.score,
  );

  // A squad too small to cover the healthy-squad template is not fit for
  // purpose: cap the rating however good the eleven picked from it looks.
  const squadSizeCapped = playable.length < MIN_VIABLE_SQUAD_SIZE;
  const total = squadSizeCapped
    ? Math.min(rawTotal, UNVIABLE_SQUAD_MAX_SCORE)
    : rawTotal;

  return {
    squadQuality,
    balance,
    ageProfile,
    contractHealth,
    valueCreated,
    rawTotal,
    squadSizeCapped,
    total,
  };
}

/**
 * Auto-selects the highest-quality legal XI from the current squad.
 *
 * Used for the provisional interim rating, before the player has picked
 * their own eleven. Fully deterministic: formations are tried in their
 * declared order and players are ranked by quality with an id tie-break, so
 * identical squads always yield identical selections.
 *
 * @param state - The current game state.
 * @returns The best XI: the formation and assignment maximising total XI
 *   quality.
 * @throws {EngineError} XI_NOT_PICKED if no formation can be filled from the
 *   current squad (too few bodies or missing positional cover).
 */
export function autoPickBestXI(state: GameState): XISelection {
  // Positional groups now overlap (a CM is eligible in defensive slots, an AM
  // in wide slots), so a slot-by-slot greedy pick can dead-end: it might spend
  // the only midfielder on a defensive slot and leave a midfield slot
  // unfillable. Instead each formation is filled by a proper maximum-weight
  // assignment (see fillFormation), which is both feasible-complete and
  // quality-optimal.
  //
  // Each player carries a weight of quality first, with a small tie-break
  // bonus that favours the alphabetically-earlier id. The bonus is always
  // smaller than one quality point, so quality dominates the assignment while
  // ties resolve deterministically towards smaller ids (the same convention
  // used elsewhere in the engine).
  const byId = [...state.squad].sort((a, b) => a.id.localeCompare(b.id));
  const count = byId.length;
  const weightById = new Map(
    byId.map((p, index) => [p.id, p.quality + (count - index) / (count + 1)]),
  );
  // Players off the Premier League list cannot be picked.
  const players: WeightedPlayer[] = registeredFor(state.squad, 'PL').map((p) => ({
    id: p.id,
    position: p.position,
    quality: p.quality,
    weight: weightById.get(p.id) ?? p.quality,
  }));

  let best: { formationId: FormationId; playerIds: string[]; total: number } | undefined;
  for (const formation of Object.values(FORMATIONS)) {
    const filled = fillFormation(players, formation);
    if (filled === undefined) {
      continue;
    }
    // Formations are compared on total quality alone; the id tie-break keeps
    // the choice deterministic when several shapes field an equal-quality XI.
    if (
      best === undefined ||
      filled.total > best.total ||
      (filled.total === best.total && formation.id.localeCompare(best.formationId) < 0)
    ) {
      best = { formationId: formation.id, ...filled };
    }
  }

  if (best === undefined) {
    throw new EngineError(
      'XI_NOT_PICKED',
      'No legal XI can be formed from the current squad',
    );
  }
  return { formationId: best.formationId, playerIds: best.playerIds };
}

/** A squad player reduced to what the XI assignment needs, plus its weight. */
interface WeightedPlayer {
  id: string;
  position: SquadPlayer['position'];
  quality: number;
  /** Quality plus a sub-unit id tie-break bonus; drives the assignment. */
  weight: number;
}

/**
 * Assigns players to every slot of a formation, maximising total weight.
 *
 * Solves the assignment as a maximum-weight bipartite matching (slots to
 * players) so it copes with overlapping positional groups where a greedy pass
 * would fail. Deterministic: the player weights are distinct, so identical
 * squads always produce identical assignments.
 *
 * @param players - The squad as weighted players.
 * @param formation - The formation to fill.
 * @returns The chosen player ids in slot order and their total quality, or
 *   undefined if the formation cannot be legally filled.
 */
function fillFormation(
  players: readonly WeightedPlayer[],
  formation: Formation,
): { playerIds: string[]; total: number } | undefined {
  const slots = formation.slots;
  const slotCount = slots.length;
  // The assignment needs at least as many columns (players) as rows (slots);
  // fewer players than slots is trivially unfillable.
  if (players.length < slotCount) {
    return undefined;
  }

  // Cost matrix for a MINIMISING solver: negate the weight of eligible
  // pairings and make ineligible pairings prohibitively expensive.
  const PROHIBITED = 1e6;
  const cost = slots.map((slot) =>
    players.map((player) =>
      slot.eligible.includes(player.position) ? -player.weight : PROHIBITED,
    ),
  );

  const assignment = minCostAssignment(cost);

  const playerIds: string[] = [];
  let total = 0;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    const playerIndex = assignment[slotIndex];
    const player = playerIndex === undefined ? undefined : players[playerIndex];
    // A prohibited pairing surviving into the result means no legal XI exists.
    if (player === undefined || !slots[slotIndex]?.eligible.includes(player.position)) {
      return undefined;
    }
    playerIds.push(player.id);
    total += player.quality;
  }
  return { playerIds, total };
}

/**
 * Solves the rectangular assignment problem (Kuhn-Munkres with potentials):
 * assigns each row to a distinct column so total cost is minimised.
 *
 * @param cost - A rows x cols cost matrix; rows must not exceed cols.
 * @returns For each row, the column assigned to it.
 */
function minCostAssignment(cost: readonly (readonly number[])[]): number[] {
  const rows = cost.length;
  const cols = cost[0]?.length ?? 0;
  const INF = Number.POSITIVE_INFINITY;

  // Potentials and the current column->row matching (1-indexed; 0 = unmatched).
  const rowPotential = new Array<number>(rows + 1).fill(0);
  const colPotential = new Array<number>(cols + 1).fill(0);
  const matchByCol = new Array<number>(cols + 1).fill(0);
  const parentCol = new Array<number>(cols + 1).fill(0);

  for (let row = 1; row <= rows; row += 1) {
    matchByCol[0] = row;
    let curCol = 0;
    const minCost = new Array<number>(cols + 1).fill(INF);
    const visited = new Array<boolean>(cols + 1).fill(false);

    // Grow an augmenting path from this row until it reaches a free column.
    do {
      visited[curCol] = true;
      const curRow = matchByCol[curCol] ?? 0;
      let delta = INF;
      let nextCol = 0;
      for (let col = 1; col <= cols; col += 1) {
        if (visited[col]) {
          continue;
        }
        const reduced =
          (cost[curRow - 1]?.[col - 1] ?? INF) -
          (rowPotential[curRow] ?? 0) -
          (colPotential[col] ?? 0);
        if (reduced < (minCost[col] ?? INF)) {
          minCost[col] = reduced;
          parentCol[col] = curCol;
        }
        if ((minCost[col] ?? INF) < delta) {
          delta = minCost[col] ?? INF;
          nextCol = col;
        }
      }
      for (let col = 0; col <= cols; col += 1) {
        if (visited[col]) {
          const matchedRow = matchByCol[col] ?? 0;
          rowPotential[matchedRow] = (rowPotential[matchedRow] ?? 0) + delta;
          colPotential[col] = (colPotential[col] ?? 0) - delta;
        } else {
          minCost[col] = (minCost[col] ?? INF) - delta;
        }
      }
      curCol = nextCol;
    } while ((matchByCol[curCol] ?? 0) !== 0);

    // Flip the matching along the augmenting path.
    do {
      const prevCol = parentCol[curCol] ?? 0;
      matchByCol[curCol] = matchByCol[prevCol] ?? 0;
      curCol = prevCol;
    } while (curCol);
  }

  const result = new Array<number>(rows).fill(-1);
  for (let col = 1; col <= cols; col += 1) {
    const row = matchByCol[col] ?? 0;
    if (row > 0) {
      result[row - 1] = col - 1;
    }
  }
  return result;
}

/**
 * Scores the current squad using an auto-picked best XI.
 *
 * This is the provisional rating shown at the interim window review, where
 * the player has not yet chosen their eleven. The final rating still uses
 * the player's own PICK_XI; this only borrows a best-XI so the same five
 * components can be shown as a checkpoint.
 *
 * @param state - The current game state.
 * @returns The score breakdown, computed against the auto-picked XI.
 * @throws {EngineError} XI_NOT_PICKED if no legal XI can be formed.
 */
export function scoreProvisional(state: GameState): ScoreBreakdown {
  return scoreGame({ ...state, xi: autoPickBestXI(state) });
}

/**
 * Every player the club holds: the squad, plus anyone away on loan.
 *
 * @param state - The game state.
 * @returns The players, squad first.
 */
function clubPlayers(state: GameState): SquadPlayer[] {
  return [...state.squad, ...state.loanedOut.map((loan) => loan.player)];
}

/** Squad Quality: weighted XI average and whole-squad depth average. */
function scoreSquadQuality(
  xiPlayers: readonly SquadPlayer[],
  rest: readonly SquadPlayer[],
): ScoreBreakdown['squadQuality'] {
  const xiAverage =
    xiPlayers.reduce((sum, p) => sum + p.quality, 0) / xiPlayers.length;

  // Depth is the average of EVERY player outside the XI (Sam, 25/07/2026):
  // injuries and rotation mean the whole tail can be called on, so weak
  // reserves drag the score down rather than being ignored. An XI-only squad
  // has no depth and scores zero on this half.
  const depthAverage =
    rest.length > 0
      ? rest.reduce((sum, p) => sum + p.quality, 0) / rest.length
      : 0;

  return {
    xiAverage: roundMoney(xiAverage),
    depthAverage: roundMoney(depthAverage),
    score: roundMoney(
      SQUAD_QUALITY_XI_WEIGHT * xiAverage +
        SQUAD_QUALITY_DEPTH_WEIGHT * depthAverage,
    ),
  };
}

/** Balance: quality-weighted positional coverage against the template. */
function scoreBalance(
  squad: readonly SquadPlayer[],
): ScoreBreakdown['balance'] {
  const positions = Object.keys(BALANCE_TEMPLATE);
  let coverage = 0;
  for (const position of positions) {
    const required = BALANCE_TEMPLATE[position];
    if (required === undefined || required <= 0) {
      continue;
    }
    // Each player contributes a quality-weighted fraction of a covered slot
    // (Sam, 25/07/2026): a player at or above the reference counts as a full
    // unit, a weaker one for less, so a promoted academy player covers the
    // position but not as fully as a star.
    const contributed = squad
      .filter((p) => p.position === position)
      .reduce(
        (sum, p) => sum + Math.min(p.quality / BALANCE_QUALITY_REFERENCE, 1),
        0,
      );
    coverage += Math.min(contributed, required) / required;
  }
  return { score: roundMoney((coverage / positions.length) * 100) };
}

/** Age profile: quality-weighted per-player age-band scores. */
function scoreAgeProfile(
  squad: readonly SquadPlayer[],
): ScoreBreakdown['ageProfile'] {
  // Quality-weighted (Sam, 25/07/2026): a well-aged squad matters only to the
  // extent its good players are well-aged; a 65-rated teenager barely moves it.
  let weighted = 0;
  let totalQuality = 0;
  for (const player of squad) {
    weighted += player.quality * ageScore(player.age);
    totalQuality += player.quality;
  }
  const score = totalQuality > 0 ? (weighted / totalQuality) * 100 : 0;
  return { score: roundMoney(score) };
}

/** The age-band score for a single age. */
function ageScore(age: number): number {
  const band = AGE_SCORE_BANDS.find((b) => age <= b.maxAge);
  if (band === undefined) {
    // Unreachable: the last band's maxAge is Infinity.
    throw new Error(`No age band for age ${String(age)}`);
  }
  return band.score;
}

/**
 * Contract health: quality-aware asset/liability scoring (Sam, 25/07/2026).
 *
 * Each player sits in one of four quadrants of tenure x quality:
 *  - a good player on a long deal is an asset (securing a star);
 *  - a good player running down their deal is a liability (about to be lost);
 *  - a below-par player on a long deal is a liability (stuck with them), the
 *    more so the bigger their wage;
 *  - a below-par player running down their deal is fine (they will leave).
 *
 * Per player: (2 x tenure - 1), from +1 (secured) to -1 (expiring), times a
 * quality standing from +1 (well above the pivot) to -1 (well below). A
 * below-par, still-secured player has their (negative) score amplified by
 * their wage. The squad average maps onto 0-100 with 50 as neutral.
 */
function scoreContractHealth(
  state: GameState,
): ScoreBreakdown['contractHealth'] {
  const window = currentWindow(state);
  let sum = 0;

  const held = clubPlayers(state);
  for (const player of held) {
    const months = remainingMonths(player.contract.expiryYear, window);
    const tenure =
      CONTRACT_HEALTH_BY_MONTHS.find((r) => months >= r.minMonths)?.score ?? 0;
    const secured = 2 * tenure - 1; // +1 locked in, -1 running out

    const standing = Math.max(
      -1,
      Math.min(1, (player.quality - CONTRACT_QUALITY_PIVOT) / CONTRACT_QUALITY_SCALE),
    );

    let contribution = secured * standing;
    // Stuck with a below-par player on a big wage: a long deal makes it worse.
    if (standing < 0 && secured > 0) {
      contribution *= 1 + player.contract.salary * CONTRACT_WAGE_PENALTY_PER_M;
    }
    sum += contribution;
  }

  const average = held.length > 0 ? sum / held.length : 0;
  const score = Math.max(0, Math.min(100, 50 + 50 * average));
  return { score: roundMoney(score) };
}

/**
 * Value created: how the club's total worth (squad base values plus cash)
 * moved against everything the board handed over.
 */
function scoreValueCreated(
  state: GameState,
): ScoreBreakdown['valueCreated'] {
  // Players away on loan are the club's from the start, so they count in
  // what was handed over and in what is handed back (Sam, 02/10/2026).
  // Otherwise their automatic return would read as value the player made.
  const startingWorth =
    state.config.initialSquad.reduce((sum, p) => sum + p.baseValue, 0) +
    (state.config.loanedOut ?? []).reduce((sum, l) => sum + l.player.baseValue, 0) +
    state.config.windows.reduce((sum, w) => sum + w.budget, 0);
  // The game's end closes the final window, so a player still off a list
  // then is penalised as any earlier close would have done: his value drops
  // and he joins those already penalised (Sam, 02/10/2026).
  const dueAtEnd = state.squad.filter((p) => isDuePenalty(state, p));
  const dueIds = new Set(dueAtEnd.map((p) => p.id));
  const finalWorth =
    state.squad.reduce(
      (sum, p) => sum + (dueIds.has(p.id) ? droppedValue(p.baseValue) : p.baseValue),
      0,
    ) +
    state.loanedOut.reduce((sum, l) => sum + l.player.baseValue, 0) +
    state.funds;

  const ratio = finalWorth / startingWorth;
  const earned = Math.min(
    100,
    Math.max(0, VALUE_CREATED_BASE + (ratio - 1) * VALUE_CREATED_SLOPE),
  );
  const deregistered = state.deregistrationPenalties.length + dueAtEnd.length;
  const penalty = deregistered * DEREGISTRATION_SCORE_PENALTY;

  return {
    ratio: Math.round(ratio * 1000) / 1000,
    score: roundMoney(Math.max(0, earned - penalty)),
    deregistered,
    penalty,
  };
}

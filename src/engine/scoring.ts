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
 *                       value + all budgets granted)
 *
 * Component scores are 0-100 and rounded to one decimal; the total is a
 * whole number. Everything is pure and deterministic.
 */
import {
  AGE_SCORE_BANDS,
  BALANCE_TEMPLATE,
  CONTRACT_HEALTH_BY_MONTHS,
  DEPTH_PLAYER_COUNT,
  SCORING_WEIGHTS,
  SQUAD_QUALITY_DEPTH_WEIGHT,
  SQUAD_QUALITY_XI_WEIGHT,
  VALUE_CREATED_BASE,
  VALUE_CREATED_SLOPE,
} from './constants';
import { EngineError } from './errors';
import { FORMATIONS, type Formation } from './formations';
import { roundMoney } from './money';
import { remainingMonths } from './rules/value';
import { currentWindow } from './state';
import type { GameState, SquadPlayer, XISelection } from './types';

/** Full rating breakdown, for the end screen and tests. */
export interface ScoreBreakdown {
  squadQuality: { xiAverage: number; depthAverage: number; score: number };
  balance: { score: number };
  ageProfile: { score: number };
  contractHealth: { score: number };
  valueCreated: { ratio: number; score: number };
  /** The final rating out of 100, whole number. */
  total: number;
}

/**
 * Validates an XI selection against the squad and formation.
 *
 * @param state - The current game state.
 * @param selection - The proposed starting eleven.
 * @throws {EngineError} INVALID_XI when the selection is malformed: unknown
 *   formation, wrong length, duplicates, players not in the squad, or a
 *   player in a slot their position cannot fill.
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

  const xiIds = new Set(state.xi.playerIds);
  const xiPlayers = state.squad.filter((p) => xiIds.has(p.id));
  const rest = state.squad.filter((p) => !xiIds.has(p.id));

  const squadQuality = scoreSquadQuality(xiPlayers, rest);
  const balance = scoreBalance(state.squad);
  const ageProfile = scoreAgeProfile(state.squad);
  const contractHealth = scoreContractHealth(state);
  const valueCreated = scoreValueCreated(state);

  const total = Math.round(
    SCORING_WEIGHTS.squadQuality * squadQuality.score +
      SCORING_WEIGHTS.balance * balance.score +
      SCORING_WEIGHTS.ageProfile * ageProfile.score +
      SCORING_WEIGHTS.contractHealth * contractHealth.score +
      SCORING_WEIGHTS.valueCreated * valueCreated.score,
  );

  return { squadQuality, balance, ageProfile, contractHealth, valueCreated, total };
}

/** Squad Quality: weighted XI average and best-ten depth average. */
function scoreSquadQuality(
  xiPlayers: readonly SquadPlayer[],
  rest: readonly SquadPlayer[],
): ScoreBreakdown['squadQuality'] {
  const xiAverage =
    xiPlayers.reduce((sum, p) => sum + p.quality, 0) / xiPlayers.length;

  // Best DEPTH_PLAYER_COUNT non-XI players; a short bench pads with zeros.
  const bestRest = [...rest]
    .sort((a, b) => b.quality - a.quality)
    .slice(0, DEPTH_PLAYER_COUNT);
  const depthAverage =
    bestRest.reduce((sum, p) => sum + p.quality, 0) / DEPTH_PLAYER_COUNT;

  return {
    xiAverage: roundMoney(xiAverage),
    depthAverage: roundMoney(depthAverage),
    score: roundMoney(
      SQUAD_QUALITY_XI_WEIGHT * xiAverage +
        SQUAD_QUALITY_DEPTH_WEIGHT * depthAverage,
    ),
  };
}

/** Balance: positional coverage against the template. */
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
    const count = squad.filter((p) => p.position === position).length;
    coverage += Math.min(count, required) / required;
  }
  return { score: roundMoney((coverage / positions.length) * 100) };
}

/** Age profile: averaged per-player age-band scores. */
function scoreAgeProfile(
  squad: readonly SquadPlayer[],
): ScoreBreakdown['ageProfile'] {
  const sum = squad.reduce((acc, p) => acc + ageScore(p.age), 0);
  return { score: roundMoney((sum / squad.length) * 100) };
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

/** Contract health: quality-weighted remaining-months scores. */
function scoreContractHealth(
  state: GameState,
): ScoreBreakdown['contractHealth'] {
  const window = currentWindow(state);
  let weighted = 0;
  let totalQuality = 0;

  for (const player of state.squad) {
    const months = remainingMonths(player.contract.expiryYear, window);
    const row = CONTRACT_HEALTH_BY_MONTHS.find((r) => months >= r.minMonths);
    weighted += player.quality * (row?.score ?? 0);
    totalQuality += player.quality;
  }

  return { score: roundMoney((weighted / totalQuality) * 100) };
}

/**
 * Value created: how the club's total worth (squad base values plus cash)
 * moved against everything the board handed over.
 */
function scoreValueCreated(
  state: GameState,
): ScoreBreakdown['valueCreated'] {
  const startingWorth =
    state.config.initialSquad.reduce((sum, p) => sum + p.baseValue, 0) +
    state.config.windows.reduce((sum, w) => sum + w.budget, 0);
  const finalWorth =
    state.squad.reduce((sum, p) => sum + p.baseValue, 0) + state.funds;

  const ratio = finalWorth / startingWorth;
  const score = Math.min(
    100,
    Math.max(0, VALUE_CREATED_BASE + (ratio - 1) * VALUE_CREATED_SLOPE),
  );

  return { ratio: Math.round(ratio * 1000) / 1000, score: roundMoney(score) };
}

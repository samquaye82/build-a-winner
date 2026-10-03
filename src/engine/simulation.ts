/**
 * End-of-game season projection.
 *
 * A deterministic expected-goals model that projects the chosen XI's record
 * over a 38-game league season. It is separate from and additional to the
 * 0-100 squad rating in scoring.ts: it never feeds into that score.
 *
 * Both our team and each rival are reduced to a single strength via the same
 * full-squad methodology used for Squad quality (Sam, 25/07/2026):
 * SQUAD_QUALITY_XI_WEIGHT x the average quality of the best/chosen XI plus
 * SQUAD_QUALITY_DEPTH_WEIGHT x the average of the rest of the squad. Per fixture (each rival home and away) expected goals for each
 * side come from the strength ratio with a home-field swing, and a Poisson
 * model turns those into win/draw/loss probabilities. Summed over the season
 * they give the projected record, points and goals.
 *
 * Everything here is pure and deterministic: no randomness, so identical
 * squads always project identical seasons (the engine's determinism
 * contract).
 */
import {
  SIM_DEFAULT_RIVAL_COUNT,
  SIM_DEFAULT_RIVAL_STRENGTH,
  SIM_HOME_ADVANTAGE,
  SIM_LEAGUE_BASE_GOALS,
  SIM_MAX_GOALS,
  SIM_MIN_EFFECTIVE_STRENGTH,
  SIM_STRENGTH_ELASTICITY,
  SIM_STRENGTH_SPREAD,
  SIM_VERDICT_BANDS,
  SQUAD_QUALITY_DEPTH_WEIGHT,
  SQUAD_QUALITY_XI_WEIGHT,
} from './constants';
import { EngineError } from './errors';
import { registeredFor } from './rules/deregistration';
import { validateXI } from './scoring';
import type { GameState, RivalTeam, SquadPlayer } from './types';

/** Players in a starting eleven. */
const XI_SIZE = 11;

/** The projected outcome of a 38-game league season. */
export interface SeasonProjection {
  /** Games played (twice the rival count; 38 for a full league). */
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  /** Our full-squad strength (0-100), XI blended with the rest of the squad. */
  strength: number;
  /** Verdict band label for the squad's strength (see SIM_VERDICT_BANDS). */
  verdict: string;
  /** True when the projection loses no games: an Invincible season. */
  invincible: boolean;
}

/**
 * Projects the chosen XI's league season.
 *
 * @param state - The game state after the final window, with an XI picked.
 * @returns The projected record, points, goals and verdict.
 * @throws {EngineError} XI_NOT_PICKED if no XI has been chosen; INVALID_XI if
 *   the stored selection is malformed.
 */
export function simulateSeason(state: GameState): SeasonProjection {
  if (state.xi === undefined) {
    throw new EngineError(
      'XI_NOT_PICKED',
      'Pick a starting eleven before projecting the season',
    );
  }
  // Defensive re-validation: the XI may arrive via a replayed state.
  validateXI(state, state.xi);

  const byId = new Map(state.squad.map((p) => [p.id, p]));
  const xiIds = new Set(state.xi.playerIds);
  const xiPlayers = state.xi.playerIds
    .map((id) => byId.get(id))
    .filter((p): p is SquadPlayer => p !== undefined);
  // Players off the Premier League list cannot play, so they add no depth.
  const rest = registeredFor(state.squad, 'PL').filter((p) => !xiIds.has(p.id));

  // Our strength via the full-squad methodology: the chosen XI blended with
  // the whole of the rest of the squad, exactly as Squad quality is scored.
  const strength = fullSquadStrength(
    xiPlayers.map((p) => p.quality),
    rest.map((p) => p.quality),
  );

  const rivals = rivalsAt(state);

  // Full-squad strengths bunch near the league average, so stretch each team's
  // distance from the mean before the match model. Without this the league
  // draws its way to mid-table and strength does not track points.
  const leagueMean =
    (strength + rivals.reduce((sum, r) => sum + r.strength, 0)) /
    (rivals.length + 1);
  const ourEffective = stretchStrength(strength, leagueMean);

  let expectedWins = 0;
  let expectedDraws = 0;
  let expectedLosses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const rival of rivals) {
    const rivalEffective = stretchStrength(rival.strength, leagueMean);
    for (const atHome of [true, false]) {
      const { ourGoals, oppGoals } = expectedGoals(
        ourEffective,
        rivalEffective,
        atHome,
      );
      const outcome = matchOutcome(ourGoals, oppGoals);
      expectedWins += outcome.win;
      expectedDraws += outcome.draw;
      expectedLosses += outcome.loss;
      goalsFor += ourGoals;
      goalsAgainst += oppGoals;
    }
  }

  const played = rivals.length * 2;
  const [won, drawn, lost] = roundRecord(
    expectedWins,
    expectedDraws,
    expectedLosses,
    played,
  );
  const points = won * 3 + drawn;

  return {
    played,
    won,
    drawn,
    lost,
    points,
    goalsFor: Math.round(goalsFor),
    goalsAgainst: Math.round(goalsAgainst),
    goalDiff: Math.round(goalsFor) - Math.round(goalsAgainst),
    strength: Math.round(strength * 10) / 10,
    // Judged on the strength as displayed, so the label always matches the
    // number shown beside it.
    verdict: seasonVerdict(Math.round(strength * 10) / 10),
    invincible: lost === 0,
  };
}

/**
 * A team's strength via the full-squad methodology: a weighted blend of the
 * best/chosen XI and the rest of the squad, on the 0-100 quality scale. This
 * is the same formula Squad quality uses, so the two never disagree.
 *
 * @param xiQualities - Qualities of the XI (best or chosen eleven).
 * @param restQualities - Qualities of every other squad member.
 * @returns The team's strength, 0-100.
 */
export function fullSquadStrength(
  xiQualities: readonly number[],
  restQualities: readonly number[],
): number {
  const xiAverage =
    xiQualities.length > 0
      ? xiQualities.reduce((sum, q) => sum + q, 0) / xiQualities.length
      : 0;
  const depthAverage =
    restQualities.length > 0
      ? restQualities.reduce((sum, q) => sum + q, 0) / restQualities.length
      : 0;
  return (
    SQUAD_QUALITY_XI_WEIGHT * xiAverage + SQUAD_QUALITY_DEPTH_WEIGHT * depthAverage
  );
}

/**
 * Stretches a strength away from the league mean by SIM_STRENGTH_SPREAD, so
 * the clustered full-squad strengths gain realistic separation. Floored at
 * SIM_MIN_EFFECTIVE_STRENGTH so a far-below-average side stays positive.
 *
 * Exported so an analysis of the whole league can run the same model the
 * game's own projection runs, rather than a second copy of it that could
 * drift.
 *
 * @param strength - The raw team strength.
 * @param leagueMean - The mean strength across the league.
 * @returns The stretched, floored effective strength.
 */
export function stretchStrength(strength: number, leagueMean: number): number {
  const stretched = leagueMean + (strength - leagueMean) * SIM_STRENGTH_SPREAD;
  return Math.max(SIM_MIN_EFFECTIVE_STRENGTH, stretched);
}

/**
 * Expected goals for both sides in a single fixture.
 *
 * @param strength - Our effective (stretched) team strength.
 * @param rivalStrength - The rival's effective (stretched) strength.
 * @param atHome - Whether we are playing at home.
 * @returns Expected goals for us and the opponent.
 */
export function expectedGoals(
  strength: number,
  rivalStrength: number,
  atHome: boolean,
): { ourGoals: number; oppGoals: number } {
  const ourSwing = atHome ? 1 + SIM_HOME_ADVANTAGE : 1 - SIM_HOME_ADVANTAGE;
  const oppSwing = atHome ? 1 - SIM_HOME_ADVANTAGE : 1 + SIM_HOME_ADVANTAGE;

  const ourGoals =
    SIM_LEAGUE_BASE_GOALS *
    Math.pow(strength / rivalStrength, SIM_STRENGTH_ELASTICITY) *
    ourSwing;
  const oppGoals =
    SIM_LEAGUE_BASE_GOALS *
    Math.pow(rivalStrength / strength, SIM_STRENGTH_ELASTICITY) *
    oppSwing;

  return { ourGoals, oppGoals };
}

/**
 * Win/draw/loss probabilities for a fixture, from two independent Poisson
 * goal distributions truncated at SIM_MAX_GOALS and renormalised.
 *
 * @param ourGoals - Our expected goals (Poisson mean).
 * @param oppGoals - The opponent's expected goals (Poisson mean).
 * @returns Probabilities summing to 1.
 */
export function matchOutcome(
  ourGoals: number,
  oppGoals: number,
): { win: number; draw: number; loss: number } {
  const ourPmf = poissonPmf(ourGoals);
  const oppPmf = poissonPmf(oppGoals);

  let win = 0;
  let draw = 0;
  let loss = 0;
  for (let i = 0; i <= SIM_MAX_GOALS; i += 1) {
    for (let j = 0; j <= SIM_MAX_GOALS; j += 1) {
      const p = (ourPmf[i] ?? 0) * (oppPmf[j] ?? 0);
      if (i > j) {
        win += p;
      } else if (i === j) {
        draw += p;
      } else {
        loss += p;
      }
    }
  }

  // Renormalise: the truncated tail sheds a little probability mass.
  const total = win + draw + loss;
  return { win: win / total, draw: draw / total, loss: loss / total };
}

/**
 * Poisson probabilities for 0..SIM_MAX_GOALS goals at the given mean.
 *
 * @param mean - The Poisson mean (expected goals).
 * @returns An array of probabilities indexed by goal count.
 */
function poissonPmf(mean: number): number[] {
  const pmf: number[] = [];
  let term = Math.exp(-mean); // P(0)
  for (let k = 0; k <= SIM_MAX_GOALS; k += 1) {
    pmf.push(term);
    // P(k+1) = P(k) * mean / (k+1): avoids computing factorials directly.
    term = (term * mean) / (k + 1);
  }
  return pmf;
}

/**
 * Rounds fractional expected wins/draws/losses to whole games summing exactly
 * to the games played, using the largest-remainder method for determinism.
 *
 * @param wins - Expected wins.
 * @param draws - Expected draws.
 * @param losses - Expected losses.
 * @param total - Games played, which the rounded record must sum to.
 * @returns Whole [won, drawn, lost] summing to total.
 */
export function roundRecord(
  wins: number,
  draws: number,
  losses: number,
  total: number,
): [number, number, number] {
  const raw = [wins, draws, losses];
  const floors = raw.map((v) => Math.floor(v));
  const used = floors.reduce((sum, v) => sum + v, 0);
  let remaining = total - used;

  // Hand out the leftover games to the largest fractional parts first; ties
  // resolve by index (win, then draw, then loss) for a stable result.
  const order = raw
    .map((v, index) => ({ index, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const result = [...floors];
  let slot = 0;
  while (remaining > 0 && order.length > 0) {
    const target = order[slot % order.length];
    if (target !== undefined) {
      result[target.index] = (result[target.index] ?? 0) + 1;
    }
    remaining -= 1;
    slot += 1;
  }

  return [result[0] ?? 0, result[1] ?? 0, result[2] ?? 0];
}

/**
 * The verdict band label for a squad strength.
 *
 * @param strength - Full-squad strength, 0-100.
 * @returns The label of the first band (see SIM_VERDICT_BANDS) whose floor
 *   the strength reaches.
 */
export function seasonVerdict(strength: number): string {
  const band = SIM_VERDICT_BANDS.find((b) => strength >= b.minStrength);
  // The last band's floor is 0, so a band is always found.
  return band?.label ?? 'Relegation scrap';
}

/**
 * The rival clubs as they stand now.
 *
 * With `config.rivalLeague` set, every rival's squad is read from the
 * market (Sam, 03/10/2026): the players it lists at each club in that
 * league, rated by the same full-squad methodology as our own strength.
 * The market never lists a player at our club, away on loan from it, or
 * already signed by it, so a player signed from a rival stops counting for
 * them the moment he joins, and a player sold to no named buyer counts for
 * no one. Called at the end of the game, it gives the league as the game
 * leaves it. Without `rivalLeague`, the configured rivals are used.
 *
 * @param state - The game state.
 * @returns The rivals, strongest first (ties by name, for determinism).
 */
export function rivalsAt(state: GameState): readonly RivalTeam[] {
  const league = state.config.rivalLeague;
  if (league === undefined) {
    return resolveRivals(state.config.rivals);
  }
  const squads = new Map<string, number[]>();
  for (const player of state.market) {
    if (player.league !== league || player.club === undefined) {
      continue;
    }
    const squad = squads.get(player.club) ?? [];
    squad.push(player.quality);
    squads.set(player.club, squad);
  }
  const rivals = [...squads.entries()].map(([name, qualities]) => {
    const sorted = [...qualities].sort((a, b) => b - a);
    return {
      name,
      strength: fullSquadStrength(sorted.slice(0, XI_SIZE), sorted.slice(XI_SIZE)),
    };
  });
  rivals.sort(
    (a, b) => b.strength - a.strength || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  return resolveRivals(rivals);
}

/**
 * Resolves the rival league, falling back to a league of average opponents
 * when the config supplies none.
 *
 * @param rivals - The configured rivals, if any.
 * @returns A non-empty rival list.
 */
function resolveRivals(
  rivals: readonly RivalTeam[] | undefined,
): readonly RivalTeam[] {
  if (rivals !== undefined && rivals.length > 0) {
    return rivals;
  }
  return Array.from({ length: SIM_DEFAULT_RIVAL_COUNT }, (_unused, i) => ({
    name: `Rival ${String(i + 1)}`,
    strength: SIM_DEFAULT_RIVAL_STRENGTH,
  }));
}

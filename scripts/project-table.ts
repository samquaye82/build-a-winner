/**
 * Projects a full Premier League table from the current dataset.
 *
 * The game's own projection (`simulateSeason`) answers one question: how does
 * Liverpool's chosen XI fare against the other nineteen? This runs the same
 * model over every fixture in the league, so all twenty clubs get a record.
 * It imports the engine's building blocks rather than reimplementing them, so
 * the table can never drift from what the game itself would say.
 *
 * Every club is reduced to one strength by the full-squad methodology the
 * engine uses everywhere (SQUAD_QUALITY_XI_WEIGHT x the best eleven, plus
 * SQUAD_QUALITY_DEPTH_WEIGHT x the rest). Liverpool's eleven is its best by
 * quality, not a chosen XI, so every club is treated identically.
 *
 * Deterministic: no randomness, so the same dataset always gives the same
 * table.
 *
 * Rounding is done across the league rather than club by club. The engine's
 * own `roundRecord` rounds a single club's expected record to whole games,
 * which is right when only Liverpool is being projected; applied twenty times
 * over it gave a table of 297 wins against 296 losses and an odd number of
 * draws, which no real season can produce. The fractional totals already
 * balance exactly, because every fixture hands a win to one side and a loss
 * to the other, so the fix is to allocate whole games against those totals
 * instead of rounding each club in isolation.
 *
 * Usage:
 *
 *     npm run project:table
 */
import {
  createGame,
  expectedGoals,
  fullSquadStrength,
  matchOutcome,
  rivalsAt,
  stretchStrength,
} from '../src/engine';
import { realConfig } from '../src/data/realConfig';

/** Players in a starting eleven. */
const XI_SIZE = 11;

/** One club's projected season. */
interface Row {
  club: string;
  strength: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
}

/** Running totals while the fixtures are played out. */
interface Tally {
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  played: number;
}

/**
 * A club's strength from its squad's qualities.
 *
 * @param qualities - Every squad member's quality.
 * @returns The full-squad strength, 0-100.
 */
function strengthOf(qualities: readonly number[]): number {
  const sorted = [...qualities].sort((a, b) => b - a);
  return fullSquadStrength(sorted.slice(0, XI_SIZE), sorted.slice(XI_SIZE));
}

/**
 * Every Premier League club's full-squad strength at the game's opening.
 *
 * Liverpool's comes from the opening squad; every rival's from the engine's
 * own rivalsAt, the function the game's projection uses, so the two can
 * never disagree about a club.
 *
 * @returns Strength keyed by club name.
 */
function premierLeagueStrengths(): Map<string, number> {
  const strengths = new Map<string, number>();
  strengths.set(
    'Liverpool',
    strengthOf(realConfig.initialSquad.map((p) => p.quality)),
  );
  for (const rival of rivalsAt(createGame(realConfig))) {
    strengths.set(rival.name, rival.strength);
  }
  return strengths;
}

/**
 * Plays every club home and away against every other.
 *
 * @param strengths - Effective (stretched) strength by club.
 * @returns Accumulated expected results by club.
 */
function playSeason(strengths: Map<string, number>): Map<string, Tally> {
  const table = new Map<string, Tally>();
  for (const club of strengths.keys()) {
    table.set(club, {
      wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, played: 0,
    });
  }

  const clubs = [...strengths.keys()];
  for (const home of clubs) {
    for (const away of clubs) {
      if (home === away) {
        continue;
      }
      const homeStrength = strengths.get(home) ?? 0;
      const awayStrength = strengths.get(away) ?? 0;
      // One fixture, from the home side's point of view. The away side's
      // record is the mirror of it, so each pairing is counted once here and
      // again when the fixture is reversed.
      const { ourGoals, oppGoals } = expectedGoals(homeStrength, awayStrength, true);
      const outcome = matchOutcome(ourGoals, oppGoals);

      const h = table.get(home);
      const a = table.get(away);
      if (h === undefined || a === undefined) {
        continue;
      }
      h.wins += outcome.win;
      h.draws += outcome.draw;
      h.losses += outcome.loss;
      h.goalsFor += ourGoals;
      h.goalsAgainst += oppGoals;
      h.played += 1;

      a.wins += outcome.loss;
      a.draws += outcome.draw;
      a.losses += outcome.win;
      a.goalsFor += oppGoals;
      a.goalsAgainst += ourGoals;
      a.played += 1;
    }
  }
  return table;
}

/**
 * Shares a whole number of games out in proportion to fractional values.
 *
 * Largest remainder: everyone gets their floor, then the leftovers go to the
 * largest fractional parts. Ties break by index, so the result is stable.
 *
 * @param values - The fractional amounts, in club order.
 * @param total - The whole number to allocate, which the result sums to.
 * @param caps - Optional per-club maximum, for allocating wins once draws
 *   have already taken some of a club's 38 games.
 * @returns Whole numbers summing exactly to total.
 */
function allocate(
  values: readonly number[],
  total: number,
  caps?: readonly number[],
): number[] {
  const result = values.map((v, i) => {
    const cap = caps?.[i] ?? Number.POSITIVE_INFINITY;
    return Math.min(Math.floor(v), cap);
  });
  let remaining = total - result.reduce((sum, v) => sum + v, 0);

  const order = values
    .map((v, index) => ({ index, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  let slot = 0;
  while (remaining > 0 && slot < order.length * 40) {
    const target = order[slot % order.length];
    if (target !== undefined) {
      const cap = caps?.[target.index] ?? Number.POSITIVE_INFINITY;
      const current = result[target.index] ?? 0;
      if (current < cap) {
        result[target.index] = current + 1;
        remaining -= 1;
      }
    }
    slot += 1;
  }
  return result;
}

/**
 * Checks the table obeys the identities every real league table obeys.
 *
 * @param rows - The finished table.
 * @throws {Error} If wins and losses disagree, draws are odd, or goals for
 *   and against disagree. A table that fails these is visibly wrong to
 *   anyone who adds up the columns.
 */
function assertBalanced(rows: readonly Row[]): void {
  const sum = (pick: (r: Row) => number): number =>
    rows.reduce((total, r) => total + pick(r), 0);
  const problems: string[] = [];
  if (sum((r) => r.won) !== sum((r) => r.lost)) {
    problems.push(
      `wins ${String(sum((r) => r.won))} but losses ${String(sum((r) => r.lost))}`,
    );
  }
  if (sum((r) => r.drawn) % 2 !== 0) {
    problems.push(`draws total ${String(sum((r) => r.drawn))}, which is odd`);
  }
  if (sum((r) => r.goalsFor) !== sum((r) => r.goalsAgainst)) {
    problems.push(
      `goals for ${String(sum((r) => r.goalsFor))} but against ${String(sum((r) => r.goalsAgainst))}`,
    );
  }
  for (const row of rows) {
    if (row.won + row.drawn + row.lost !== row.played) {
      problems.push(`${row.club} plays ${String(row.played)} but has a record of ${String(row.won + row.drawn + row.lost)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`Projected table does not balance: ${problems.join('; ')}`);
  }
}

function main(): void {
  const raw = premierLeagueStrengths();

  const leagueMean =
    [...raw.values()].reduce((sum, s) => sum + s, 0) / raw.size;
  const effective = new Map<string, number>();
  for (const [club, strength] of raw) {
    effective.set(club, stretchStrength(strength, leagueMean));
  }

  const tallies = playSeason(effective);
  const clubs = [...tallies.keys()];
  const tally = (pick: (t: Tally) => number): number[] =>
    clubs.map((c) => pick(tallies.get(c) as Tally));

  const games = tally((t) => t.played);
  const totalGames = games.reduce((sum, g) => sum + g, 0);

  // Draws come first, and in pairs: every drawn fixture gives one to each
  // side, so the league's total must be even.
  const drawnFractions = tally((t) => t.draws);
  const totalDraws =
    2 * Math.round(drawnFractions.reduce((sum, d) => sum + d, 0) / 2);
  const drawn = allocate(drawnFractions, totalDraws, games);

  // What is left splits evenly between wins and losses, since one club's win
  // is another's loss. Each club can win at most the games it did not draw.
  const totalWins = (totalGames - totalDraws) / 2;
  const won = allocate(
    tally((t) => t.wins),
    totalWins,
    games.map((g, i) => g - (drawn[i] ?? 0)),
  );

  // Goals for and goals against are the same set of goals counted twice, so
  // both are allocated against one total.
  const goalsForFractions = tally((t) => t.goalsFor);
  const totalGoals = Math.round(
    goalsForFractions.reduce((sum, g) => sum + g, 0),
  );
  const goalsFor = allocate(goalsForFractions, totalGoals);
  const goalsAgainst = allocate(tally((t) => t.goalsAgainst), totalGoals);

  const rows: Row[] = clubs.map((club, i) => {
    const w = won[i] ?? 0;
    const d = drawn[i] ?? 0;
    return {
      club,
      strength: Math.round((raw.get(club) ?? 0) * 10) / 10,
      played: games[i] ?? 0,
      won: w,
      drawn: d,
      lost: (games[i] ?? 0) - w - d,
      points: w * 3 + d,
      goalsFor: goalsFor[i] ?? 0,
      goalsAgainst: goalsAgainst[i] ?? 0,
    };
  });

  assertBalanced(rows);

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      a.club.localeCompare(b.club),
  );

  const pad = (s: string | number, n: number): string => String(s).padStart(n);
  const padEnd = (s: string, n: number): string => s.padEnd(n);
  console.log(
    `${pad('#', 2)}  ${padEnd('Club', 20)} ${pad('Str', 5)} ${pad('P', 3)} ${pad('W', 3)} ${pad('D', 3)} ${pad('L', 3)} ${pad('GF', 4)} ${pad('GA', 4)} ${pad('GD', 5)} ${pad('Pts', 4)}`,
  );
  rows.forEach((r, index) => {
    console.log(
      `${pad(index + 1, 2)}  ${padEnd(r.club, 20)} ${pad(r.strength.toFixed(1), 5)} ${pad(r.played, 3)} ${pad(r.won, 3)} ${pad(r.drawn, 3)} ${pad(r.lost, 3)} ${pad(r.goalsFor, 4)} ${pad(r.goalsAgainst, 4)} ${pad(r.goalsFor - r.goalsAgainst, 5)} ${pad(r.points, 4)}`,
    );
  });
}

main();

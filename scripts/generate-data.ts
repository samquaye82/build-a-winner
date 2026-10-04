/**
 * Game data generator: enriched CSV -> src/data/generated/gameData.json.
 *
 * Run via npm run generate:data (esbuild bundles this file so it can
 * import the engine's own drift and discount functions: the pipeline and
 * the game share one set of maths by construction).
 *
 * Per-window market pricing, documented here because it IS game design:
 *
 * - Window 0 (Summer 26): fee = true value x the engine's contract-length
 *   discount against the player's own club contract. Run-down contracts
 *   are bargains on the way in, exactly as they are cheap on the way out.
 * - Window 1 (January 27): base values drift along the engine curve at
 *   half-rate; contracts are six months shorter (mid-season discounts).
 * - Window 2 (Summer 27): ages tick, values drift again, and expiring
 *   contracts resolve: clubs quietly renew useful players (three more
 *   years, full price); the fringe and the ageing hit the market as
 *   FREE AGENTS: no fee, but a 25% wage premium.
 * - Wage demands are the player's current salary plus a 15% moving
 *   premium. Contract-length demands fall with age (5 years under 28
 *   down to 2 years at 32+). A star still on modest money (rated 85+ and
 *   at or below 200k a week) instead demands double their current wage to
 *   move, matching the renewal rule (see engine rules/wage.ts).
 *
 * All provisional constants live at the top for tuning with Sam.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ageOn, windowDate } from '../src/engine/rules/age';
import { contractDiscount, contractYearsDemand, driftBaseValue, remainingMonths } from '../src/engine/rules/value';
import { FREE_AGENT_WAGE_PREMIUM, STAR_WAGE_MULTIPLIER } from '../src/engine/constants';
import { isStarWageCase } from '../src/engine/rules/wage';
import type { Position, WindowConfig } from '../src/engine/types';

// esbuild relocates the bundle, so anchor paths to the invocation cwd
// (the repo root, per the npm script) rather than import.meta.url.
const ROOT = process.cwd();
const CSV_PATH = join(ROOT, 'scraper/output/final_players.csv');
const OUT_DIR = join(ROOT, 'src/data/generated');

/** Wage premium demanded to move clubs. */
const WAGE_MOVE_PREMIUM = 1.15;
/**
 * Expiring contracts resolve at the Summer 2027 boundary: clubs quietly
 * renew useful players and release the fringe and the ageing (roughly a
 * fifth of the market goes free, which is what real Bosman lists look
 * like). A released player costs no fee but wages plus age still count.
 */
const FREE_IF_QUALITY_BELOW = 72;
const FREE_IF_AGE_AT_LEAST = 31;

/** The three real windows (budgets per Sam: 250 fiscal-year pots). */
const WINDOWS: readonly WindowConfig[] = [
  { id: 'january-2027', label: 'January 2027', seasonStartYear: 2026, midSeason: true, budget: 100, squadCostCapBase: 875 },
  { id: 'summer-2027', label: 'Summer 2027', seasonStartYear: 2027, midSeason: false, budget: 200, squadCostCapBase: 962.5 },
  { id: 'january-2028', label: 'January 2028', seasonStartYear: 2027, midSeason: true, budget: 0, squadCostCapBase: 962.5 },
];

/** Transfer-fee-style rounding, mirroring the Python pipeline's tiers. */
function roundFee(value: number): number {
  if (value < 10) return Math.max(0.5, Math.round(value * 2) / 2);
  if (value < 50) return Math.round(value / 5) * 5;
  return Math.round(value / 10) * 10;
}

/** Minimal quote-aware CSV parser (no dependency needed for one file). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') inQuotes = false;
      else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); field = ''; row = []; }
    else if (char !== '\r') field += char;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const header = rows[0] ?? [];
  return rows.slice(1).filter((r) => r.length === header.length).map(
    (r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])),
  );
}

interface Row {
  slug: string; name: string; league: string; club: string;
  position: Position; age: number; quality: number; value: number;
  salary: number; expiryYear: number; homegrown: boolean; isLiverpool: boolean;
  /** YYYY-MM-DD, or '' where no source carries one. */
  birthDate: string;
}

function toRow(record: Record<string, string>): Row {
  return {
    slug: record.player_slug ?? '',
    name: record.name ?? '',
    league: record.league ?? '',
    club: record.club ?? '',
    position: (record.position ?? 'CM') as Position,
    age: Number(record.age),
    quality: Number(record.quality),
    value: Number(record.true_value_m),
    salary: Number(record.salary_eur_m),
    expiryYear: Number(record.expiry_year),
    homegrown: record.homegrown === 'True',
    isLiverpool: record.club_slug === 'liverpool',
    birthDate: (record.date_of_birth ?? '').slice(0, 10),
  };
}

function main(): void {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8')).map(toRow).filter(
    (r) => r.slug !== '' && Number.isFinite(r.value) && Number.isFinite(r.age),
  );
  const squad = rows.filter((r) => r.isLiverpool);
  const market = rows.filter((r) => !r.isLiverpool);

  // A date of birth is trusted when it agrees with the whole-year age from
  // the same source. A handful of rows contradict themselves: Kevin Sánchez
  // is aged 21 with a date of birth implying 23, and the two different
  // players called Moussa Diarra share one date between them. A date that
  // cannot be squared with the age cannot give a true age either, so it is
  // dropped and that player is treated as having none.
  const generatedAt = new Date().toISOString().slice(0, 10);
  const referenceMs = Date.parse(`${generatedAt}T00:00:00Z`);
  const MS_PER_YEAR = 31_557_600_000;
  const AGE_TOLERANCE_YEARS = 1.5;
  const trustedBirthDate = (row: Row): string | undefined => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birthDate)) {
      return undefined;
    }
    const derived = (referenceMs - Date.parse(`${row.birthDate}T00:00:00Z`)) / MS_PER_YEAR;
    return Math.abs(derived - row.age) > AGE_TOLERANCE_YEARS ? undefined : row.birthDate;
  };

  const squadOut = squad.map((r) => ({
    id: r.slug, name: r.name, position: r.position, age: r.age,
    homegrown: r.homegrown, quality: r.quality, baseValue: r.value,
    contract: { expiryYear: r.expiryYear, salary: r.salary },
  }));

  // Per-window market pricing (see module docstring for the design).
  const marketOut = market.map((r) => {
    const isCurrentFreeAgent = r.league === 'free-agent';
    // A star still on modest money doubles their wage to move; everyone else
    // pays the normal moving (or free-agent) premium on their current salary.
    const isStar = isStarWageCase(r.salary, r.quality);
    const wage = isStar
      ? Math.round(r.salary * STAR_WAGE_MULTIPLIER * 10) / 10
      : Math.round(
          r.salary * (isCurrentFreeAgent ? FREE_AGENT_WAGE_PREMIUM : WAGE_MOVE_PREMIUM) * 10,
        ) / 10;
    // A player's age in each window, as the engine reckons it: from his
    // birth date on the window's date (rules/age.ts). Without a trusted
    // date he is a year older from the first new season, which is what a
    // 1 July birthday gives and what the game assumes for him.
    const opening = WINDOWS[0] as WindowConfig;
    const birthDate = trustedBirthDate(r);
    const ageIn = (window: WindowConfig): number =>
      birthDate !== undefined
        ? ageOn(birthDate, windowDate(window))
        : window.seasonStartYear > opening.seasonStartYear
          ? r.age + 1
          : r.age;

    // Current free agents (contractless since 25/26) cost nothing in any
    // window: only their wages and the SCR bite.
    if (isCurrentFreeAgent) {
      let freeBase = r.value;
      return {
        id: r.slug, name: r.name, position: r.position, age: r.age,
        homegrown: r.homegrown, quality: r.quality, club: 'Free agent',
        league: r.league,
        windows: WINDOWS.map((window, index) => {
          const age = ageIn(window);
          if (index > 0) {
            freeBase = driftBaseValue(freeBase, age, r.quality);
          }
          return {
            fee: 0,
            wage,
            years: contractYearsDemand(age),
            baseValue: freeBase,
            freeAgent: true,
          };
        }),
      };
    }

    let base = r.value;
    return {
      id: r.slug, name: r.name, position: r.position, age: r.age,
      homegrown: r.homegrown, quality: r.quality, club: r.club,
      league: r.league,
      // Each window judges the contract against its own season, so a deal
      // expiring in 2027 has already run out by Summer 2027 and stays run
      // out in January 2028. The previous version tested only the last
      // window, which was correct only while the last window was the sole
      // one in a later season.
      windows: WINDOWS.map((window, index) => {
        const age = ageIn(window);
        if (index > 0) {
          base = driftBaseValue(base, age, r.quality);
        }
        const expired = r.expiryYear <= window.seasonStartYear;
        const clubRenews =
          expired &&
          r.quality >= FREE_IF_QUALITY_BELOW &&
          age < FREE_IF_AGE_AT_LEAST;
        const released = expired && !clubRenews;
        const fee = expired
          ? clubRenews
            ? roundFee(base)
            : 0
          : roundFee(base * contractDiscount(remainingMonths(r.expiryYear, window)));
        // A released star still doubles their wage (the star rule wins over
        // the free-agent premium); otherwise a released player takes the
        // free-agent premium, and a still-contracted one keeps the moving
        // wage.
        const windowWage = isStar
          ? wage
          : released
            ? Math.round(r.salary * FREE_AGENT_WAGE_PREMIUM * 10) / 10
            : wage;
        return {
          fee,
          wage: windowWage,
          years: contractYearsDemand(age),
          baseValue: base,
          freeAgent: released,
        };
      }),
    };
  });

  // Dates of birth ride alongside rather than on the player records, keyed
  // by player id: realConfig reads them so the engine can age each player
  // on his real birthday (rules/age.ts). Only trusted dates are published
  // (see trustedBirthDate above); realConfig estimates a 1 July birthday
  // for anyone without one.

  const birthDates: Record<string, string> = {};
  let contradictory = 0;
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.birthDate)) {
      continue;
    }
    const trusted = trustedBirthDate(row);
    if (trusted === undefined) {
      contradictory += 1;
      continue;
    }
    birthDates[row.slug] = trusted;
  }
  if (contradictory > 0) {
    console.log(
      `Dropped ${String(contradictory)} dates of birth that contradict the recorded age`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    generatedAt,
    windows: WINDOWS,
    squad: squadOut,
    market: marketOut,
    birthDates,
  };
  writeFileSync(join(OUT_DIR, 'gameData.json'), JSON.stringify(payload));

  console.log(`Squad: ${squadOut.length} | Market: ${marketOut.length}`);
  for (const [index, window] of WINDOWS.entries()) {
    const free = marketOut.filter((m) => m.windows[index]?.freeAgent).length;
    console.log(`${window.label} free agents (released on expiry): ${free}`);
  }
  console.log(`Wrote ${join(OUT_DIR, 'gameData.json')}`);
}

main();

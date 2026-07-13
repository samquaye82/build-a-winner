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
  { id: 'summer-2026', label: 'Summer 2026', seasonStartYear: 2026, midSeason: false, budget: 250, squadCostCapBase: 850 },
  { id: 'january-2027', label: 'January 2027', seasonStartYear: 2026, midSeason: true, budget: 0, squadCostCapBase: 875 },
  { id: 'summer-2027', label: 'Summer 2027', seasonStartYear: 2027, midSeason: false, budget: 250, squadCostCapBase: 900 },
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
  };
}

function main(): void {
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf-8')).map(toRow).filter(
    (r) => r.slug !== '' && Number.isFinite(r.value) && Number.isFinite(r.age),
  );
  const squad = rows.filter((r) => r.isLiverpool);
  const market = rows.filter((r) => !r.isLiverpool);

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
    const w0 = WINDOWS[0] as WindowConfig;
    const w1 = WINDOWS[1] as WindowConfig;
    const w2 = WINDOWS[2] as WindowConfig;

    const base0 = r.value;
    const base1 = driftBaseValue(base0, r.age, r.quality);
    const age2 = r.age + 1;
    const base2 = driftBaseValue(base1, age2, r.quality);

    // Current free agents (contractless since 25/26) cost nothing in any
    // window: only their wages and the SCR bite.
    if (isCurrentFreeAgent) {
      return {
        id: r.slug, name: r.name, position: r.position, age: r.age,
        homegrown: r.homegrown, quality: r.quality, club: 'Free agent',
        league: r.league,
        windows: [
          { fee: 0, wage, years: contractYearsDemand(r.age), baseValue: base0, freeAgent: true },
          { fee: 0, wage, years: contractYearsDemand(r.age), baseValue: base1, freeAgent: true },
          { fee: 0, wage, years: contractYearsDemand(age2), baseValue: base2, freeAgent: true },
        ],
      };
    }

    const fee0 = roundFee(base0 * contractDiscount(remainingMonths(r.expiryYear, w0)));
    const fee1 = roundFee(base1 * contractDiscount(remainingMonths(r.expiryYear, w1)));

    const expired = r.expiryYear <= w2.seasonStartYear;
    const clubRenews =
      expired &&
      r.quality >= FREE_IF_QUALITY_BELOW &&
      age2 < FREE_IF_AGE_AT_LEAST;
    const fee2 = expired
      ? clubRenews
        ? roundFee(base2)
        : 0
      : roundFee(base2 * contractDiscount(remainingMonths(r.expiryYear, w2)));
    // A released star still doubles their wage (the star rule wins over the
    // free-agent premium); otherwise a released player takes the free-agent
    // premium, and a still-contracted one keeps the moving wage.
    const wage2 = isStar
      ? wage
      : expired && !clubRenews
        ? Math.round(r.salary * FREE_AGENT_WAGE_PREMIUM * 10) / 10
        : wage;

    return {
      id: r.slug, name: r.name, position: r.position, age: r.age,
      homegrown: r.homegrown, quality: r.quality, club: r.club,
      league: r.league,
      windows: [
        { fee: fee0, wage, years: contractYearsDemand(r.age), baseValue: base0 },
        { fee: fee1, wage, years: contractYearsDemand(r.age), baseValue: base1 },
        { fee: fee2, wage: wage2, years: contractYearsDemand(age2), baseValue: base2, freeAgent: expired && !clubRenews },
      ],
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    windows: WINDOWS,
    squad: squadOut,
    market: marketOut,
  };
  writeFileSync(join(OUT_DIR, 'gameData.json'), JSON.stringify(payload));

  const freeAgents27 = marketOut.filter((m) => m.windows[2]?.freeAgent).length;
  console.log(`Squad: ${squadOut.length} | Market: ${marketOut.length}`);
  console.log(`Summer 2027 free agents (released on expiry): ${freeAgents27}`);
  console.log(`Wrote ${join(OUT_DIR, 'gameData.json')}`);
}

main();

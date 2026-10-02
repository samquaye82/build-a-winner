/**
 * Tunable game constants, gathered in one place so balance changes never
 * require touching rule logic. Values marked "M6" will be tuned alongside
 * the real player data.
 */

/**
 * Premier League registration rules (real-world values).
 * A club may register at most 25 players over the U21 age limit, of whom at
 * most 17 may be non-home-grown. U21 players are exempt from registration.
 */
export const OVER21_REGISTRATION_LIMIT = 25;
export const NON_HOMEGROWN_LIMIT = 17;

/**
 * Age at or below which a player counts as U21 and is exempt from the
 * 25-man registration list. Simplification of the real birthday-cutoff rule:
 * the real exemption depends on date of birth relative to a 1 January
 * cutoff; the game uses whole-year age instead.
 */
export const U21_AGE_LIMIT = 21;

/**
 * UEFA Champions League squad registration (real-world values; Sam,
 * 02/10/2026). Enforced alongside the Premier League rules above, never
 * instead of them: a squad must satisfy both.
 *
 * List A holds at most 25 players, eight of its places reserved for
 * locally trained players, of whom at most four may be association-trained.
 * Each reserved place left unfilled costs the list one place: six locally
 * trained players cut the limit to 23. List B is unlimited, for players
 * young enough and long enough at the club (see rules/uefa.ts).
 */
export const UCL_LIST_A_LIMIT = 25;
export const UCL_LOCALLY_TRAINED_PLACES = 8;
export const UCL_ASSOCIATION_TRAINED_MAX = 4;

/** Goalkeepers: at least two on List A, and three across both lists. */
export const UCL_LIST_A_MIN_GOALKEEPERS = 2;
export const UCL_MIN_GOALKEEPERS = 3;

/**
 * Uninterrupted years at the club a List B player needs. UEFA counts any
 * two-year spell since the player's fifteenth birthday; the game measures
 * the current spell, which is the only one its data records.
 */
export const UCL_LIST_B_TENURE_YEARS = 2;

/** Longest contract a player may hold, in years (mirrors the real fee
 * amortisation cap). Renewals may not extend beyond this many years from
 * the start of the current season. */
export const MAX_CONTRACT_YEARS = 5;

/**
 * Minimum viable squad: you must be able to field an XI at the end of the
 * game. Validation blocks submission below these floors.
 */
export const MIN_SQUAD_SIZE = 11;
export const MIN_GOALKEEPERS = 1;

/**
 * Renewal pricing curve (M6 tuning candidates).
 *
 * A renewal's salary uplift is:
 *
 *   uplift = (urgency + PER_YEAR_ADDED_UPLIFT * yearsAdded) * qualityFactor
 *   newSalary = oldSalary * (1 + uplift)
 *
 * where urgency depends on how close the contract is to expiry (a player
 * with one year left holds all the leverage) and qualityFactor scales
 * demands with ability.
 */

/** Urgency when the contract is inside its final season (maximum leverage). */
export const RENEWAL_UPLIFT_FINAL_YEAR = 0.35;

/** Urgency with two seasons remaining. */
export const RENEWAL_UPLIFT_TWO_YEARS = 0.2;

/** Urgency with three or more seasons remaining (the club holds the cards). */
export const RENEWAL_UPLIFT_DISTANT = 0.1;

/** Additional uplift per contract year added by the renewal. */
export const PER_YEAR_ADDED_UPLIFT = 0.02;

/**
 * Quality scaling for renewal demands: quality 50 gives a neutral 1.0
 * multiplier; quality 90 gives 1.16.
 */
export const RENEWAL_QUALITY_FACTOR_BASE = 0.8;
export const RENEWAL_QUALITY_FACTOR_DIVISOR = 250;

/**
 * Star-player wage demands (Sam, 13/07/2026).
 *
 * A player rated STAR_QUALITY_THRESHOLD or above who is still on modest money,
 * at or below STAR_WAGE_WEEKLY_CAP a week, will only agree a new deal (a
 * contract extension or a transfer) for double their current wage: their
 * status has outgrown their pay packet. Stars already earning above that
 * ceiling negotiate on the normal curve. See rules/wage.ts.
 *
 * The cap is held as an annual salary in EUR m to match the engine's money
 * unit: 200k a week is 200,000 x 52 = EUR 10.4m a year.
 */
export const STAR_QUALITY_THRESHOLD = 85;
export const STAR_WAGE_WEEKLY_CAP_M = 10.4;
export const STAR_WAGE_MULTIPLIER = 2;

/**
 * Squad cost ratio (UEFA-style, per Sam 11/07/2026): squad cost (annual
 * wages plus amortisation plus the baseline) may not exceed 70% of the
 * season's revenue (WindowConfig.squadCostCapBase).
 */
export const SCR_LIMIT = 0.7;

/**
 * Contract-length discounts on sale value, by remaining months (M6 tuning
 * candidates). A player running down their deal sells cheap; renewing
 * restores their price. The 24/18/12-month anchors are Sam's; 30 and 6
 * months continue the same line (only January windows produce them).
 * Ordered by minMonths descending; the first matching row wins.
 */
export const CONTRACT_DISCOUNT_BY_MONTHS: readonly {
  minMonths: number;
  discount: number;
}[] = [
  { minMonths: 36, discount: 1 },
  { minMonths: 30, discount: 0.95 },
  { minMonths: 24, discount: 0.9 },
  { minMonths: 18, discount: 0.75 },
  { minMonths: 12, discount: 0.5 },
  { minMonths: 0, discount: 0.25 },
];

/**
 * Deterministic value progression (M6 tuning candidates).
 *
 * Annual growth rates by age band, split into three quality tiers. Each
 * window transition applies half the annual rate (the three windows are six
 * months apart). Young, elite players appreciate fastest; everyone declines
 * from 28.
 */
export const VALUE_QUALITY_ELITE = 80;
export const VALUE_QUALITY_GOOD = 70;

/** One age band of the value curve; `maxAge` is inclusive. */
export interface ValueGrowthBand {
  maxAge: number;
  /** Annual rate for quality >= VALUE_QUALITY_ELITE. */
  elite: number;
  /** Annual rate for quality >= VALUE_QUALITY_GOOD. */
  good: number;
  /** Annual rate for everyone else. */
  base: number;
}

/** The value curve, ordered by age; the last band catches all older ages. */
export const VALUE_GROWTH_BANDS: readonly ValueGrowthBand[] = [
  { maxAge: 23, elite: 0.2, good: 0.12, base: 0.06 },
  { maxAge: 27, elite: 0.08, good: 0.04, base: 0 },
  { maxAge: 29, elite: -0.05, good: -0.05, base: -0.05 },
  { maxAge: 32, elite: -0.12, good: -0.12, base: -0.12 },
  { maxAge: Number.POSITIVE_INFINITY, elite: -0.2, good: -0.2, base: -0.2 },
];

/** Share of the annual value growth rate applied per window transition. */
export const TRANSITION_RATE_FACTOR = 0.5;

/**
 * Wage premium demanded by free agents: no fee to pay, so the player's
 * camp takes its cut through the salary (Sam: 1.5x, 11/07/2026).
 */
export const FREE_AGENT_WAGE_PREMIUM = 1.5;

/**
 * Contract-length demands by age at signing: five years under 28, down
 * to two years at 32 and beyond. Used for market listings and for squad
 * players re-entering the market as free agents.
 */
export const CONTRACT_DEMAND_BY_AGE: readonly {
  minAge: number;
  years: number;
}[] = [
  { minAge: 32, years: 2 },
  { minAge: 30, years: 3 },
  { minAge: 28, years: 4 },
  { minAge: 0, years: 5 },
];

/* -------------------------------------------------------------------------
 * Scoring (weights agreed with Sam, 10/07/2026; sub-curves M6 tunable)
 * ---------------------------------------------------------------------- */

/**
 * Component weights of the final rating; must sum to 1. Re-weighted with
 * Sam (13/07/2026): Liverpool start with an elite XI, so the game rewards
 * filling out the depth and future-proofing the contracts rather than the
 * quality that is already there. Depth weight up, age down, contracts up.
 */
export const SCORING_WEIGHTS = {
  squadQuality: 0.35,
  balance: 0.25,
  ageProfile: 0.15,
  contractHealth: 0.2,
  valueCreated: 0.05,
} as const;

/** Inside Squad Quality: the XI / depth split (Sam, 26/07/2026: 65/35). */
export const SQUAD_QUALITY_XI_WEIGHT = 0.65;
export const SQUAD_QUALITY_DEPTH_WEIGHT = 0.35;

/**
 * Depth counts the best N players outside the XI; missing bodies score
 * zero, so a threadbare squad cannot hide behind a strong first eleven.
 */
export const DEPTH_PLAYER_COUNT = 10;

/**
 * Balance is quality-weighted (Sam, 25/07/2026): a position is not simply
 * "covered" by a body, it is covered in proportion to the quality of the
 * players there. Each player contributes min(quality / reference, 1) of a
 * slot, so a player at or above this reference counts as a full unit and a
 * weaker one (e.g. a promoted academy player) counts for less.
 */
export const BALANCE_QUALITY_REFERENCE = 90;

/**
 * Balance template: the healthy-squad headcount per position. Each position
 * scores min(coverage, required) / required, where coverage is the
 * quality-weighted contribution of the players in that position.
 */
export const BALANCE_TEMPLATE: Readonly<Record<string, number>> = {
  GK: 3,
  RB: 2,
  LB: 2,
  CB: 4,
  CM: 4,
  AM: 2,
  RW: 2,
  LW: 2,
  ST: 2,
};

/**
 * Minimum squad size to be "fit for purpose" (Sam, 13/07/2026). A squad
 * below this cannot cover the healthy-squad template (BALANCE_TEMPLATE
 * sums to 23) and, however good its XI, is not a serious operation: its
 * final rating is capped at UNVIABLE_SQUAD_MAX_SCORE. Adjustable.
 */
export const MIN_VIABLE_SQUAD_SIZE = 23;

/** The highest final rating an unviable (sub-threshold) squad may score. */
export const UNVIABLE_SQUAD_MAX_SCORE = 70;

/**
 * Age profile scores per player: peak years score full, a young pipeline
 * nearly full, veterans decay hard. Ordered by maxAge ascending.
 */
export const AGE_SCORE_BANDS: readonly { maxAge: number; score: number }[] = [
  { maxAge: 20, score: 0.9 },
  { maxAge: 28, score: 1 },
  { maxAge: 30, score: 0.7 },
  { maxAge: 32, score: 0.4 },
  { maxAge: Number.POSITIVE_INFINITY, score: 0.2 },
];

/**
 * Contract health is quality-aware (Sam, 25/07/2026). A contract is not
 * "healthy" simply for being long: securing a good player is an asset, but
 * being locked into a below-par player is a liability, worse the bigger their
 * wage. Each player's tenure (see CONTRACT_HEALTH_BY_MONTHS) is combined with
 * a quality standing about this pivot:
 *  - quality at CONTRACT_QUALITY_PIVOT is neutral;
 *  - CONTRACT_QUALITY_SCALE points above or below reaches the +/-1 extreme;
 *  - a below-pivot player on a long deal is penalised by their wage, scaled
 *    by CONTRACT_WAGE_PENALTY_PER_M per EUR m/yr.
 */
export const CONTRACT_QUALITY_PIVOT = 72;
export const CONTRACT_QUALITY_SCALE = 18;
export const CONTRACT_WAGE_PENALTY_PER_M = 0.03;

/**
 * Tenure scores by remaining months at game end (how secured a player is).
 * Ordered by minMonths descending; the first matching row wins.
 */
export const CONTRACT_HEALTH_BY_MONTHS: readonly {
  minMonths: number;
  score: number;
}[] = [
  { minMonths: 36, score: 1 },
  { minMonths: 30, score: 0.9 },
  { minMonths: 24, score: 0.75 },
  { minMonths: 18, score: 0.5 },
  { minMonths: 12, score: 0.3 },
  { minMonths: 0, score: 0.1 },
];

/**
 * Value created scoring: break-even scores the base; every 1% of value
 * created or destroyed moves the score by slope/100 points. +20% reaches
 * 100, -20% reaches 0.
 */
export const VALUE_CREATED_BASE = 50;
export const VALUE_CREATED_SLOPE = 250;

/* -------------------------------------------------------------------------
 * Season simulation (Sam, 25/07/2026; all tunable)
 *
 * A deterministic expected-goals projection, separate from and additional to
 * the 0-100 rating. Both sides are reduced to a single full-squad strength
 * (the same 0.6 XI / 0.4 rest blend as Squad quality). Each rival is played
 * home and away; per fixture, expected goals for each side come from the
 * strength ratio, and a Poisson model turns those into win/draw/loss
 * probabilities. Summed over the season they give the projected record. No
 * randomness: identical squads always project identical seasons.
 * ---------------------------------------------------------------------- */

/** League-average goals scored by one side in one game: the scoring scale. */
export const SIM_LEAGUE_BASE_GOALS = 1.35;

/**
 * How sharply a strength advantage converts into goals. Higher means bigger
 * mismatches; 1 would make goals scale linearly with the strength ratio.
 */
export const SIM_STRENGTH_ELASTICITY = 2;

/**
 * Full-squad strengths cluster near the league average, so before the match
 * model runs, each team's distance from the league mean is stretched by this
 * factor (Sam, 25/07/2026). This gives the league realistic separation so
 * strength and projected points line up: the strongest sides pull clear and
 * the weakest are cut adrift, instead of everyone drawing to mid-table.
 */
export const SIM_STRENGTH_SPREAD = 3;

/** Floor for a stretched strength, so a far-below-average side stays positive. */
export const SIM_MIN_EFFECTIVE_STRENGTH = 20;

/** Home-field swing: the home side's expected goals are scaled up by this
 * fraction and the away side's down by it. Over 19 home and 19 away games it
 * roughly nets out. */
export const SIM_HOME_ADVANTAGE = 0.15;

/** Goals per side are summed over a truncated Poisson tail up to this many. */
export const SIM_MAX_GOALS = 8;

/** Fallback league when a config supplies no rivals: nineteen average sides. */
export const SIM_DEFAULT_RIVAL_COUNT = 19;
export const SIM_DEFAULT_RIVAL_STRENGTH = 75;

/**
 * Verdict bands by projected points (Sam, 25/07/2026). Ordered by minPoints
 * descending; the first band the total reaches wins. An unbeaten projection
 * (zero losses) additionally earns the "Invincible" badge in the UI.
 */
export const SIM_VERDICT_BANDS: readonly {
  minPoints: number;
  label: string;
}[] = [
  { minPoints: 90, label: 'Dynasty' },
  { minPoints: 84, label: 'Champions' },
  { minPoints: 78, label: 'Title race' },
  { minPoints: 68, label: 'Champions League' },
  { minPoints: 58, label: 'Europa / top half' },
  { minPoints: 45, label: 'Mid-table' },
  { minPoints: 0, label: 'Relegation scrap' },
];

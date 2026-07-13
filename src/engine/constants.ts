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

/** Inside Squad Quality: the XI / depth split (depth is the mission). */
export const SQUAD_QUALITY_XI_WEIGHT = 0.6;
export const SQUAD_QUALITY_DEPTH_WEIGHT = 0.4;

/**
 * Depth counts the best N players outside the XI; missing bodies score
 * zero, so a threadbare squad cannot hide behind a strong first eleven.
 */
export const DEPTH_PLAYER_COUNT = 10;

/**
 * Balance template: the healthy-squad headcount per position. Each position
 * scores min(count, required) / required; extras earn nothing.
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
 * Contract health scores by remaining months at game end. Ordered by
 * minMonths descending; the first matching row wins.
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

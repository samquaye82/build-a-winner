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

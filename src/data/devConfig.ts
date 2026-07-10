/**
 * PLACEHOLDER development dataset.
 *
 * Entirely fictional players so the UI can be built and play-tested before
 * the real database lands in M6. M6 replaces this file wholesale with the
 * real Liverpool squad and market pools (Sam arbitrates fees, wages,
 * quality ratings and locked players). Nothing outside src/data may depend
 * on the specific names or numbers in here.
 */
import type { GameConfig, MarketPlayer, SquadPlayerSeed } from '../engine';

/** Shorthand seed builder to keep the table below readable. */
function sq(
  id: string,
  name: string,
  position: SquadPlayerSeed['position'],
  age: number,
  quality: number,
  baseValue: number,
  salary: number,
  expiryYear: number,
  flags: { hg?: boolean; locked?: boolean } = {},
): SquadPlayerSeed {
  return {
    id,
    name,
    position,
    age,
    quality,
    baseValue,
    homegrown: flags.hg ?? false,
    locked: flags.locked ?? false,
    contract: { expiryYear, salary },
  };
}

/** Shorthand market builder. */
function mk(
  id: string,
  name: string,
  position: MarketPlayer['position'],
  age: number,
  quality: number,
  fee: number,
  wageDemand: number,
  contractYears: number,
  hg = false,
): MarketPlayer {
  return { id, name, position, age, quality, fee, wageDemand, contractYears, homegrown: hg };
}

/**
 * Fictional 23-man squad matching the balance template (GK 3, RB 2, LB 2,
 * CB 4, CM 4, AM 2, RW 2, LW 2, ST 2), with a spread of ages, contract
 * cliffs and three locked stars.
 */
const initialSquad: readonly SquadPlayerSeed[] = [
  sq('gk-santos', 'Rafael Santos', 'GK', 31, 86, 28, 9, 2028),
  sq('gk-brook', 'Danny Brook', 'GK', 26, 78, 30, 4.5, 2029, { hg: true }),
  sq('gk-okafor', 'Sam Okafor', 'GK', 20, 66, 8, 1, 2029, { hg: true }),
  sq('rb-vidal', 'Marco Vidal', 'RB', 24, 82, 48, 6, 2030),
  sq('rb-hughes', 'Kieran Hughes', 'RB', 22, 74, 25, 3, 2028, { hg: true }),
  sq('lb-moreno', 'Iker Moreno', 'LB', 23, 83, 50, 6.5, 2030, { locked: true }),
  sq('lb-quinn', 'Aidan Quinn', 'LB', 29, 75, 18, 5, 2027, { hg: true }),
  sq('cb-dekker', 'Ruben Dekker', 'CB', 33, 88, 20, 12, 2027, { locked: true }),
  sq('cb-toure', 'Mamadou Touré', 'CB', 27, 84, 55, 7.5, 2029),
  sq('cb-fox', 'Charlie Fox', 'CB', 25, 79, 38, 5, 2028, { hg: true }),
  sq('cb-lindgren', 'Axel Lindgren', 'CB', 19, 72, 22, 1.5, 2029),
  sq('cm-rossi', 'Enzo Rossi', 'CM', 24, 87, 75, 8.5, 2029),
  sq('cm-baker', 'Jude Baker', 'CM', 25, 81, 52, 6, 2027, { hg: true }),
  sq('cm-eze', 'Tobi Eze', 'CM', 22, 78, 35, 4, 2029, { hg: true }),
  sq('cm-weiss', 'Jonas Weiss', 'CM', 32, 76, 8, 6.5, 2027),
  sq('am-costa', 'Thiago Costa', 'AM', 23, 90, 95, 10, 2030, { locked: true }),
  sq('am-nowak', 'Filip Nowak', 'AM', 26, 80, 45, 5.5, 2028),
  sq('rw-diallo', 'Sekou Diallo', 'RW', 25, 85, 65, 8, 2028),
  sq('rw-pratt', 'Ollie Pratt', 'RW', 20, 73, 20, 2, 2029, { hg: true }),
  sq('lw-ferraz', 'Nuno Ferraz', 'LW', 27, 84, 58, 7.5, 2027),
  sq('lw-sato', 'Kenji Sato', 'LW', 21, 75, 24, 2.5, 2029),
  sq('st-magnusson', 'Erik Magnusson', 'ST', 26, 89, 90, 11, 2029),
  sq('st-cole', 'Reggie Cole', 'ST', 30, 77, 15, 6, 2027, { hg: true }),
];

/** Summer 2026 market: the headline window, deepest pool. */
const summer26Market: readonly MarketPlayer[] = [
  mk('t-laurent', 'Hugo Laurent', 'ST', 23, 88, 85, 10, 5),
  mk('t-bergkamp', 'Luuk Bergkamp', 'ST', 27, 84, 55, 8, 4),
  mk('t-adjei', 'Kwame Adjei', 'RW', 21, 82, 60, 5, 5),
  mk('t-silva', 'Paulo Silva', 'LW', 24, 85, 70, 8.5, 5),
  mk('t-carter', 'Lewis Carter', 'AM', 22, 83, 65, 6, 5, true),
  mk('t-petit', 'Antoine Petit', 'CM', 25, 86, 78, 9, 5),
  mk('t-vanberg', 'Stijn van Berg', 'CM', 21, 79, 40, 4, 5),
  mk('t-mbeki', 'Sipho Mbeki', 'CB', 24, 85, 68, 7, 5),
  mk('t-ward', 'Harry Ward', 'CB', 22, 78, 35, 4, 5, true),
  mk('t-ramos', 'Diego Ramos', 'RB', 23, 81, 45, 5, 5),
  mk('t-ito', 'Haruki Ito', 'LB', 22, 80, 42, 4.5, 5),
  mk('t-keller', 'Max Keller', 'GK', 25, 83, 48, 5.5, 5),
  mk('t-obi', 'Chidi Obi', 'ST', 19, 76, 30, 2.5, 5),
  mk('t-marsh', 'Tommy Marsh', 'CM', 28, 80, 32, 6, 3, true),
];

/** January 2027: thinner, pricier, with two unsold summer targets back. */
const january27Market: readonly MarketPlayer[] = [
  mk('t-bergkamp', 'Luuk Bergkamp', 'ST', 27, 84, 60, 8.5, 4),
  mk('t-vanberg', 'Stijn van Berg', 'CM', 21, 80, 48, 4.5, 5),
  mk('t-fontaine', 'Rémy Fontaine', 'AM', 24, 84, 75, 8, 5),
  mk('t-drescher', 'Lukas Drescher', 'CB', 26, 82, 55, 6.5, 4),
  mk('t-bianchi', 'Matteo Bianchi', 'LW', 23, 81, 58, 6, 5),
  mk('t-larsen', 'Nils Larsen', 'GK', 27, 80, 30, 5, 4),
  mk('t-gray', 'Mason Gray', 'RB', 21, 75, 28, 3, 5, true),
];

/** Summer 2027: the closing window, fresh names and a couple of returns. */
const summer27Market: readonly MarketPlayer[] = [
  mk('t-laurent', 'Hugo Laurent', 'ST', 24, 89, 95, 11, 5),
  mk('t-adjei', 'Kwame Adjei', 'RW', 22, 84, 72, 6, 5),
  mk('t-abramov', 'Ilya Abramov', 'AM', 21, 85, 80, 7, 5),
  mk('t-mensah', 'Kofi Mensah', 'CM', 23, 84, 70, 7, 5),
  mk('t-holt', 'Freddie Holt', 'CB', 21, 79, 42, 4, 5, true),
  mk('t-duarte', 'Vasco Duarte', 'LB', 24, 82, 52, 5.5, 5),
  mk('t-kimura', 'Sora Kimura', 'RW', 20, 78, 38, 3, 5),
  mk('t-beck', 'Julian Beck', 'ST', 28, 85, 58, 9, 3),
  mk('t-oduya', 'Femi Oduya', 'GK', 23, 79, 35, 3.5, 5),
];

/**
 * The development game configuration: three windows, per-window budgets,
 * and the SCR baseline (all M6 tuning candidates).
 */
export const devConfig: GameConfig = {
  windows: [
    { id: 'summer-2026', label: 'Summer 2026', seasonStartYear: 2026, midSeason: false, budget: 175 },
    { id: 'january-2027', label: 'January 2027', seasonStartYear: 2026, midSeason: true, budget: 40 },
    { id: 'summer-2027', label: 'Summer 2027', seasonStartYear: 2027, midSeason: false, budget: 120 },
  ],
  initialSquad,
  marketByWindow: [summer26Market, january27Market, summer27Market],
  baselineAmortisation: 80,
  squadCostCapBase: 320,
};

/**
 * UEFA registration data: who is locally trained, and since when each
 * Liverpool player has been at the club (Sam, 02/10/2026).
 *
 * The UEFA Champions League rules (src/engine/rules/uefa.ts) need two facts
 * the Premier League's home-grown flag does not carry:
 *
 * - **Training**: whether a locally trained player was trained by Liverpool
 *   itself ('club') or by another English club ('association'). List A
 *   reserves eight places for locally trained players, and at most four
 *   may be association-trained.
 * - **Joined**: when his current spell at Liverpool began. List B needs two
 *   uninterrupted years at the club.
 *
 * Both are relative to the club holding the player, so the same fields
 * would serve any other club the game might one day let you run. For now
 * only Liverpool's players are authored; every market player is derived
 * instead (see `MARKET_CLUB_TRAINED` below).
 *
 * Training is authored as the status a player has, or will have, by the
 * time it can matter. It only counts on List A, and a youngster still
 * accruing it sits on List B (see UefaTraining in engine/types.ts).
 *
 * Simplifications:
 * - A loan within England does not interrupt a spell. UEFA's tenure rule
 *   accepts a loan within the association, and it is the only kind of loan
 *   that matters here.
 * - Welsh-trained players count as association-trained. Strictly, the FAW
 *   is a separate association from The FA.
 *
 * Every entry is verified as it is applied (realConfig.ts): an entry naming
 * no player in the squad or academy is reported and skipped, and a test
 * fails if any first-team or academy player has no entry at all, because a
 * missing entry would silently send him to List A.
 *
 * Sources are noted per entry. "snapshot" is the Capology snapshot of
 * 29/09/2026, whose `signed_date` is the date of a player's current
 * contract, so it is only taken as a join date for players still on their
 * first deal. "sweep" is the summer 2026 transfer sweep. Sam checked and
 * approved every entry on 02/10/2026.
 */
import type { SeasonPoint, UefaTraining } from '../engine';

/** One player's UEFA registration facts. */
export interface UefaRegistrationEntry {
  /** Capology slug or exact display name, as with the other lists. */
  player: string;
  training: UefaTraining;
  /** When his current spell at Liverpool began. */
  joined: SeasonPoint;
}

/**
 * The summer window opening a season, e.g. summerOf(2024) is Summer 2024.
 *
 * @param year - The calendar year of the summer.
 * @returns The point in the game calendar.
 */
function summerOf(year: number): SeasonPoint {
  return { season: year, midSeason: false };
}

/**
 * The January window midway through a season, e.g. januaryOf(2025) is
 * January 2025, which sits in the 2024/25 season.
 *
 * @param year - The calendar year of the January.
 * @returns The point in the game calendar.
 */
function januaryOf(year: number): SeasonPoint {
  return { season: year - 1, midSeason: true };
}

/**
 * Stands in for an academy player who joined Liverpool before turning 15,
 * where the exact date is not sourced.
 *
 * The exact date never changes an outcome. The rules only ask whether a
 * spell is two years old in a given window, so all that matters is that he
 * arrived before January 2025, which this asserts, and which Sam confirmed
 * for every entry using it (02/10/2026).
 */
const JOINED_BEFORE_FIFTEEN: SeasonPoint = summerOf(2018);

/**
 * Liverpool's first team, the player on loan to them, and the academy.
 */
export const LIVERPOOL_UEFA_REGISTRATION: readonly UefaRegistrationEntry[] = [
  // --- First team ---------------------------------------------------------
  // Leverkusen, 01/07/2025 (snapshot).
  { player: 'florian-wirtz-37744', training: 'none', joined: summerOf(2025) },
  // Newcastle, 01/09/2025 (snapshot).
  { player: 'alexander-isak-36424', training: 'none', joined: summerOf(2025) },
  // Bayern Munich, 01/09/2023.
  { player: 'ryan-gravenberch-37392', training: 'none', joined: summerOf(2023) },
  // Brighton, 01/07/2023 (snapshot).
  { player: 'alexis-mac-allister-36153', training: 'none', joined: summerOf(2023) },
  // PSG, 31/08/2026 (snapshot).
  { player: 'bradley-barcola-37501', training: 'none', joined: summerOf(2026) },
  // Eintracht Frankfurt, 23/07/2025 (snapshot).
  { player: 'hugo-ekitike-37427', training: 'none', joined: summerOf(2025) },
  // PSV, 01/01/2023.
  { player: 'cody-gakpo-36287', training: 'none', joined: januaryOf(2023) },
  // RB Leipzig, 02/07/2023.
  { player: 'dominik-szoboszlai-36824', training: 'none', joined: summerOf(2023) },
  // Bournemouth, 01/07/2025 (snapshot).
  { player: 'milos-kerkez-37932', training: 'none', joined: summerOf(2025) },
  // Leverkusen, 01/07/2025 (snapshot). Manchester City's academy until
  // 2019, aged 18: association-trained.
  { player: 'jeremie-frimpong-36870', training: 'association', joined: summerOf(2025) },
  // Valencia, signed 27/08/2024 (snapshot) and loaned back for 2024/25.
  { player: 'giorgi-mamardashvili-36798', training: 'none', joined: summerOf(2024) },
  // Liverpool's academy from 2019, aged 16 (scraper/pipeline/hg_overrides.csv).
  { player: 'conor-bradley-37811', training: 'club', joined: summerOf(2019) },
  // Southampton, 01/01/2018.
  { player: 'virgil-van-dijk-33427', training: 'none', joined: januaryOf(2018) },
  // Roma, 19/07/2018.
  { player: 'alisson-33879', training: 'none', joined: summerOf(2018) },
  // Fulham, 28/07/2019, aged 16.
  { player: 'harvey-elliott-37715', training: 'club', joined: summerOf(2019) },
  // Juventus, 29/08/2024 (snapshot).
  { player: 'federico-chiesa-35728', training: 'none', joined: summerOf(2024) },
  // Rennes, 01/07/2026 (snapshot).
  { player: 'jeremy-jacquet-38546', training: 'none', joined: summerOf(2026) },
  // Charlton, June 2015, aged 18; three seasons at Liverpool before 21.
  { player: 'joe-gomez-35573', training: 'club', joined: summerOf(2015) },
  // Chelsea, September 2024, aged 16. Completes his third Liverpool season
  // in 2026/27.
  { player: 'rio-ngumoha-39689', training: 'club', joined: summerOf(2024) },
  // Celta Vigo, December 2020, aged 16 (hg_overrides.csv). Loans abroad
  // since; his first two years were uninterrupted, which is all List B asks.
  { player: 'stefan-bajcetic-38282', training: 'club', joined: januaryOf(2021) },
  // Olympiacos, 10/08/2020.
  { player: 'konstantinos-tsimikas-35197', training: 'none', joined: summerOf(2020) },
  // Parma, 15/08/2025 (snapshot).
  { player: 'giovanni-leoni-39072', training: 'none', joined: summerOf(2025) },
  // Stuttgart, 18/08/2023 (snapshot).
  { player: 'wataru-endo-34009', training: 'none', joined: summerOf(2023) },
  // Leicester, summer 2023, aged 16.
  { player: 'trey-nyoni-39263', training: 'club', joined: summerOf(2023) },
  // Slavia Prague, January 2018, aged 16.
  { player: 'vitezslav-jaros-37095', training: 'club', joined: januaryOf(2018) },
  // Preston, free, summer 2025. Newcastle's academy: association-
  // trained.
  { player: 'freddie-woodman-35493', training: 'association', joined: summerOf(2025) },
  // Liverpool's academy from childhood.
  { player: 'harvey-davies-37867', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  // Liverpool's academy from childhood.
  { player: 'luke-chambers-review', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  // Sunderland, summer 2021, aged 16.
  { player: 'james-mcconnell-review', training: 'club', joined: summerOf(2021) },
  // Liverpool's academy from childhood.
  { player: 'lewis-koumas-review', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  // Osasuna, 01/07/2026 (sweep).
  { player: 'victor-munoz-osasuna', training: 'none', joined: summerOf(2026) },
  // Austria Vienna, 01/07/2026 (sweep)
  { player: 'ifeanyi-ndukwe', training: 'none', joined: summerOf(2026) },

  // --- On loan from Barcelona for 2026/27 ---------------------------------
  // 10/08/2026 (sweep).
  { player: 'Ronald Araujo', training: 'none', joined: summerOf(2026) },

  // --- Academy -------------------------------------------------------------
  // Promotable youngsters. Except where a date is given, each joined before
  // January 2025, which is all the rules can ask of him.
  { player: 'bailey-hall', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  // Not home-grown in the dataset; arrived in summer 2025.
  { player: 'armin-pesci', training: 'none', joined: summerOf(2025) },
  // Arrived from Poland in 2023, aged 16.
  { player: 'kornel-misciur', training: 'club', joined: summerOf(2023) },
  { player: 'matty-wright', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  // Arrived from Poland in 2019, aged 16.
  { player: 'fabian-mrozek', training: 'club', joined: summerOf(2019) },
  { player: 'noah-adekoya', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'owen-beck', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'prince-cisse', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'lucas-clarke', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'lenix-conde', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'dj-esdaille', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'clae-ewing', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'wellity-lucky', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'isaac-mabaya', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'harry-moran', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'mor-talla-ndiaye', training: 'none', joined: januaryOf(2026) },
  { player: 'harvey-owen', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'lucas-pitt', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'cian-powney-wain', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'calum-scanlon', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'cam-williams', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  // Arrived from West Ham in 2023, aged 16.
  { player: 'amara-nallo', training: 'club', joined: summerOf(2023) },
  { player: 'josh-abe', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'alvin-ayman', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'joe-bradshaw', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'ryan-cowley', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'ellis-hickman', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'michael-laffey', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'lamore-lee-forrester', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'kieran-morrison', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'haydn-murray-holme', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'oliver-oconnor', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'afolami-onanuga', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'tommy-pilling', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'ben-trueman', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'joe-upton', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'aj-yeguo', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'kyle-kelly', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'jayden-danns', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'keyrol-figueroa', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  // Derby, January 2021, aged 16.
  { player: 'kaide-gordon', training: 'club', joined: januaryOf(2021) },
  { player: 'finn-inglethorpe', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'josh-sonni-lambie', training: 'club', joined: JOINED_BEFORE_FIFTEEN },
  { player: 'will-wright', training: 'association', joined: summerOf(2025) },
];

/**
 * Liverpool academy graduates now at other clubs. Signing one back brings
 * a club-trained player, who counts towards the eight reserved places
 * without using one of the four association-trained ones.
 *
 * Every other market player is derived: home-grown in the Premier League
 * sense means trained in England, so association-trained; anyone else is
 * neither.
 */
export const MARKET_CLUB_TRAINED: readonly string[] = [
  'trent-alexander-arnold-36075', // Liverpool's academy from age 6
  'curtis-jones-36921', // from age 9
  'jarell-quansah-37650', // from age 5
  // Joined from Ringmahon Rangers in 2015, aged 16.
  'caoimhin-kelleher-36122',
  'tyler-morton-37560', // from age 7
  'neco-williams-36994', // from age 10
  'rhys-williams-36925', // from childhood
  'harry-wilson-35511', // from age 8
  // Joined from QPR in February 2010, aged 15: 36 months by February 2013.
  'fa-134425', // Raheem Sterling
  // joined from Le Havre in 2017, aged 16, and stayed until 2021.
  'yasser-larouci-36892',
  // joined from Toronto FC's academy in 2016, aged 16.
  'liam-millar-36430',
];

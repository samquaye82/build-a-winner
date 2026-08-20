/**
 * Players out on loan for the 2026/27 season.
 *
 * Modelled the same way as Ronald Araujo's loan to Liverpool (`LOANED_IN`
 * in lockedLists.ts), and for the same reason (Sam, 20/08/2026): a loan is
 * not a transfer. The player belongs to his parent club, spends the season
 * at the borrowing club, and goes back when the loan ends.
 *
 * So the dataset's club column stays the OWNER throughout, and these
 * entries move him to the borrower for the windows the loan covers:
 *
 * - Summer 2026 and January 2027 (the 2026/27 season): he appears at the
 *   borrowing club, in that club's league.
 * - Summer 2027: the loan has ended, so he is back at his parent club.
 *
 * Ownership never moves, which matters beyond display. A loaned-out player
 * is still bought from the club that owns him, so `MARKET_LOCKED_CLUBS`
 * keeps working: a Manchester United player on loan elsewhere is still
 * unavailable to Liverpool.
 */

/** One player out on loan for 2026/27. */
export interface LoanedOutPlayer {
  /** Capology slug or exact display name, as with the other lists. */
  player: string;
  /** The club that owns him, stated so a mismatch is caught, not applied. */
  from: string;
  /** The club he plays for this season. */
  to: string;
}

/**
 * The loans in force for 2026/27.
 *
 * Every entry is verified against the dataset at build time: the player
 * must exist, and both clubs must be clubs the dataset holds, or the entry
 * is reported and skipped rather than applied to the wrong player.
 */
export const LOANED_OUT: readonly LoanedOutPlayer[] = [
  // Named by Sam, 20/08/2026.
  { player: 'Altay Bayındır', from: 'Manchester United', to: 'Celta Vigo' },
  { player: 'Guglielmo Vicario', from: 'Tottenham', to: 'Juventus' },
  { player: 'Romain Faivre', from: 'Bournemouth', to: 'Auxerre' },
  { player: 'Odysseas Vlachodimos', from: 'Newcastle', to: 'Sevilla' },

  // Swept from the summer 2026 loan feed
  // (scraper/output/loans_summer_2026.csv), keeping only loans where the
  // player resolves to exactly one dataset row and BOTH clubs are clubs
  // the dataset holds. Of 385 feed rows, 254 name players we do not carry,
  // 23 send them to clubs we do not model, and 32 name an owning club we
  // could not resolve; those are all left out rather than guessed.
  //
  // Alejandro Garnacho is deliberately absent: the feed calls his move to
  // Aston Villa a loan, Sam says it was a sale, and Sam wins.
  // Ronald Araujo is absent too: his loan runs the other way, into
  // Liverpool, and LOANED_IN handles it.
  { player: 'Abdoulaye Faye', from: 'Bayer Leverkusen', to: 'Celta Vigo' },
  { player: 'Alessandro Romano', from: 'Roma', to: 'Cagliari' },
  { player: 'Amine El Ouazzani', from: 'Braga', to: 'Angers' },
  { player: 'Amir Richardson', from: 'Fiorentina', to: 'Le Havre' },
  { player: 'Andrés García', from: 'Aston Villa', to: 'Getafe' },
  { player: 'Angeliño', from: 'Roma', to: 'Deportivo' },
  { player: 'Anthony Bermont', from: 'Lens', to: 'Angers' },
  { player: 'Anthony Descotte', from: 'Charleroi', to: 'Fortuna Sittard' },
  { player: 'Artem Dovbyk', from: 'Roma', to: 'Bologna' },
  { player: 'Aymen Sliti', from: 'Feyenoord', to: 'Excelsior' },
  { player: 'Benja Domínguez', from: 'Bologna', to: 'Sassuolo' },
  { player: 'Bennit Bröger', from: 'Paderborn', to: 'Koln' },
  { player: 'Charlie Cresswell', from: 'Toulouse', to: 'Rennes' },
  { player: 'Clément Lenglet', from: 'Atletico Madrid', to: 'Benfica' },
  { player: 'Dani Requena', from: 'Villarreal', to: 'Levante' },
  { player: 'Daniel Maldini', from: 'Atalanta', to: 'Cagliari' },
  { player: 'Deniz Zeitler', from: 'Hoffenheim', to: 'Paderborn' },
  { player: 'Diego Conde', from: 'Villarreal', to: 'Real Betis' },
  { player: 'Diego Pugno', from: 'Juventus', to: 'Ajax' },
  { player: 'Ebenezer Akinsanmiro', from: 'Inter Milan', to: 'Monza' },
  { player: 'Eddy Kouadio', from: 'Fiorentina', to: 'Monza' },
  { player: 'El Bilal Touré', from: 'Atalanta', to: 'Parma' },
  { player: 'Eser Gürbüz', from: 'Heerenveen', to: 'Willem II' },
  { player: 'Evann Guessand', from: 'Aston Villa', to: 'Crystal Palace' },
  { player: 'Facundo Buonanotte', from: 'Brighton', to: 'Elche' },
  { player: 'Filip Jørgensen', from: 'Chelsea', to: 'Strasbourg' },
  { player: 'Franco Mastantuono', from: 'Real Madrid', to: 'Fiorentina' },
  { player: 'Franjo Ivanović', from: 'Benfica', to: 'Lens' },
  { player: 'Gabriel Moscardo', from: 'PSG', to: 'Espanyol' },
  { player: 'Gabriele Calvani', from: 'Genoa', to: 'Frosinone' },
  { player: 'Gaetano Oristanio', from: 'Venezia', to: 'Torino' },
  { player: 'Genesis Antwi', from: 'Chelsea', to: 'Strasbourg' },
  { player: 'Giorgio Cittadini', from: 'Atalanta', to: 'Frosinone' },
  { player: 'Goduine Koyalipou', from: 'Lens', to: 'Kortrijk' },
  { player: 'Hervé Koffi', from: 'Lens', to: 'Union SG' },
  { player: 'Hugo Cuenca', from: 'Genoa', to: 'Celta Vigo' },
  { player: 'Hugo Sotelo', from: 'Celta Vigo', to: 'Levante' },
  { player: 'Jacopo Fazzini', from: 'Fiorentina', to: 'Cagliari' },
  { player: 'Jaden Slory', from: 'Feyenoord', to: 'Willem II' },
  { player: 'Jan Plug', from: 'Feyenoord', to: 'Excelsior' },
  { player: 'Jean Ives Valou', from: 'Villarreal', to: 'Getafe' },
  { player: 'Jerolldino Bergraaf', from: 'Excelsior', to: 'AZ Alkmaar' },
  { player: 'Jesse Derry', from: 'Chelsea', to: 'Sporting Lisbon' },
  { player: 'José Salinas', from: 'Espanyol', to: 'Malaga' },
  { player: 'João Mário', from: 'Juventus', to: 'Fiorentina' },
  { player: 'João Veloso', from: 'Benfica', to: 'Moreirense' },
  { player: 'Kasey Bos', from: 'Mainz', to: 'Excelsior' },
  { player: 'Kasper Boogaard', from: 'AZ Alkmaar', to: 'Willem II' },
  { player: 'Kevin Carlos', from: 'Nice', to: 'Cagliari' },
  { player: 'Lanroy Machine', from: 'Angers', to: 'Heerenveen' },
  { player: 'Lequincio Zeefuik', from: 'AZ Alkmaar', to: 'Fortuna Sittard' },
  { player: 'Loïs Openda', from: 'Juventus', to: 'Lyon' },
  { player: 'Marash Kumbulla', from: 'Roma', to: 'Rayo Vallecano' },
  { player: 'Marc-André ter Stegen', from: 'Barcelona', to: 'Ajax' },
  { player: 'Mathys Detourbet', from: 'Manchester City', to: 'Monaco' },
  { player: 'Matías Moreno', from: 'Fiorentina', to: 'Venezia' },
  { player: 'Nahuel Noll', from: 'Hoffenheim', to: 'Paderborn' },
  { player: 'Noah Darvich', from: 'Stuttgart', to: 'Elversberg' },
  { player: 'Noah Mbamba', from: 'Bayer Leverkusen', to: 'Lorient' },
  { player: 'Norman Bassette', from: 'Coventry', to: 'Westerlo' },
  { player: 'Orel Mangala', from: 'Lyon', to: 'Getafe' },
  { player: 'Othniël Raterink', from: 'Cagliari', to: 'ADO Den Haag' },
  { player: 'Patrizio Masini', from: 'Genoa', to: 'Frosinone' },
  { player: 'Pietro Comuzzo', from: 'Fiorentina', to: 'Torino' },
  { player: 'Radu Drăgușin', from: 'Tottenham', to: 'Fiorentina' },
  { player: 'Rafael Fernandes', from: 'Lille', to: 'Marítimo' },
  { player: 'Rayan Bamba', from: 'Rennes', to: 'Le Mans' },
  { player: 'Renato Marin', from: 'PSG', to: 'Nacional' },
  { player: 'Ricardo Mangas', from: 'Sporting Lisbon', to: 'Monza' },
  { player: 'Robin Gosens', from: 'Fiorentina', to: 'Schalke 04' },
  { player: 'Seydou Fini', from: 'Genoa', to: 'Frosinone' },
  { player: 'Simon Sohm', from: 'Fiorentina', to: 'Venezia' },
  { player: 'Souleymane Faye', from: 'Sporting Lisbon', to: 'Lorient' },
  { player: 'Thiago Fernández', from: 'Villarreal', to: 'Levante' },
  { player: 'Unai Núñez', from: 'Celta Vigo', to: 'Espanyol' },
  { player: 'Vasilije Adžić', from: 'Juventus', to: 'Sassuolo' },
  { player: 'Wisdom Amey', from: 'Bologna', to: 'Frosinone' },
  { player: 'Yan Couto', from: 'Borussia Dortmund', to: 'Como' },
  { player: 'Yannick Eduardo', from: 'Hoffenheim', to: 'ADO Den Haag' },
  { player: 'Yassir Zabiri', from: 'Rennes', to: 'Racing Santander' },
  { player: 'Álex Jiménez', from: 'Bournemouth', to: 'Fiorentina' },
];

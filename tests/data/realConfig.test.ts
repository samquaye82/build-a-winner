/**
 * Smoke tests over the generated real dataset. These assert structural
 * truths that survive regeneration (counts move; invariants must not).
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSquadCost,
  countRegistration,
  createGame,
  currentWindow,
  isLocked,
  rivalsAt,
  validateState,
} from '../../src/engine';
import { LOANED_OUT } from '../../src/data/loansOut';
import { realConfig } from '../../src/data/realConfig';
import {
  LIVERPOOL_LOCKED_ALWAYS,
  LIVERPOOL_LOCKED_UNTIL_JANUARY,
  LIVERPOOL_LOCKED_UNTIL_SUMMER_2027,
  LOANED_IN,
} from '../../src/data/lockedLists';

describe('realConfig', () => {
  it('builds_a_playable_three_window_game', () => {
    const state = createGame(realConfig);
    expect(state.config.windows).toHaveLength(3);
    // The game opens in January 2027 on that window's EUR 100m budget.
    expect(state.funds).toBe(100);
    expect(state.squad.length).toBeGreaterThanOrEqual(25);
    expect(state.market.length).toBeGreaterThan(3000);
  });

  it('gives_every_player_complete_finite_numbers', () => {
    const state = createGame(realConfig);
    for (const p of state.squad) {
      expect(Number.isFinite(p.baseValue), p.name).toBe(true);
      expect(Number.isFinite(p.contract.salary), p.name).toBe(true);
      expect(p.contract.expiryYear).toBeGreaterThanOrEqual(2027);
      expect(p.quality).toBeGreaterThanOrEqual(45);
    }
    for (const p of state.market.slice(0, 500)) {
      expect(Number.isFinite(p.fee), p.name).toBe(true);
      expect(Number.isFinite(p.wageDemand), p.name).toBe(true);
    }
  });

  it('locks_the_board_list_and_the_untouchables', () => {
    const state = createGame(realConfig);
    const wirtz = state.squad.find((p) => p.name.includes('Wirtz'));
    expect(wirtz?.locked).toBe(true);
    const haaland = state.market.find((p) => p.name.includes('Haaland'));
    expect(haaland?.locked).toBe(true);
    // Locked market players remain a small minority.
    const lockedShare =
      state.market.filter((p) => p.locked === true).length / state.market.length;
    expect(lockedShare).toBeLessThan(0.03);
  });

  it('locks_every_player_at_rival_clubs', () => {
    const state = createGame(realConfig);
    const rivals = state.market.filter(
      (p) => p.club === 'Manchester United' || p.club === 'Everton',
    );
    expect(rivals.length).toBeGreaterThan(30);
    expect(rivals.every((p) => p.locked === true)).toBe(true);
  });

  it('honours_named_unlock_exceptions_over_the_value_threshold', () => {
    const state = createGame(realConfig);
    const exception = state.market.find((p) => p.name === 'Yan Diomande');
    expect(exception).toBeDefined();
    expect(exception?.locked).toBe(false);
  });

  it('locks_the_value_threshold_players_without_a_named_exception', () => {
    // Vinicius signed to 2032 and came off the exceptions list, so the
    // EUR 150m threshold now covers him (Sam, 13/08/2026).
    const state = createGame(realConfig);
    const vinicius = state.market.find((p) => p.name === 'Vinicius Junior');
    expect(vinicius).toBeDefined();
    expect(vinicius?.locked).toBe(true);
  });

  it('starts_with_a_believable_scr_position', () => {
    const state = createGame(realConfig);
    const cost = computeSquadCost(state);
    // Squad cost should start pressured but legal-adjacent: between 50%
    // and 90% of the cap basis.
    expect(cost.ratio).toBeGreaterThan(0.5);
    expect(cost.ratio).toBeLessThan(0.9);
  });

  it('documents_the_starting_registration_position', () => {
    const state = createGame(realConfig);
    const counts = countRegistration(state.squad, currentWindow(state));
    // 31-man squad: whether over-21s exceed 25 is data-dependent; the
    // game must simply report a coherent starting position.
    expect(counts.total).toBe(state.squad.length);
    const violations = validateState(state);
    for (const violation of violations) {
      expect(violation.message.length).toBeGreaterThan(0);
    }
  });

  it('marks_loanees_as_unsellable_in_the_real_squad', () => {
    // Wiring check for LOANED_IN: the list is matched by display name, so
    // a rename in the dataset would silently stop flagging anyone and
    // hand the player a free sale of a player the club does not own.
    const state = createGame(realConfig);
    const loanees = state.squad.filter((p) => p.onLoan === true);
    expect(loanees.length).toBeGreaterThan(0);
    for (const loanee of loanees) {
      expect(() =>
        applyAction(state, { type: 'SELL', playerId: loanee.id }),
      ).toThrowError(/on loan/);
      expect(() =>
        applyAction(state, {
          type: 'RENEW',
          playerId: loanee.id,
          newExpiryYear: 2030,
        }),
      ).toThrowError(/on loan/);
      // The loan's own end date, not the parent club's contract.
      expect(loanee.contract.expiryYear).toBe(2027);
    }
  });

  it('matches_every_name_on_the_liverpool_lock_lists_to_a_real_player', () => {
    // A mistyped slug fails silently: the player is simply never locked,
    // and a supposedly protected star is quietly on sale. Szoboszlai was
    // added under a guessed slug and slipped through exactly this way.
    const state = createGame(realConfig);
    // Players away on loan count too: Brughmans is locked for his return.
    const liverpool = [...state.squad, ...state.loanedOut.map((l) => l.player)];
    for (const entry of [
      ...LIVERPOOL_LOCKED_ALWAYS,
      ...LIVERPOOL_LOCKED_UNTIL_SUMMER_2027,
      ...LIVERPOOL_LOCKED_UNTIL_JANUARY,
    ]) {
      const player = liverpool.find((p) => p.id === entry || p.name === entry);
      expect(player, `no Liverpool player matches "${entry}"`).toBeDefined();
      expect(player?.locked).toBe(true);
    }
  });

  it('locks_barcola_and_munoz_until_summer_2027', () => {
    const state = createGame(realConfig);
    for (const name of ['Bradley Barcola', 'Victor Muñoz']) {
      const player = state.squad.find((p) => p.name === name);
      expect(player, name).toBeDefined();
      if (player === undefined) continue;
      // Window 0 is January 2027, window 1 Summer 2027.
      expect(isLocked(player, 0), `${name} in January 2027`).toBe(true);
      expect(isLocked(player, 1), `${name} in Summer 2027`).toBe(false);
      expect(isLocked(player, 2), `${name} in January 2028`).toBe(false);
    }
  });

  it('keeps_the_young_core_locked_for_the_whole_game', () => {
    const state = createGame(realConfig);
    const liverpool = [...state.squad, ...state.loanedOut.map((l) => l.player)];
    for (const name of [
      'Jérémy Jacquet',
      'Giovanni Leoni',
      'Rio Ngumoha',
      'Trey Nyoni',
      'Lucca Brughmans',
    ]) {
      const player = liverpool.find((p) => p.name === name);
      expect(player, name).toBeDefined();
      if (player === undefined) continue;
      for (const window of [0, 1, 2]) {
        expect(isLocked(player, window), `${name} in window ${String(window)}`).toBe(true);
      }
    }
  });

  it('brings_brughmans_back_from_loan_still_locked', () => {
    // Away until Summer 2027; the lock rides on his seed into the squad.
    const state = createGame(realConfig);
    const loan = state.loanedOut.find((l) => l.player.name === 'Lucca Brughmans');
    expect(loan?.returnsInWindow).toBe(1);
    expect(loan?.player.locked).toBe(true);
    expect(loan?.player.unlocksInWindow).toBeUndefined();
  });

  it('lists_semenyo_as_home_grown_and_association_trained', () => {
    // Came through English football at Bristol City (Sam, 04/10/2026).
    for (const pool of realConfig.marketByWindow) {
      const semenyo = pool.find((p) => p.name === 'Antoine Semenyo');
      expect(semenyo?.homegrown).toBe(true);
      expect(semenyo?.uefaTraining).toBe('association');
    }
  });

  it('matches_every_loaned_in_player_to_a_real_market_entry', () => {
    const state = createGame(realConfig);
    for (const loan of LOANED_IN) {
      const player = state.squad.find(
        (p) => p.id === loan.player || p.name === loan.player,
      );
      expect(player, `no squad player matches "${loan.player}"`).toBeDefined();
      expect(player?.onLoan).toBe(true);
    }
  });

  it('unlocks_the_protected_spine_from_january_but_not_the_untouchables', () => {
    // The board listens to offers from January (Sam, 13/08/2026). The game
    // now opens in January, so the protected spine is sellable from the
    // first window. The academy jewels never come up for sale.
    const state = createGame(realConfig);
    const isak = state.squad.find((p) => p.name === 'Alexander Isak');
    const leoni = state.squad.find((p) => p.name === 'Giovanni Leoni');
    expect(isak).toBeDefined();
    expect(leoni).toBeDefined();

    expect(isLocked(isak!, 0)).toBe(false);
    expect(isLocked(isak!, 1)).toBe(false);
    expect(isLocked(isak!, 2)).toBe(false);

    expect(isLocked(leoni!, 0)).toBe(true);
    expect(isLocked(leoni!, 1)).toBe(true);
    expect(isLocked(leoni!, 2)).toBe(true);
  });

  it('sends_loanees_back_to_their_parent_club_after_the_season', () => {
    // The opening squad has 26 on UEFA List A, against a maximum of 25, and
    // 19 outside its reserved places, against 17 (Sam, 02/10/2026), so
    // January must make room before it can be submitted. Two senior players
    // who are not locally trained fix both.
    const state = [
      { type: 'SELL', playerId: 'konstantinos-tsimikas-35197' } as const,
      { type: 'SELL', playerId: 'wataru-endo-34009' } as const,
    ].reduce(applyAction, createGame(realConfig));
    const loaneeIds = state.squad
      .filter((p) => p.onLoan === true)
      .map((p) => p.id);
    const summer2027 = applyAction(
      applyAction(state, { type: 'ADVANCE_WINDOW' }),
      { type: 'ADVANCE_WINDOW' },
    );
    for (const id of loaneeIds) {
      expect(summer2027.squad.find((p) => p.id === id)).toBeUndefined();
      expect(
        summer2027.departed.find((d) => d.player.id === id)?.reason,
      ).toBe('loan-ended');

      // He goes back to the club that owns him and can be bought from
      // them, for a fee. Not a free agent: he is under contract there.
      const listing = summer2027.market.find((p) => p.id === id);
      expect(listing).toBeDefined();
      expect(listing?.club).not.toBe('Liverpool');
      expect(listing?.club).not.toBe('Free agent');
      expect(listing?.fee).toBeGreaterThan(0);
    }
  });

  it('prices_summer_2027_free_agents_at_zero', () => {
    const finalMarket = realConfig.marketByWindow[2] ?? [];
    const frees = finalMarket.filter((p) => p.fee === 0);
    expect(frees.length).toBeGreaterThan(100);
    // Free agents still cost wages.
    for (const p of frees.slice(0, 50)) {
      expect(p.wageDemand).toBeGreaterThan(0);
    }
  });
});

describe('loans out', () => {
  /** Finds a player in one window's market pool. */
  function inWindow(windowIndex: number, name: string) {
    return (realConfig.marketByWindow[windowIndex] ?? []).find(
      (p) => p.name === name,
    );
  }

  it('puts a loaned-out player at the club he plays for', () => {
    // Altay Bayındır is Manchester United's, on loan at Celta Vigo for
    // 2026/27 (Sam, 20/08/2026). January 2027 is the only window in that
    // season, so by Summer 2027 the loan has ended and he is home.
    expect(inWindow(0, 'Altay Bayındır')?.club).toBe('Celta Vigo');
    expect(inWindow(1, 'Altay Bayındır')?.club).toBe('Manchester United');
  });

  it('moves him into the borrowing club’s league too', () => {
    expect(inWindow(0, 'Altay Bayındır')?.league).toBe('la-liga');
  });

  it('sends him back to his parent club when the loan ends', () => {
    expect(inWindow(2, 'Altay Bayındır')?.club).toBe('Manchester United');
    expect(inWindow(2, 'Altay Bayındır')?.league).toBe('premier-league');
  });

  it('keeps ownership with the parent club, so locks still apply', () => {
    // Manchester United will not sell to Liverpool. Being out on loan at a
    // club that would sell must not make him buyable.
    expect(inWindow(0, 'Altay Bayındır')?.locked).toBe(true);
  });

  it('leaves a loaned-out player in the dataset exactly once', () => {
    for (const windowIndex of [0, 1, 2]) {
      const pool = realConfig.marketByWindow[windowIndex] ?? [];
      const listings = pool.filter((p) => p.name === 'Altay Bayındır');
      expect(listings).toHaveLength(1);
    }
  });

  it('applies to every loan in the list', () => {
    for (const loan of LOANED_OUT) {
      const listed = inWindow(0, loan.player);
      expect(listed?.club, `${loan.player} in window 0`).toBe(loan.to);
      expect(inWindow(2, loan.player)?.club, `${loan.player} in window 2`).toBe(
        loan.from,
      );
    }
  });
});

describe('rivals at the end of the game', () => {
  it('reads_every_premier_league_rival_from_the_market', () => {
    const rivals = rivalsAt(createGame(realConfig));
    expect(rivals).toHaveLength(19);
    expect(rivals.map((r) => r.name)).not.toContain('Liverpool');
  });

  it('stops_counting_declan_rice_for_arsenal_once_liverpool_sign_him', () => {
    // Sam's example (03/10/2026): he cannot count for both squads.
    const state = createGame(realConfig);
    const signed = applyAction(state, { type: 'BUY', playerId: 'declan-rice-36174' });
    const arsenal = (s: typeof state) => rivalsAt(s).find((r) => r.name === 'Arsenal')?.strength ?? 0;
    expect(arsenal(signed)).toBeLessThan(arsenal(state));
    expect(signed.squad.some((p) => p.id === 'declan-rice-36174')).toBe(true);
  });
});

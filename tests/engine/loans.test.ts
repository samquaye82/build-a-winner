/**
 * Tests for club players away on loan when the game opens: held apart from
 * every rule until their return window, aged and revalued while away, then
 * moved into the squad. Also covers fees agreed before the game, which such
 * a player may carry, and their amortisation.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  autoPickBestXI,
  computeSquadCost,
  countRegistration,
  createGame,
  currentWindow,
  replay,
  scoreGame,
  type Action,
  type GameConfig,
  type GameState,
  type LoanedOutSeed,
  type SquadPlayerSeed,
} from '../../src/engine';
import {
  makeMarketPlayer,
  makeSquadPlayer,
  makeTestConfig,
  makeThreeWindowConfig,
} from './fixtures';

const advance: Action = { type: 'ADVANCE_WINDOW' };

/** A young keeper away on loan, signed before the game for EUR 35m. */
const keeper: SquadPlayerSeed = makeSquadPlayer({
  id: 'away-gk',
  position: 'GK',
  age: 20,
  baseValue: 35,
  quality: 60,
  contract: { expiryYear: 2032, salary: 6 },
  priorSigning: { fee: 35, contractYears: 6 },
});

/**
 * The three-window fixture config with players away on loan.
 *
 * @param loans - The loans to add.
 * @returns The config.
 */
function withLoans(...loans: LoanedOutSeed[]): GameConfig {
  return { ...makeThreeWindowConfig(), loanedOut: loans };
}

/**
 * Applies actions to a fresh game.
 *
 * @param config - The config to start from.
 * @param actions - The actions to apply in order.
 * @returns The resulting state.
 */
function play(config: GameConfig, ...actions: Action[]): GameState {
  return actions.reduce(applyAction, createGame(config));
}

const backInSummer: LoanedOutSeed = {
  player: keeper,
  club: 'Borrowers FC',
  returnsInWindow: 1,
};

describe('while away', () => {
  it('holds_him_apart_from_the_squad', () => {
    const state = createGame(withLoans(backInSummer));
    expect(state.squad.map((p) => p.id)).not.toContain('away-gk');
    expect(state.loanedOut.map((l) => l.player.id)).toEqual(['away-gk']);
    expect(state.loanedOut[0]?.club).toBe('Borrowers FC');
  });

  it('leaves_him_out_of_registration_and_squad_cost', () => {
    const away = createGame(withLoans(backInSummer));
    const without = createGame(makeThreeWindowConfig());
    expect(countRegistration(away.squad, currentWindow(away))).toEqual(
      countRegistration(without.squad, currentWindow(without)),
    );
    expect(computeSquadCost(away)).toEqual(computeSquadCost(without));
  });

  it('does_not_let_him_be_sold', () => {
    expect(() =>
      play(withLoans(backInSummer), { type: 'SELL', playerId: 'away-gk' }),
    ).toThrowError();
  });
});

describe('returning', () => {
  it('joins_the_squad_at_the_opening_of_his_window', () => {
    const state = play(withLoans(backInSummer), advance);
    expect(state.squad.map((p) => p.id)).toContain('away-gk');
    expect(state.loanedOut).toEqual([]);
  });

  it('ages_and_revalues_him_exactly_as_if_he_had_been_here', () => {
    // A twin in the squad progresses through the same transition.
    const config = withLoans(backInSummer);
    const twin = { ...keeper, id: 'twin-gk', priorSigning: undefined };
    const state = play(
      { ...config, initialSquad: [...config.initialSquad, twin] },
      advance,
    );
    const returned = state.squad.find((p) => p.id === 'away-gk');
    const stayed = state.squad.find((p) => p.id === 'twin-gk');
    expect(returned?.age).toBe(21);
    expect(returned?.age).toBe(stayed?.age);
    expect(returned?.baseValue).toBe(stayed?.baseValue);
    expect(returned?.saleValue).toBe(stayed?.saleValue);
  });

  it('stays_away_until_his_own_window', () => {
    const config = withLoans({ ...backInSummer, returnsInWindow: 2 });
    const summer = play(config, advance);
    expect(summer.squad.map((p) => p.id)).not.toContain('away-gk');
    expect(summer.loanedOut).toHaveLength(1);

    const january = applyAction(summer, advance);
    expect(january.squad.map((p) => p.id)).toContain('away-gk');
    expect(january.loanedOut).toEqual([]);
  });

  it('is_never_listed_in_the_market_he_returns_into', () => {
    // Even if a data error authored him into the next pool.
    const config = withLoans(backInSummer);
    const pools = config.marketByWindow.map((pool, index) =>
      index === 1 ? [...pool, makeMarketPlayer({ id: 'away-gk' })] : pool,
    );
    const state = play({ ...config, marketByWindow: pools }, advance);
    expect(state.market.map((p) => p.id)).not.toContain('away-gk');
  });

  it('can_be_sold_once_back', () => {
    const state = play(withLoans(backInSummer), advance, {
      type: 'SELL',
      playerId: 'away-gk',
    });
    expect(state.departed.map((d) => d.player.id)).toContain('away-gk');
  });

  it('replays_identically', () => {
    const config = withLoans(backInSummer);
    const live = play(config, advance, { type: 'SELL', playerId: 'away-gk' });
    expect(replay(config, live.actionLog)).toEqual(live);
  });
});

describe('configuration checks', () => {
  it('rejects_a_return_in_the_opening_window', () => {
    expect(() =>
      createGame(withLoans({ ...backInSummer, returnsInWindow: 0 })),
    ).toThrowError(/not a later window/);
  });

  it('rejects_a_return_after_the_last_window', () => {
    expect(() =>
      createGame(withLoans({ ...backInSummer, returnsInWindow: 3 })),
    ).toThrowError(/not a later window/);
  });

  it('rejects_a_contract_that_ends_before_he_is_back', () => {
    const shortDeal = {
      ...keeper,
      contract: { expiryYear: 2027, salary: 6 },
    };
    expect(() =>
      createGame(withLoans({ ...backInSummer, player: shortDeal })),
    ).toThrowError(/before he returns from loan/);
  });
});

describe('fees agreed before the game', () => {
  it('amortises_from_the_window_he_returns', () => {
    const before = computeSquadCost(createGame(withLoans(backInSummer)));
    const after = computeSquadCost(play(withLoans(backInSummer), advance));
    expect(before.signingAmortisation).toBe(0);
    // EUR 35m over a six-year deal, capped at five years: 7 a year.
    expect(after.signingAmortisation).toBe(7);
  });

  it('amortises_a_squad_player_carrying_one_from_the_start', () => {
    const config = makeTestConfig();
    const state = createGame({
      ...config,
      initialSquad: [...config.initialSquad, keeper],
    });
    expect(computeSquadCost(state).signingAmortisation).toBe(7);
  });

  it('drops_the_amortisation_when_he_is_sold', () => {
    const state = play(withLoans(backInSummer), advance, {
      type: 'SELL',
      playerId: 'away-gk',
    });
    expect(computeSquadCost(state).signingAmortisation).toBe(0);
  });

  it('spreads_a_short_deal_over_its_own_length', () => {
    const config = makeTestConfig();
    const shortDeal = makeSquadPlayer({
      id: 'short',
      priorSigning: { fee: 30, contractYears: 3 },
    });
    const state = createGame({
      ...config,
      initialSquad: [...config.initialSquad, shortDeal],
    });
    expect(computeSquadCost(state).signingAmortisation).toBe(10);
  });
});

describe('value created', () => {
  /**
   * Plays a config through every window and scores it.
   *
   * @param config - The config.
   * @returns The value-created component of the score.
   */
  function valueCreated(config: GameConfig) {
    // Renewing the two fixture players whose deals end in 2027 keeps enough
    // outfielders for an eleven at the end.
    const final = play(
      config,
      { type: 'RENEW', playerId: 'cb2', newExpiryYear: 2030 },
      { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
      advance,
      advance,
    );
    const scored = applyAction(final, {
      type: 'PICK_XI',
      selection: autoPickBestXI(final),
    });
    return scoreGame(scored).valueCreated;
  }

  it('scores_a_returning_loanee_as_if_he_had_been_here_all_along', () => {
    const away = withLoans(backInSummer);
    const present = {
      ...makeThreeWindowConfig(),
      initialSquad: [...makeThreeWindowConfig().initialSquad, keeper],
    };
    expect(valueCreated(away)).toEqual(valueCreated(present));
  });
});

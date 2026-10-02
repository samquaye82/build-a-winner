/**
 * Academy promotion tests.
 *
 * Covers the PROMOTE / UNDO_PROMOTE actions and the rule that academy
 * players are invisible to every topline figure, the registration count and
 * the squad cost until they are promoted into the first-team squad.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  computeSquadCost,
  countRegistration,
  createGame,
  EngineError,
  replay,
  type Action,
  type GameConfig,
} from '../../src/engine';
import {
  makeAcademyPlayer,
  makeTestConfig,
  makeThreeWindowConfig,
} from './fixtures';

describe('academy pool at game start', () => {
  it('seeds the academy pool separately from the squad', () => {
    const state = createGame(makeTestConfig());
    expect(state.academy).toHaveLength(3);
    expect(state.squad.some((p) => p.id.startsWith('acad-'))).toBe(false);
  });

  it('excludes academy wages from the squad cost until promotion', () => {
    const state = createGame(makeTestConfig());
    const before = computeSquadCost(state).wageBill;
    // The fixture academy carries three 0.78m salaries that must not count.
    expect(before).toBe(63);
  });

  it('excludes academy players from the registration count', () => {
    const state = createGame(makeTestConfig());
    const counts = countRegistration(state.squad);
    // Squad is 13 players; the three academy players are not among them.
    expect(counts.total).toBe(13);
  });
});

describe('PROMOTE', () => {
  it('moves an academy player into the squad for free', () => {
    const state = createGame(makeTestConfig());
    const funds = state.funds;
    const next = applyAction(state, { type: 'PROMOTE', playerId: 'acad-cb' });

    expect(next.funds).toBe(funds);
    expect(next.academy.some((p) => p.id === 'acad-cb')).toBe(false);
    const promoted = next.squad.find((p) => p.id === 'acad-cb');
    expect(promoted).toBeDefined();
    expect(promoted?.promotion).toEqual({ windowIndex: 0 });
  });

  it('adds the promoted wage but no amortisation to the squad cost', () => {
    const state = createGame(makeTestConfig());
    const before = computeSquadCost(state);
    const next = applyAction(state, { type: 'PROMOTE', playerId: 'acad-cb' });
    const after = computeSquadCost(next);

    // The 0.78m salary lands on the wage bill (rounded to the engine's 1dp
    // money precision, so it reads as +0.8).
    expect(after.wageBill).toBeGreaterThan(before.wageBill);
    expect(after.wageBill).toBe(63.8);
    // No acquisition means no fee to spread: signing amortisation is untouched.
    expect(after.signingAmortisation).toBe(before.signingAmortisation);
  });

  it('counts a promoted over-21 player in the registration tallies', () => {
    const config: GameConfig = {
      ...makeTestConfig(),
      academy: [makeAcademyPlayer({ id: 'acad-vet', position: 'CB', age: 24 })],
    };
    const state = createGame(config);
    const before = countRegistration(state.squad);
    const next = applyAction(state, { type: 'PROMOTE', playerId: 'acad-vet' });
    const after = countRegistration(next.squad);

    expect(after.over21).toBe(before.over21 + 1);
    // The fixture academy players are home-grown by default.
    expect(after.homegrownOver21).toBe(before.homegrownOver21 + 1);
  });

  it('keeps a promoted U21 registration-exempt', () => {
    const state = createGame(makeTestConfig());
    const before = countRegistration(state.squad);
    // acad-cb is 20: under the U21 limit.
    const next = applyAction(state, { type: 'PROMOTE', playerId: 'acad-cb' });
    const after = countRegistration(next.squad);

    expect(after.over21).toBe(before.over21);
    expect(after.u21).toBe(before.u21 + 1);
    expect(after.total).toBe(before.total + 1);
  });

  it('makes a promoted player sellable, banking the proceeds', () => {
    const state = createGame(makeTestConfig());
    const promoted = applyAction(state, { type: 'PROMOTE', playerId: 'acad-st' });
    const saleValue = promoted.squad.find((p) => p.id === 'acad-st')?.saleValue;
    expect(saleValue).toBe(20);

    const sold = applyAction(promoted, { type: 'SELL', playerId: 'acad-st' });
    expect(sold.funds).toBe(promoted.funds + 20);
    expect(sold.squad.some((p) => p.id === 'acad-st')).toBe(false);
    expect(sold.departed.some((d) => d.player.id === 'acad-st')).toBe(true);
  });

  it('rejects promoting a player who is not in the academy', () => {
    const state = createGame(makeTestConfig());
    expect(() =>
      applyAction(state, { type: 'PROMOTE', playerId: 'not-a-player' }),
    ).toThrow(EngineError);
  });
});

describe('UNDO_PROMOTE', () => {
  it('returns a player promoted this window to the academy pool', () => {
    const state = createGame(makeTestConfig());
    const promoted = applyAction(state, { type: 'PROMOTE', playerId: 'acad-cb' });
    const undone = applyAction(promoted, {
      type: 'UNDO_PROMOTE',
      playerId: 'acad-cb',
    });

    expect(undone.squad.some((p) => p.id === 'acad-cb')).toBe(false);
    expect(undone.academy.some((p) => p.id === 'acad-cb')).toBe(true);
    expect(undone.academy.find((p) => p.id === 'acad-cb')?.promotion).toBeUndefined();
    // Restored in authored order: gk, cb, st.
    expect(undone.academy.map((p) => p.id)).toEqual(['acad-gk', 'acad-cb', 'acad-st']);
  });

  it('rejects undoing a promotion made in an earlier window', () => {
    const state = createGame(makeThreeWindowConfig());
    // Promote, satisfy nothing else, then advance the window.
    const promoted = applyAction(state, { type: 'PROMOTE', playerId: 'acad-cb' });
    const advanced = applyAction(promoted, { type: 'ADVANCE_WINDOW' });

    expect(() =>
      applyAction(advanced, { type: 'UNDO_PROMOTE', playerId: 'acad-cb' }),
    ).toThrow(EngineError);
  });

  it('unwinds a renewal agreed after promotion', () => {
    const state = createGame(makeTestConfig());
    const promoted = applyAction(state, { type: 'PROMOTE', playerId: 'acad-cb' });
    const renewed = applyAction(promoted, {
      type: 'RENEW',
      playerId: 'acad-cb',
      newExpiryYear: 2031,
    });
    const undone = applyAction(renewed, {
      type: 'UNDO_PROMOTE',
      playerId: 'acad-cb',
    });

    const back = undone.academy.find((p) => p.id === 'acad-cb');
    expect(back?.renewal).toBeUndefined();
    // Original fixed academy contract restored.
    expect(back?.contract).toEqual({ expiryYear: 2029, salary: 0.78 });
  });
});

describe('academy progression', () => {
  it('ages academy players at the season boundary without drifting value', () => {
    const state = createGame(makeThreeWindowConfig());
    // January 2027 -> Summer 2027 crosses seasons: age ticks, value holds.
    const summer = applyAction(state, { type: 'ADVANCE_WINDOW' });
    const cbSummer = summer.academy.find((p) => p.id === 'acad-cb');
    expect(cbSummer?.age).toBe(21);
    expect(cbSummer?.baseValue).toBe(20);

    // Two expiries at the boundary leave ten men, one short of submitting;
    // promoting a different academy player keeps acad-cb in the pool.
    const refilled = applyAction(summer, { type: 'PROMOTE', playerId: 'acad-st' });

    // Summer 2027 -> January 2028 stays in-season: no ageing, value holds.
    const jan = applyAction(refilled, { type: 'ADVANCE_WINDOW' });
    const cbJan = jan.academy.find((p) => p.id === 'acad-cb');
    expect(cbJan?.age).toBe(21);
    expect(cbJan?.baseValue).toBe(20);
  });

  it('carries the academy pool forward across windows', () => {
    const state = createGame(makeThreeWindowConfig());
    const advanced = applyAction(state, { type: 'ADVANCE_WINDOW' });
    expect(advanced.academy).toHaveLength(3);
    // Promoted players are not carried as academy players.
    const promoted = applyAction(state, { type: 'PROMOTE', playerId: 'acad-cb' });
    const afterPromote = applyAction(promoted, { type: 'ADVANCE_WINDOW' });
    expect(afterPromote.academy).toHaveLength(2);
  });
});

describe('determinism', () => {
  it('reproduces state when a log containing promotions is replayed', () => {
    const config = makeThreeWindowConfig();
    const log: readonly Action[] = [
      { type: 'PROMOTE', playerId: 'acad-cb' },
      { type: 'PROMOTE', playerId: 'acad-st' },
      { type: 'UNDO_PROMOTE', playerId: 'acad-st' },
      { type: 'ADVANCE_WINDOW' },
    ];
    const direct = log.reduce(applyAction, createGame(config));
    const replayed = replay(config, log);
    expect(replayed).toEqual(direct);
  });
});

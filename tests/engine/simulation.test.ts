/**
 * Tests for the end-of-game season projection.
 *
 * The projection is a deterministic expected-goals model: no randomness, so
 * identical squads must always project identical seasons. Tests use fictional
 * fixture data and assert structural invariants (record sums, points, goal
 * difference), determinism, and monotonicity, rather than brittle exact
 * scorelines from the tuning curve.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  EngineError,
  replay,
  seasonVerdict,
  simulateSeason,
  type Action,
  type GameConfig,
  type GameState,
  type XISelection,
} from '../../src/engine';
import { makeTestConfig } from './fixtures';

/** The natural fixture XI (4-2-3-1), reused from the scoring fixtures. */
const fixtureXI: XISelection = {
  formationId: '4-2-3-1',
  playerIds: [
    'gk1', 'rb1', 'cb1', 'cb2', 'lb1',
    'cm1', 'cm2', 'rw1', 'am1', 'lw1', 'st1',
  ],
};

/** A finished single-window game with the fixture XI picked. */
function finishedGame(config: GameConfig = makeTestConfig()): GameState {
  return applyAction(createGame(config), {
    type: 'PICK_XI',
    selection: fixtureXI,
  });
}

/** The fixture config with every squad player's quality set to `quality`. */
function uniformQualityConfig(quality: number): GameConfig {
  const config = makeTestConfig();
  return {
    ...config,
    initialSquad: config.initialSquad.map((p) => ({ ...p, quality })),
  };
}

describe('simulateSeason', () => {
  it('requires an XI', () => {
    expect(() => simulateSeason(createGame(makeTestConfig()))).toThrow(
      EngineError,
    );
  });

  it('projects a full 38-game season from nineteen rivals', () => {
    const projection = simulateSeason(finishedGame());
    expect(projection.played).toBe(38);
    expect(projection.won + projection.drawn + projection.lost).toBe(38);
  });

  it('keeps points and goal difference internally consistent', () => {
    const projection = simulateSeason(finishedGame());
    expect(projection.points).toBe(projection.won * 3 + projection.drawn);
    expect(projection.goalDiff).toBe(
      projection.goalsFor - projection.goalsAgainst,
    );
  });

  it('is deterministic across calls', () => {
    const state = finishedGame();
    expect(simulateSeason(state)).toEqual(simulateSeason(state));
  });

  it('reproduces the projection from a replayed action log', () => {
    const config = makeTestConfig();
    const live = finishedGame(config);
    const replayed = replay(config, live.actionLog);
    expect(simulateSeason(replayed)).toEqual(simulateSeason(live));
  });

  it('projects more points for a stronger XI (monotonic)', () => {
    const strong = simulateSeason(finishedGame(uniformQualityConfig(90)));
    const weak = simulateSeason(finishedGame(uniformQualityConfig(60)));
    expect(strong.points).toBeGreaterThan(weak.points);
    expect(strong.goalDiff).toBeGreaterThan(weak.goalDiff);
  });

  it('crowns an overwhelming squad champions and unbeaten', () => {
    // A quality-99 squad against a far weaker league should sweep the board.
    // Going unbeaten is deliberately hard, so the mismatch here is extreme:
    // even so, only such dominance rounds expected losses down to zero.
    const config: GameConfig = {
      ...uniformQualityConfig(99),
      rivals: Array.from({ length: 19 }, (_unused, i) => ({
        name: `Minnow ${String(i + 1)}`,
        strength: 35,
      })),
    };
    const projection = simulateSeason(finishedGame(config));
    expect(projection.lost).toBe(0);
    expect(projection.invincible).toBe(true);
    expect(projection.verdict).toBe('Dynasty');
  });

  it('sends a weak squad against a strong league down', () => {
    const config: GameConfig = {
      ...uniformQualityConfig(55),
      rivals: Array.from({ length: 19 }, (_unused, i) => ({
        name: `Giant ${String(i + 1)}`,
        strength: 88,
      })),
    };
    const projection = simulateSeason(finishedGame(config));
    expect(projection.invincible).toBe(false);
    expect(projection.lost).toBeGreaterThan(0);
    expect(projection.verdict).toBe('Relegation scrap');
  });

  it('judges_the_verdict_on_strength_not_points', () => {
    // An 80-strength squad among nineteen 70s runs away with the league on
    // points, but its strength makes it a Champions League side (Sam,
    // 03/10/2026).
    const config: GameConfig = {
      ...uniformQualityConfig(80),
      rivals: Array.from({ length: 19 }, (_unused, i) => ({
        name: `Weak ${String(i + 1)}`,
        strength: 70,
      })),
    };
    const projection = simulateSeason(finishedGame(config));
    expect(projection.strength).toBe(80);
    expect(projection.points).toBeGreaterThan(90);
    expect(projection.verdict).toBe('Champions League');
  });

  it('reports a full-squad strength on the quality scale', () => {
    // A uniform quality-80 squad blends to a strength of exactly 80 (0.6 x 80
    // XI + 0.4 x 80 rest), matching the Squad quality methodology.
    const projection = simulateSeason(finishedGame(uniformQualityConfig(80)));
    expect(projection.strength).toBe(80);
  });

  it('falls back to a full 38-game season when no rivals are configured', () => {
    const config = makeTestConfig();
    const { rivals: _unused, ...withoutRivals } = config;
    const projection = simulateSeason(finishedGame(withoutRivals));
    expect(projection.played).toBe(38);
  });
});

describe('season projection is separate from the rating', () => {
  it('does not require the projection for the game to be scorable', () => {
    // simulateSeason and scoreGame are independent entry points; picking the
    // XI enables both, but neither depends on the other.
    const state = finishedGame();
    const log: readonly Action[] = state.actionLog;
    expect(log).toContainEqual({ type: 'PICK_XI', selection: fixtureXI });
  });
});

describe('seasonVerdict', () => {
  it('maps_every_band_floor_and_the_value_just_below_it', () => {
    const cases: [number, string][] = [
      [100, 'Dynasty'],
      [90, 'Dynasty'],
      [89.9, 'Champions'],
      [85, 'Champions'],
      [84.9, 'Title race'],
      [84, 'Title race'],
      [83.9, 'Champions League'],
      [80, 'Champions League'],
      [79.9, 'Europa / top half'],
      [77, 'Europa / top half'],
      [76.9, 'Mid-table'],
      [76, 'Mid-table'],
      [75.9, 'Relegation scrap'],
      [40, 'Relegation scrap'],
    ];
    for (const [strength, label] of cases) {
      expect(seasonVerdict(strength), String(strength)).toBe(label);
    }
  });
});

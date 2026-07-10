/**
 * Smoke tests for the engine entry point.
 *
 * Proves the TypeScript + Vitest pipeline resolves the engine module
 * correctly. Real behavioural tests arrive with the M1 reducers.
 */
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../src/engine';

describe('engine entry point', () => {
  it('exposes_a_semver_engine_version', () => {
    // Guards the leaderboard compatibility contract: the version must always
    // be present and parseable as MAJOR.MINOR.PATCH.
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

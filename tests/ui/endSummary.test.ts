/**
 * Tests for the end-screen summary and share-text helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createGame,
  scoreGame,
  type Action,
} from '../../src/engine';
import { buildShareText, endSummary } from '../../src/ui/helpers';
import { makeThreeWindowConfig } from '../engine/fixtures';

/** The scoring playthrough from the engine suite: 2 in, 0 out, cb2 walks. */
const playthrough: readonly Action[] = [
  { type: 'RENEW', playerId: 'cm1', newExpiryYear: 2030 },
  { type: 'BUY', playerId: 'buy-cb' },
  { type: 'BUY', playerId: 'buy-st' },
  { type: 'ADVANCE_WINDOW' },
  { type: 'ADVANCE_WINDOW' },
  {
    type: 'PICK_XI',
    selection: {
      formationId: '4-2-3-1',
      playerIds: [
        'gk1', 'rb1', 'cb1', 'buy-cb', 'lb1',
        'cm1', 'cm2', 'rw1', 'am1', 'lw1', 'st1',
      ],
    },
  },
];

function finished(): ReturnType<typeof createGame> {
  return playthrough.reduce(applyAction, createGame(makeThreeWindowConfig()));
}

describe('endSummary', () => {
  it('summarises_signings_sales_and_free_exits', () => {
    const summary = endSummary(finished());
    expect(summary.signings).toBe(2);
    expect(summary.spent).toBe(95); // 35 + 60
    expect(summary.sales).toBe(0);
    expect(summary.raised).toBe(0);
    expect(summary.netSpend).toBe(95);
    expect(summary.freeExits).toEqual(['Player cb2']);
  });

  it('counts_a_sold_signing_on_both_sides_of_the_ledger', () => {
    const state = [
      { type: 'BUY', playerId: 'buy-st' } as const,
      { type: 'SELL', playerId: 'buy-st' } as const,
    ].reduce(applyAction, createGame(makeThreeWindowConfig()));
    const summary = endSummary(state);
    expect(summary.signings).toBe(1);
    expect(summary.sales).toBe(1);
    expect(summary.netSpend).toBe(0);
  });
});

describe('buildShareText', () => {
  it('builds_a_compact_three_line_summary', () => {
    const state = finished();
    const text = buildShareText(state, scoreGame(state));
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Sporting Director: \d+\/100$/);
    expect(lines[1]).toContain('2 in, 0 out, net spend €95m');
    expect(lines[2]).toContain('4-2-3-1');
  });
});

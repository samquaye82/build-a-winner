# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A single-session football puzzle game inspired by the RedmenTV transfer game (https://claude.ai/public/artifacts/a2c26df6-9356-4462-a486-297b40d5d670). The player is Liverpool's Director of Football planning three consecutive transfer windows in one sitting: Summer 2026, January 2027, Summer 2027. No simulated matches, no save games, no career mode. The game ends with a pick-your-XI phase and a single squad rating.

## Commands

```bash
npm run dev         # dev server
npm test            # run all tests (vitest)
npx vitest run tests/engine/index.test.ts   # run a single test file
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production build
```

## Architecture

The defining rule: **all game logic lives in `src/engine/`, a pure deterministic TypeScript module with no React or DOM imports**. The engine is a state machine, `(GameState, Action) -> GameState`. The UI (`src/ui/`) dispatches actions and renders state; it must never compute rules itself.

Determinism is a hard requirement. Identical action sequences must always produce identical states and scores; no randomness anywhere in the engine. This keeps scores comparable and allows a future verified leaderboard to replay a client's action log server-side (planned as a later bolt-on, not in v1). Bump `ENGINE_VERSION` in `src/engine/index.ts` whenever a rules or data change makes scores incomparable with earlier versions.

- `src/engine/types.ts` — Player, Contract, WindowState, GameState, Action
- `src/engine/actions.ts` — buy / sell / renew contract, as pure reducers
- `src/engine/rules/` — validation: PL registration (25-man squad, ≤17 non-home-grown, U21 exemption), per-window budgets, squad cost ratio
- `src/engine/progression.ts` — between-window changes, fully scripted: ageing, deterministic value shifts, market evolution (players leaving for/arriving from other clubs), contract expiry (unrenewed, unsold expiring players leave free)
- `src/engine/scoring.ts` — final squad rating
- `src/data/` — typed player database: current squad plus a market pool per window, and the progression scripts
- `tests/` — vitest; mirrors `src/` structure. Engine tests use fictional fixture data, not the real player database

## Game rules being modelled

- **Budgets** are per-window; unspent funds and sale proceeds roll forward. The **squad cost ratio (SCR) rolls across windows**: wages + amortisation (fee ÷ contract years) vs `squadCostCapBase × SCR_LIMIT`. The starting squad has no per-player book values; a club-level `baselineAmortisation` (GameConfig) provides the starting position and is never reduced by sales. No amortisation re-spreading on renewal.
- **Contract renewals**: salary uplift scaled by urgency (remaining years), years added, and quality. **One renewal per player per game** (undoable within its window). Renewing also restores sale value (running-down discount by remaining months: ×0.9 at 24, ×0.75 at 18, ×0.5 at 12, ×0.25 at 6, ×0.95 at 30; January windows sit six months into the season, so 18/30/6-month rungs only arise there).
- **Sale values are derived, never authored**: `saleValue = baseValue × contract discount`. Authored data supplies `baseValue` (see `SquadPlayerSeed`).
- **Window advancement is one-way** (`ADVANCE_WINDOW`), blocked while violations exist. Progression order between windows: expiry → age tick → value drift → market swap → funds. Expiry and ageing apply only at season boundaries (`seasonStartYear` increases); value drift applies at every transition at half the annual age/quality curve rate. Market pools are authored per window; the engine filters out players already at the club (buy-backs of sold players are allowed).
- Players carry age, position, home-grown status (U21 derived from age ≤ 21) and contract data.

## Project conventions

- Milestone plan M0–M6 agreed with Sam; check the todo/plan before starting new work. Scoring formula (M3), UI visual design (M4) and real player data (M6) each require a design conversation with Sam before implementation. Sam has his own idea for the frontend colour palette and design: do not choose one unilaterally.
- Values, wages and fees in the player database are game-design numbers agreed with Sam, not a live data feed.
- Keep dependencies minimal: react, react-dom, vite, @vitejs/plugin-react, typescript, vitest. Adding anything else needs explicit approval.

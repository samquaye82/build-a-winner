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

- **Budgets** are per-window (fresh grant each window; sale proceeds add to funds), but the **squad cost ratio (SCR) rolls across windows**: annual wages plus annual transfer-fee amortisation (fee ÷ contract years, 5-year cap) measured against a fixed cap. A window 1 signing burdens SCR in every later window; selling removes the wage and remaining book value.
- **Contract renewals** cost a salary increase (scaled by player quality and remaining term) and push back the free-agency cliff. Contract expiry is the game's central tension.
- Players carry age, position, home-grown status (HGP / non-HG / U21) and contract data.

## Project conventions

- Milestone plan M0–M6 agreed with Sam; check the todo/plan before starting new work. Scoring formula (M3), UI visual design (M4) and real player data (M6) each require a design conversation with Sam before implementation. Sam has his own idea for the frontend colour palette and design: do not choose one unilaterally.
- Values, wages and fees in the player database are game-design numbers agreed with Sam, not a live data feed.
- Keep dependencies minimal: react, react-dom, vite, @vitejs/plugin-react, typescript, vitest. Adding anything else needs explicit approval.

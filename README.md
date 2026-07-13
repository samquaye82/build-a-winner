# Build a Winner

A single-session football transfer puzzle. You are Liverpool's Sporting
Director, planning three consecutive transfer windows in one sitting: Summer
2026, January 2027 and Summer 2027. Buy and sell players, renew expiring
contracts, keep inside the real Premier League squad rules, then pick your
starting XI for a squad rating out of 100.

No matches are simulated and there are no save games: every decision stands.
It is a planning puzzle, not a management sim, and it is inspired by the
RedmenTV transfer game.

## How it plays

- **Three windows, one sitting.** A EUR 200m budget opens the summer; unspent
  funds and sale proceeds roll forward into January and Summer 2027.
- **Buy, sell, renew.** Sign players from across Europe's top leagues, sell
  those you can spare, and renew expiring contracts before your best players
  walk away for free.
- **Real squad rules.** Stay inside the 25-man registration limit (at most 17
  non-home-grown, under-21s exempt) and the squad cost ratio (wages plus fee
  amortisation against 70% of revenue).
- **A living market.** Between windows, players age, values drift and contracts
  wind down, all fully deterministic. Rivals (Manchester United, Everton) and
  the odd untouchable superstar are out of reach.
- **Pick your XI.** When the windows shut, choose a formation and eleven. You
  are scored on squad quality and depth, balance, age profile, contract health
  and the value you created.

## Running it locally

Requires Node 20+ (developed on Node 24).

```bash
npm install       # first-time setup
npm run dev       # start the dev server (http://localhost:5173)
```

Other scripts:

| Command | Purpose |
| --- | --- |
| `npm test` | Run the test suite (Vitest) |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally |

## Architecture

The defining rule: **all game logic lives in `src/engine/`, a pure,
deterministic TypeScript module with no React or DOM imports.** The engine is a
state machine, `(GameState, Action) -> GameState`. The UI (`src/ui/`)
dispatches actions and renders state; it never computes rules itself.

Determinism is a hard requirement. Identical action sequences always produce
identical states and scores, with no randomness anywhere in the engine. This
keeps scores comparable and leaves the door open to a future verified
leaderboard that replays a client's action log server-side. `ENGINE_VERSION`
(in `src/engine/index.ts`) is bumped whenever a rules or data change makes
scores incomparable with earlier versions.

```
src/
  engine/      Pure deterministic rules engine (state machine, no React)
    rules/     Registration, budgets, squad cost ratio, renewals, values
    scoring.ts Final squad rating
    progression.ts  Between-window ageing, value drift, market evolution
  ui/          React components; dispatches actions, renders state
  data/        Typed player database plus per-window market pools
scripts/       Data generator (enriched CSV -> gameData.json)
scraper/       One-off Python pipeline that builds the player database
tests/         Vitest suite, mirroring src/ (engine tests use fixtures)
```

The player database is generated from a one-off scrape of public salary and
contract data (see `scraper/`), then hand-reviewed. The valuations, wages and
fees are game-design numbers, not a live data feed. Regenerating the game data
after a data edit is a single command, `npm run data:rebuild` (see
`scraper/README.md`).

## Tech stack

React 19, TypeScript (strict), Vite, Vitest. Dependencies are kept
deliberately minimal.

## Licence

[MIT](LICENSE) © 2026 Sam Quaye.

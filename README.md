# Sporting Director Game

A single-session football puzzle game, inspired by the RedmenTV transfer game. You are Liverpool's Director of Football, planning three consecutive transfer windows in one sitting: Summer 2026, January 2027 and Summer 2027.

Buy and sell players, renew expiring contracts, and stay inside real Premier League squad rules (25-man registration, home-grown quotas, squad cost ratio). Players age and market values shift deterministically between windows. At the end, pick your starting XI and receive a squad rating.

No seasons are simulated and there are no save games: it is a planning puzzle, not a management sim.

## Development

```bash
npm install       # first-time setup
npm run dev       # start the dev server
npm test          # run the test suite (vitest)
npm run build     # typecheck + production build
```

## Status

Early development. The deterministic rules engine (`src/engine/`) is being built first; the UI follows once the engine is complete.

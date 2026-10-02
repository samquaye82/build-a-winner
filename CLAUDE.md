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
- `src/engine/rules/` — validation: PL registration (25-man squad, ≤17 non-home-grown, U21 exemption), UEFA Champions League registration (List A / List B), per-window budgets, squad cost ratio
- `src/engine/progression.ts` — between-window changes, fully scripted: ageing, deterministic value shifts, market evolution (players leaving for/arriving from other clubs), contract expiry (unrenewed, unsold expiring players leave free)
- `src/engine/scoring.ts` — final squad rating
- `src/data/` — typed player database: current squad plus a market pool per window, and the progression scripts
- `tests/` — vitest; mirrors `src/` structure. Engine tests use fictional fixture data, not the real player database

## Game rules being modelled

- **Budgets** are per-window; unspent funds and sale proceeds roll forward. The **squad cost ratio (SCR) rolls across windows**: wages + amortisation (fee ÷ contract years) vs `squadCostCapBase × SCR_LIMIT`. The starting squad has no per-player book values; a club-level `baselineAmortisation` (GameConfig) provides the starting position and is never reduced by sales. No amortisation re-spreading on renewal.
- **Contract renewals**: salary uplift scaled by urgency (remaining years), years added, and quality. **One renewal per player per game** (undoable within its window). Renewing also restores sale value (running-down discount by remaining months: ×0.9 at 24, ×0.75 at 18, ×0.5 at 12, ×0.25 at 6, ×0.95 at 30; January windows sit six months into the season, so 18/30/6-month rungs only arise there).
- **A loan is not a transfer** (Sam, 20/08/2026). The dataset's club column
  is always ownership; `LOANED_OUT` (`src/data/loansOut.ts`) puts the player
  at his borrowing club for the windows the loan covers, and by Summer 2027
  the loan has ended and he is back at his parent club. `locked` is computed
  from the owning club, so a player at a club that will not sell stays
  unavailable while out on loan. Loans *into* Liverpool run the same way
  from the other side (`LOANED_IN` in `lockedLists.ts`), which is where the
  model came from. Entries are verified as they are applied: an unknown
  player, a stated owner that does not match the dataset, or a borrowing
  club we do not hold is reported and skipped, never guessed.
- **Sale values are derived, never authored**: `saleValue = baseValue × contract discount`. Authored data supplies `baseValue` (see `SquadPlayerSeed`).
- **Liverpool's own players away on loan** (Sam, 02/10/2026): `LIVERPOOL_OUT_ON_LOAN` in `loansOut.ts` (Elliott at Valencia, Ndukwe at Levante, Brughmans at Genk) become `GameConfig.loanedOut`, held in `GameState.loanedOut` outside every rule, cost and score until their return window (Summer 2027), when progression moves them into the squad. While away they age and their value drifts exactly as squad players do, and they cannot be traded. Value created counts them in both starting and final worth, so a return is neutral. A player signed before the game whose fee the baseline does not cover carries `priorSigning` (Brughmans: EUR 35m, six years, amortised at EUR 7m a year under the five-year cap from his return; no funds move).
- **Loaning players out** (`rules/loan.ts`, Sam 02/10/2026): `LOAN_OUT` lends a squad player to the end of the season for 15% of his sale value, banked at once; `UNDO_LOAN_OUT` reverses it within the window. January 2027 loans return in Summer 2027; Summer 2027 and January 2028 loans return in Summer 2028, after the game, so the player is still away at the end. He joins `GameState.loanedOut`: off every list and unable to play (a compliance route with no deregistration penalty), wage off the squad cost, but an in-game loan keeps his fee amortising. Locked players, loanees and XI players cannot be lent. A contract ending while away ends there (free agent); returners come back on every list. Still away at the end: out of quality, depth and balance, but in contract health, age and value.
- **Deregistration** (`rules/deregistration.ts`, Sam 02/10/2026): `DEREGISTER` / `REREGISTER` leave a squad player off the PL list, the UCL lists or both, without selling him. He stays under contract (squad cost untouched), but each competition's rules judge only its registered players, and off the PL list he cannot play: not pickable (greyed out in the XI picker), and left out of squad quality, depth, balance, the size cap and the season projection, though still in contract health, age and value. A window that closes with him still off any list penalises him once per game: value −20%, and 10 points off value created; putting him back or selling him before the close avoids it, putting him back later refunds nothing. The game's end closes the final window.
- **Window advancement is one-way** (`ADVANCE_WINDOW`), blocked while violations exist. Progression order between windows: expiry → age tick → value drift → market swap → funds. Expiry and ageing apply only at season boundaries (`seasonStartYear` increases); value drift applies at every transition at half the annual age/quality curve rate. Market pools are authored per window; the engine filters out players already at the club (buy-backs of sold players are allowed).
- Players carry age, position, home-grown status (U21 derived from age ≤ 21) and contract data, plus UEFA training status (`uefaTraining`: club / association / none) and the start of their current spell at the club (`joined`).
- **UEFA Champions League registration** (`rules/uefa.ts`, Sam 02/10/2026) is enforced in every window alongside the PL rules, never instead of them. List A holds at most 25, always: the limit never moves (Sam). Eight of those places are reserved for locally trained players (at most four association-trained), and a reserved place no such player fills stays empty, so at most 17 List A players may be anyone else. Two checks, `UCL_LIST_A_OVER_LIMIT` (over 25) and `UCL_OPEN_PLACES_EXCEEDED` (over 17 outside the reserved places); breaking the first always breaks the second, and both are reported. List B is unlimited, for players aged ≤ 21 (the PL U21 test, deliberately shared) with two years at the club. Three goalkeepers across both lists, two on List A. Every squad player must fit one list: there is no leaving players off. The engine assigns the lists itself, because moving a List-B-eligible player to List A can only make either check worse; young keepers move up only when List A is short of two. A signing's spell starts in the window he joins, so no in-game signing reaches List B. The real opening squad is deliberately over: 26 on List A against 25, and 19 outside the reserved places against 17 (Jacquet and Leoni are U21 but short of two years; Elliott is away on loan), so January must move two players who are not locally trained. Liverpool's training and join data lives in `src/data/uefaRegistration.ts`; market players are derived (`MARKET_CLUB_TRAINED` graduates are club-trained, other home-grown players association-trained).
- **Scoring** (`scoring.ts`, weights agreed with Sam): Squad Quality 35% (0.6 XI avg quality + 0.4 best-10 depth, zero-padded), Balance 25% (coverage vs template GK 3, RB 2, LB 2, CB 4, CM 4, AM 2, RW 2, LW 2, ST 2), Age profile 15% (band scores, peak 21–28), Contract health 20% (remaining-months scores, quality-weighted), Value created 5% (final worth vs handed-over worth, ±20% spans 0–100). Weighting favours depth and contract security over the already-elite starting XI. `PICK_XI` (final window only, re-pickable) stores the XI in state so replays can rescore; formations live in `formations.ts` and gate slots by positional group (any defender fills any defensive slot, etc.).

## Project conventions

- Milestone plan M0–M6 agreed with Sam; check the todo/plan before starting new work. Scoring formula (M3), UI visual design (M4) and real player data (M6) each require a design conversation with Sam before implementation. Sam has his own idea for the frontend colour palette and design: do not choose one unilaterally.
- Values, wages and fees in the player database are game-design numbers agreed with Sam, not a live data feed. Since 03/10/2026, `quality` is the EA FC 27 overall rating (`scraper/pipeline/apply_ratings.py`; players FC 27 does not list keep their previous rating) and `true_value_m` is derived from rating and age (`scraper/pipeline/rebaseline_values.py`: EUR 250m for a prime-age player at the top rating, x1.26 per point, age factors, capped at EUR 250m), except realised summer 2026 fees, which still win. Contract length enters through the game's existing sale-value discount, not the baseline.
- Keep dependencies minimal: react, react-dom, vite, @vitejs/plugin-react, typescript, vitest. Adding anything else needs explicit approval.

# Web Scraping, Properly: A Guided Course in Eight Leagues

This tutorial teaches you to build the Capology scraper in this folder from
scratch, one league at a time. The finished code in `capology_scraper/` is
your reference solution: try each exercise before reading it.

The promise: by exercise 8 you will have written a polite, cached, tested
scraping pipeline, and along the way hit most of the things that actually
go wrong in real scraping work, ending with the industry classic: the data
you wanted is behind a paywall.

Work in `scraper/` with the venv active:

```bash
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

---

## Part 0: Ethics before requests

Before fetching anything, always look at three things:

1. **robots.txt** (`https://www.capology.com/robots.txt`). Capology's is
   contradictory: a Cloudflare-managed block allows all agents with content
   signals, then the site's own rule disallows everything except Google and
   Bing. Robots is advisory and aimed at crawlers; a one-off, user-directed
   fetch of eight public pages for personal use is a different animal. But
   the *decision* should be conscious, recorded, and yours. (Ours is
   recorded in the project history.)
2. **Volume**: how many requests does your design need? Our answer is
   eight, ever, thanks to caching. If your design needs thousands, redesign.
3. **The terms of use** and what you'll do with the data. Factual data
   (wages, ages) is not copyrightable in itself, but EU/UK database rights
   exist. Personal free project ≠ commercial republication.

Rules the code enforces (`fetch.py`): cache-forever, fixed delay between
requests, honest browser User-Agent, no login circumvention. Note what we
do NOT do: no paywall bypass; exercise 8 confronts this honestly.

## Part 1: Reconnaissance (do this before writing any code)

**Exercise 1a.** Open the Premier League salaries page in your browser.
Now open *View Source* (not DevTools Elements: raw source). Search for a
player's name you can see in the table. You'll find it inside a huge
inline script:

```js
var data = [{
  'name': "<a class='firstcol' href='/player/erling-haaland-36728/'>...",
  'annual_gross_eur': accounting.formatMoney("32012451", "€ ", 0),
  'expiration': moment("2034-06-30").format("MMM D, YYYY"),
  ...
}, ...];
```

Three professional-grade observations to make here:

1. **The whole league is in the page.** The visible table paginates at 25
   rows, but the data island has ~600 records. You never need to click
   pagination: one GET per league.
2. **It's JavaScript, not JSON.** Single-quoted keys, function calls
   wrapped around values. `json.loads` will not save you. But look at what
   the function calls *wrap*: `formatMoney("32012451", ...)` carries the
   clean integer as its first argument. The messy presentation layer
   embeds the tidy raw value.
3. **The money is already in EUR** (`_eur` variants alongside `_gbp`,
   `_usd`). Never convert what the source already provides.

**Exercise 1b.** Still in view-source, find: the player's club slug, his
contract expiration, his age, and whether he's flagged as a loanee. Write
down the exact key names; they become your regex targets.

## Part 2: Fetch politely, cache forever (Premier League)

**Exercise 2.** Write `fetch.py`: a function that returns a league page's
HTML, downloading it *at most once ever*:

- Build the cache path from a stable league key (`premier-league.html`).
- If the file exists, read it: no network.
- Otherwise `time.sleep(delay)` FIRST (so even a crashing loop can't
  hammer the site), fetch with Scrapling's `Fetcher.get(...)`, check the
  status, write the file, return the HTML.

Why sleep-before rather than sleep-after? Trace what happens when your
parser crashes mid-loop and you re-run five times in a minute.

Scrapling notes: `pip install "scrapling[fetchers]"` (the HTTP fetcher
needs the `curl_cffi` extra: you'll hit the ImportError otherwise, as we
did). `response.status` and `response.html_content` are what you need.
Scrapling's headline feature, adaptive CSS selection that survives site
redesigns, matters when you parse the DOM; our target is a script tag, so
we lean on its fetcher and parse the text ourselves.

Checkpoint: PL page cached (~2.8 MB), second run does no network I/O.

## Part 3: Parse the data island (La Liga)

**Exercise 3a.** Extract the array text. Find `var data = [` and walk the
string counting `[` and `]` until depth returns to zero. Do not regex for
`];`: player-name HTML could legally contain those characters.

**Exercise 3b.** Split into records by counting `{` and `}` the same way.
Test your splitter on this nasty-but-legal input first:

```python
"{ 'a': \"x{y}\" }, { 'b': \"z\" }"   # expect exactly 2 records
```

**Exercise 3c.** Field extraction: one compiled regex per field, each
anchored to its key name. Reference targets:

| Field | Anchor pattern sketch |
|---|---|
| name + slug | `'name': "<a ... href='/player/(SLUG)/'...>(TEXT)</a>"` |
| salary | `'annual_gross_eur': accounting.formatMoney\("(\d+)"` |
| expiry year | `'expiration': moment\("(\d{4})-\d{2}-\d{2}"\)` |
| age | `'age': Math\.round\("(\d+)"\)` |
| loan/active | `'loan': "(True\|False)"` |

Design rule: **every field extractor returns `None` on no-match**, and
only the identity fields (name, club) are mandatory. Source data is
ragged; a parser that throws on the first odd record dies at record 37
of 4,000.

Checkpoint: La Liga parses to ~520 records with names and clubs.

## Part 4: Resilience and the missing-field census (Bundesliga)

**Exercise 4.** Before filtering anything, *count* what's missing. Write a
five-line diagnostic that buckets every record by its first missing field:

```python
Counter({'kept': 467, 'no salary': 99})
```

This census is the single highest-value habit in scraping. It converts
"my row count looks low?" into "99 Bundesliga squad players have no
published salary", which is a *decision* (impute? drop? flag?) instead of
a mystery. You'll use it for real in exercise 8.

## Part 5: Normalise to your schema (Serie A)

**Exercise 5.** Write `clean.py`: map source vocabulary to *your* domain
language at the boundary, in one place.

- Positions: Capology's `position_detail` (GK, CB, LWB, DM, AM, CF, SS…)
  to the game's nine positions; coarse `position` group (G/D/M/F) as the
  fallback for unknown details. Missing both → drop the row.
- Money: integer euros to `EUR m` at 0.1 precision.
- Contract: `2034-06-30` to the game's season-end-year convention (2034).

Keep the source's fine-grained values (`position_detail`) in your output
for auditing: you will want to check `SS → ST` decisions later.

## Part 6: A CLI and a summary you can trust (Ligue 1)

**Exercise 6.** Write `__main__.py`: `python -m capology_scraper` runs all
leagues; `python -m capology_scraper ligue-1` runs one. Print a per-league
line with rows parsed, kept, on loan, missing salary, and finish with a
grouped count. A pipeline that doesn't narrate itself will lie to you
silently one day.

## Part 7: Fixtures and tests (Primeira Liga, Eredivisie)

**Exercise 7.** Scrapers rot; tests catch the rot early. Build
`tests/fixtures/salaries_snippet.html` containing THREE records inside a
real `<script>var data = [...]` skeleton:

1. A faithful copy of a real record (ours is Haaland, captured
   10/07/2026),
2. a variant with the optional fields flipped (unverified, on loan,
   release clause set, some fields missing),
3. a junk record with no name/club, which must be skipped, not crash.

Then test: exact field extraction on record 1, optional handling on
record 2, the junk skip, the brace-counting splitter, and the cleaning
rules. Never commit a full 2.8 MB page as a fixture; commit the smallest
snippet that exercises every code path.

Slug trap from this very project: Eredivisie lives under `/ne/` (not
`/nl/`), and Belgium is `first-division-a` (not `pro-league`). Never
guess slugs: extract them from the site's own navigation.

## Part 8: The paywall (Belgian Pro League)

**Exercise 8.** Run your pipeline on `first-division-a`. Census says:

```
Counter({'no salary': 467})
```

Inspect the cache: `'annual_gross_eur': "<span class='footer-pro'>Locked</span>"`.
Belgian wages are a Capology Pro feature. Your options, in decreasing
order of professional respectability:

1. **Keep the rows, null the salary, impute downstream** from data you
   legitimately have (our choice: a wage model fitted on the seven open
   leagues, flagged as estimates).
2. Drop the league.
3. ~~Bypass the paywall.~~ No. Not for a game, not for anything.

The general lesson: the boundary of "free" data is itself information.
Design your schema so missingness is representable (`float | None`), and
your pipeline so it reports rather than hides it.

---

## Where this leaves you

You now have: recon before code, politeness by construction, cache-first
design, brace-counting extraction from JS data islands, None-tolerant
field extractors, a missing-data census habit, boundary normalisation,
a narrating CLI, fixture-based tests, and a paywall policy.

The reference implementation of all of it is ~400 lines in
`capology_scraper/`. Diff yours against it, and be suspicious wherever
yours is shorter.

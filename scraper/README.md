# Data Scraper

One-off snapshot of first-team salary and contract data for eight European
leagues, from Capology, feeding the game's player database. See
[TUTORIAL.md](TUTORIAL.md) for the guided learning version of this code.

## Usage

```bash
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python -m capology_scraper                  # all eight leagues
python -m pipeline.compare                  # match to Transfermarkt
python -m pipeline.free_agents              # contractless 25/26 pool
python -m pipeline.enrich                   # quality, values, wages, HG
python -m pipeline.apply_review             # Sam's review.csv is master
python -m pytest tests/ -q                  # tests

python -m transfers_scraper                 # confirmed transfers, summer 2026
python -m pipeline.loans                    # confirmed loans, per club
python -m pipeline.reconcile                # sweep vs review.csv, writes a report
python -m pipeline.profiles                 # age/position for thin transfer rows
python -m pipeline.apply_reconciliation     # writes the reviewed decisions in
```

CAUTION: `pipeline.reconcile` overwrites `output/reconciliation_2026.csv`,
which is the file Sam edits. Do not re-run it once a review is under way.

## Checking the master against real transfers

`transfers_scraper` sweeps footballtransfers.com's confirmed-transfer
feed for a date window (currently 01/06/2026 to 01/09/2026) into
`output/transfers_summer_2026.csv`.

`pipeline.loans` then sweeps loans into `output/loans_summer_2026.csv`.
Loans need their own stage because the confirmed feed carries permanent
moves only; they are read from each modelled club's own transfer history,
one request per club, with club ids harvested from the cached confirmed
sweep. Loans matter even though the game does not model them: a loaned
player spends the season in his host club's squad, so Ronald Araujo
belongs in Liverpool's 26/27 squad, not Barcelona's.

`pipeline.reconcile` compares both sweeps against `review.csv` and writes
`output/reconciliation_2026.md` (to read) and
`output/reconciliation_2026.csv` (to work through), listing players whose
club has gone stale, loans in and out, arrivals missing from the master,
free agents who have signed, and departures out of our leagues. Rows are
marked `ok` or `needs check`: the latter are where the master's club
disagrees with the club the player moved from, meaning either it was
already stale or the name matched the wrong player.

Reconcile is read-only: it never edits `review.csv`. Applying anything it
finds is a separate, reviewed pass: Sam marks up the CSV (setting an
action to "No change", or writing "incorrect classification" in the
confidence column for mistaken identity), then `pipeline.apply_reconciliation`
writes those decisions into `review.csv`. That stage is safe to run twice.

New signings need attributes the transfer feed does not carry, which are
imputed there from FC 26 ratings and fits over the existing master, and
flagged through `quality_source`, `salary_estimated` and `hg_basis`.
Signings whose age or position the feed omits are held back rather than
invented, since both drive scoring. `pipeline.profiles` tries to recover
those two fields from player profile pages, but most such players have no
player record on the site at all (an unknown slug returns the player
index with HTTP 200 rather than a 404), so its yield is near zero.
`pipeline.wikipedia` recovers rather more, from the per-country transfer
lists and the players' own articles, and doubles as corroboration.

**Status of the summer 2026 hold-backs (Sam, 13/08/2026): the remaining
38 stay out of the dataset.** Wikipedia confirms the transfers are real,
but 24 of the 26 it cannot find are free transfers of youth and squad
players it does not record either, and six went to Portuguese clubs,
where no list exists. They are listed in
`output/held_back_additions.csv` if the decision is ever revisited.

Note that the feed's endpoint is disallowed by the site's robots.txt, as
is every other data-bearing endpoint there (the visible pages render
client-side and carry no data). Sam authorised the sweep on 13/08/2026 as
a one-off; it is rate-limited and cached permanently, so a re-run costs no
requests. Widening it needs asking him again.

## Editing the dataset

`scraper/review.csv` is THE hand-edited, version-controlled master.
Dataset fixes (values, home-grown flags, positions) belong there, or in
`pipeline/corrections.py` for moves and additions that need provenance.

Editing `review.csv` alone changes nothing in the game: the edit must be
propagated. From the repo root, one command does it:

```bash
npm run data:rebuild   # apply_review (review.csv -> final) then generate:data
```

That rebuilds `src/data/generated/gameData.json`, which the game reads.
(Re-running the scraper/enrich stages is only needed to pull fresh source
data; day-to-day edits just need `data:rebuild`.)

Fetches are rate-limited and cached forever in `cache/` (gitignored);
output lands in `output/players_capology.csv` (gitignored; the final game
dataset is generated into `src/data/` by a later pipeline stage).

## Snapshot status (13/07/2026)

The eight top leagues plus the three clubs relegated from the Premier
League in 2025/26 (West Ham, Wolves, Burnley), lifted out of the
Championship by a club allowlist. Belgian Pro League salaries are
paywalled at source and null in the CSV; they are imputed by the
downstream value model.

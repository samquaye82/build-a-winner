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
```

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

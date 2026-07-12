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

Then `npm run generate:data` at the repo root rebuilds the game dataset.
`scraper/review.csv` is the hand-edited, version-controlled master: the
apply_review stage rebuilds from it, so dataset fixes belong there (or in
`pipeline/corrections.py` for moves/additions with provenance).

Fetches are rate-limited and cached forever in `cache/` (gitignored);
output lands in `output/players_capology.csv` (gitignored; the final game
dataset is generated into `src/data/` by a later pipeline stage).

## Snapshot status (11/07/2026)

4,216 players. Belgian Pro League salaries are paywalled at source and
null in the CSV; they are imputed by the downstream value model.

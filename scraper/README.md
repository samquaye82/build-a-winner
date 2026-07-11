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
python -m capology_scraper premier-league   # one league
python -m pytest tests/ -q                  # tests
```

Fetches are rate-limited and cached forever in `cache/` (gitignored);
output lands in `output/players_capology.csv` (gitignored; the final game
dataset is generated into `src/data/` by a later pipeline stage).

## Snapshot status (11/07/2026)

4,216 players. Belgian Pro League salaries are paywalled at source and
null in the CSV; they are imputed by the downstream value model.

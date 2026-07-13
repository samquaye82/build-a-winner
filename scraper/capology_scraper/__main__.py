"""Command-line entry point: scrape all leagues and write one CSV.

Usage (from the scraper/ directory, venv active):

    python -m capology_scraper                  # all eight leagues
    python -m capology_scraper premier-league   # one league only

Fetches are cached forever in cache/; delete a league's HTML file to force
a refetch (please don't unless the snapshot must move).
"""

import sys
from pathlib import Path

import pandas as pd

from .clean import clean_players, to_dicts
from .fetch import fetch_league_html
from .leagues import LEAGUES
from .parse import parse_players

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"


def main(argv: list[str]) -> int:
    """Runs the pipeline for the requested leagues.

    Args:
        argv: Optional league keys; empty means all leagues.

    Returns:
        Process exit code.
    """
    keys = set(argv)
    leagues = [l for l in LEAGUES if not keys or l.key in keys]
    if not leagues:
        known = ", ".join(l.key for l in LEAGUES)
        print(f"No matching leagues. Known: {known}", file=sys.stderr)
        return 1

    frames: list[pd.DataFrame] = []
    for league in leagues:
        html = fetch_league_html(CACHE_DIR, league)
        raw = parse_players(html)
        clean = clean_players(raw, league.key)
        if league.club_allowlist is not None:
            # Take only the allowlisted clubs (e.g. the relegated three).
            clean = [p for p in clean if p.club_slug in league.club_allowlist]
        frames.append(pd.DataFrame(to_dicts(clean)))
        missing_salary = sum(1 for p in clean if p.salary_eur_m is None)
        print(
            f"{league.name}: {len(raw)} rows parsed, {len(clean)} kept "
            f"({sum(1 for p in clean if p.loan)} on loan, "
            f"{missing_salary} without salary)"
        )

    combined = pd.concat(frames, ignore_index=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "players_capology.csv"
    combined.to_csv(out_path, index=False)
    print(f"\nWrote {len(combined)} players to {out_path}")
    print(combined.groupby('league').size().to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

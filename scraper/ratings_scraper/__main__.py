"""Command-line entry point: every EA FC 27 rating to one CSV.

Usage (from the scraper/ directory, venv active):

    python -m ratings_scraper

Pages the ratings listing until a page comes back empty or the published
total is reached. Pages are cached forever in cache/ratings/fc27/; delete
that directory to force a refetch (please don't unless the ratings must
move). Writes cache/ratings/ea_fc27_players.csv, men's and women's
players alike; the join keeps men's football only.
"""

import math
import sys
from dataclasses import asdict
from pathlib import Path

import pandas as pd

from .fetch import fetch_page
from .parse import parse_items

RATINGS_DIR = Path(__file__).resolve().parent.parent / "cache" / "ratings"
CACHE_DIR = RATINGS_DIR / "fc27"
OUTPUT_CSV = RATINGS_DIR / "ea_fc27_players.csv"

#: Hard ceiling on pages, so a paging bug cannot become an unbounded crawl.
#: 19,789 players at 100 a page is 198 pages.
MAX_PAGES = 250


def main() -> int:
    """Fetches every page and writes the combined CSV.

    Returns:
        Process exit status: 0 on success, 1 if nothing was fetched.
    """
    players = []
    pages = MAX_PAGES
    for page in range(1, MAX_PAGES + 1):
        if page > pages:
            break
        payload = fetch_page(CACHE_DIR, page)
        items = payload.get("items") or []
        if not items:
            break
        # The first page says how many players there are; stop once the
        # pages that total needs have all been read.
        total = int(payload.get("totalItems") or 0)
        if page == 1 and total:
            pages = min(MAX_PAGES, math.ceil(total / len(items)))
        players.extend(parse_items(items))
        if page % 20 == 0 or page == pages:
            print(f"  page {page:>3}/{pages}: {len(players):>6} players")

    if not players:
        print("No ratings fetched", file=sys.stderr)
        return 1

    frame = pd.DataFrame([asdict(p) for p in players]).drop_duplicates("ea_id")
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUTPUT_CSV, index=False)
    mens = (frame.gender == "Men's Football").sum()
    print(f"Wrote {len(frame)} players ({mens} men's) to {OUTPUT_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

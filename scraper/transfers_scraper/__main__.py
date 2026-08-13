"""Command-line entry point: sweep the summer 2026 window to one CSV.

Usage (from the scraper/ directory, venv active):

    python -m transfers_scraper

Pages the confirmed-transfer feed newest-first across both plausible
seasons and keeps everything dated inside the window. Responses are
cached forever in cache/transfers/; delete that directory to force a
refetch (please don't unless the snapshot must move).
"""

import sys
from dataclasses import asdict
from datetime import date
from pathlib import Path

import pandas as pd

from .fetch import SEASON_2025_26, SEASON_2026_27, fetch_page
from .parse import Transfer, parse_records

CACHE_DIR = Path(__file__).resolve().parent.parent / "cache" / "transfers"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"

#: The window Sam asked for: 01/06/2026 to 01/09/2026, both inclusive.
WINDOW_START = date(2026, 6, 1)
WINDOW_END = date(2026, 9, 1)

#: Seasons to sweep. A June 2026 move can be filed under the season just
#: ending, so both are paged and the date filter decides.
SEASONS = (SEASON_2026_27, SEASON_2025_26)

#: Hard ceiling on pages per season, so a paging bug cannot turn into an
#: unbounded crawl of a 273,000-record archive.
MAX_PAGES = 60


def sweep_season(season: str) -> list[Transfer]:
    """Pages one season newest-first, collecting in-window transfers.

    The feed carries future-dated pre-agreed moves (records dated a year
    out), so each record is filtered on its own date rather than assuming
    the first in-window page begins the range. Paging stops once a page's
    oldest record predates the window, since ordering is descending.

    Args:
        season: The season identifier to page.

    Returns:
        Every in-window transfer found in that season.
    """
    collected: list[Transfer] = []
    for page in range(1, MAX_PAGES + 1):
        payload = fetch_page(CACHE_DIR, season, page)
        records = payload.get("records") or []
        if not records:
            break

        parsed = parse_records(records)
        collected.extend(
            t for t in parsed if WINDOW_START <= t.transfer_date <= WINDOW_END
        )

        oldest = min((t.transfer_date for t in parsed), default=None)
        print(
            f"  season {season} page {page:>2}: {len(records):>3} records, "
            f"{len(collected):>4} in window (oldest {oldest})"
        )
        if oldest is not None and oldest < WINDOW_START:
            break
        if page >= int(payload.get("pages") or 0):
            break
    return collected


def main() -> int:
    """Runs the sweep and writes the window's transfers to CSV.

    Returns:
        Process exit code.
    """
    all_transfers: list[Transfer] = []
    for season in SEASONS:
        print(f"Sweeping season {season}...")
        all_transfers.extend(sweep_season(season))

    frame = pd.DataFrame([asdict(t) for t in all_transfers])
    if frame.empty:
        print("No transfers found in window.", file=sys.stderr)
        return 1

    # The two season sweeps overlap around the season boundary, so the
    # same move can arrive twice; the source's own id pair is the key.
    before = len(frame)
    frame = frame.drop_duplicates(
        subset=["player_slug", "club_to", "transfer_date"]
    ).sort_values("transfer_date", ascending=False)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "transfers_summer_2026.csv"
    frame.to_csv(out_path, index=False)

    print(f"\nWrote {len(frame)} transfers to {out_path}")
    print(f"({before - len(frame)} cross-season duplicates dropped)")
    print(f"Loans: {int(frame.is_loan.sum())}, frees: {int(frame.is_free.sum())}")
    print(f"Dates: {frame.transfer_date.min()} to {frame.transfer_date.max()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

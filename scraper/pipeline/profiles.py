"""Filling age and position for signings the transfer feed left blank.

The feed publishes lower-profile transfers as little more than a name and
two clubs. Where the site holds a real player record, its profile page
supplies the missing age, position and contract expiry; where it does
not, nothing can be recovered and the player stays out of the master
rather than being invented.

Player slugs are harvested from the already-cached club histories, so no
search endpoint is involved.

Usage (from scraper/, venv active):

    python -m pipeline.profiles
"""

import gzip
import json
from pathlib import Path

import pandas as pd

from transfers_scraper.profiles import fetch_profile, is_player_index, parse_profile

from .apply_reconciliation import build_new_players, load_decisions, source_attributes
from .reconcile import REVIEW_CSV

ROOT = Path(__file__).resolve().parent.parent
CLUB_CACHE = ROOT / "cache" / "clubs"
PROFILE_CACHE = ROOT / "cache" / "profiles"
OUT_CSV = ROOT / "output" / "profile_attributes.csv"


def slugs_by_name() -> dict[str, str]:
    """Harvests player slugs from the cached club histories.

    Returns:
        Player name -> the site's slug, for every player that has one.
    """
    slugs: dict[str, str] = {}
    for path in sorted(CLUB_CACHE.glob("*.json.gz")):
        with gzip.open(path, "rt", encoding="utf-8") as cached:
            payload = json.load(cached)
        for side in ("incoming_records", "outgoing_records"):
            for record in payload.get(side) or []:
                name, slug = record.get("player_name"), record.get("player_slug")
                if name and slug and name not in slugs:
                    slugs[str(name)] = str(slug)
    return slugs


def main() -> int:
    """Fetches profiles for the held-back signings and writes what it finds.

    Returns:
        Process exit code.
    """
    master = pd.read_csv(REVIEW_CSV)
    _, skipped = build_new_players(load_decisions(), master, source_attributes())
    if skipped.empty:
        print("Nothing held back; no profiles needed.")
        return 0

    slugs = slugs_by_name()
    resolvable = {
        name: slugs[name] for name in sorted(set(skipped.player)) if name in slugs
    }
    print(
        f"{len(skipped)} players held back; "
        f"{len(resolvable)} have a player record to read, "
        f"{len(set(skipped.player)) - len(resolvable)} have none on the site."
    )

    rows: list[dict[str, object]] = []
    for name, slug in resolvable.items():
        html = fetch_profile(PROFILE_CACHE, slug)
        if html is None:
            print(f"  {name}: no page (404)")
            continue
        if is_player_index(html):
            print(f"  {name}: slug does not exist (served the player index)")
            continue
        attributes = parse_profile(html)
        if not attributes:
            print(f"  {name}: page carried nothing usable")
            continue
        rows.append({"player_name": name, **attributes})
        print(f"  {name}: {attributes}")

    if not rows:
        print("\nNo attributes recovered.")
        return 1

    frame = pd.DataFrame(rows)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUT_CSV, index=False)
    print(f"\nWrote {len(frame)} players to {OUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

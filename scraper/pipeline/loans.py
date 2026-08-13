"""Sweeping confirmed loans for the modelled clubs.

Loans matter to the player database even though the game does not model
loan deals: a player on loan plays for his host club next season, so the
squad lists have to show him there rather than at his parent club. Ronald
Araujo is Barcelona's player but spends 2026/27 at Liverpool, and it is
Liverpool's squad he belongs in.

The confirmed-transfer feed carries permanent moves only, so loans have
to be read from each club's own transfer history endpoint. That means one
request per modelled club, which is why club identifiers are harvested
from the already-cached confirmed sweep rather than fetched.

Usage (from scraper/, venv active):

    python -m pipeline.loans
"""

import json
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

import pandas as pd

from transfers_scraper.fetch import fetch_club_transfers
from transfers_scraper.parse import Transfer, parse_record

from .matching import normalise_club
from .reconcile import REVIEW_CSV, club_keys, resolve_club

ROOT = Path(__file__).resolve().parent.parent
FEED_CACHE = ROOT / "cache" / "transfers"
CLUB_CACHE = ROOT / "cache" / "clubs"
OUT_CSV = ROOT / "output" / "loans_summer_2026.csv"

#: The window, matching the confirmed sweep.
WINDOW_START = date(2026, 6, 1)
WINDOW_END = date(2026, 9, 1)

#: The feed's type id for a loan. Verified against the club endpoint,
#: where loan records also carry the literal amount "Loan".
LOAN_TYPE_ID = "3"


@dataclass(frozen=True)
class ClubRef:
    """A modelled club and its identifier on the source site.

    Attributes:
        master_key: The normalised club key used by the player master.
        team_id: The site's numeric club identifier.
        name: The club's name as the feed publishes it, for logging.
    """

    master_key: str
    team_id: str
    name: str


def build_club_index(master: pd.DataFrame) -> dict[str, ClubRef]:
    """Harvests site club ids for the master's clubs from cached feed data.

    Every confirmed-transfer record names both clubs and gives their ids,
    so the already-downloaded sweep is a free club directory. Clubs that
    saw no transfer in the window are simply absent, and are reported by
    the caller rather than fetched blind.

    Args:
        master: The player master.

    Returns:
        Master club key -> the club's reference.
    """
    master_keys = {normalise_club(str(club)) for club in master.club.unique()}
    leagues_by_key: dict[str, set[str]] = defaultdict(set)
    for club, league in zip(master.club, master.league):
        leagues_by_key[normalise_club(str(club))].add(str(league))

    index: dict[str, ClubRef] = {}
    for path in sorted(FEED_CACHE.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for record in payload.get("records") or []:
            for side in ("to", "from"):
                name = record.get(f"club_{side}_name")
                slug = record.get(f"club_{side}_slug")
                team_id = record.get(f"club_{side}_id")
                if not name or not slug or not team_id:
                    continue
                key = resolve_club(
                    club_keys(str(name), str(record.get(f"club_{side}_short_name") or "")),
                    master_keys,
                    slug.split("/", 1)[0],
                    leagues_by_key,
                )
                if key and key not in index:
                    index[key] = ClubRef(key, str(team_id), str(name))
    return index


def loans_for_club(club: ClubRef) -> list[Transfer]:
    """Fetches one club's in-window loans, both directions.

    The endpoint returns the club's entire history, so the window filter
    does the real work here.

    Args:
        club: The club to fetch.

    Returns:
        Every in-window loan involving that club.
    """
    payload = fetch_club_transfers(CLUB_CACHE, club.team_id)
    loans: list[Transfer] = []
    for side in ("incoming_records", "outgoing_records"):
        for record in payload.get(side) or []:
            if str(record.get("type_id")) != LOAN_TYPE_ID:
                continue
            transfer = parse_record(record)
            if transfer is None:
                continue
            if WINDOW_START <= transfer.transfer_date <= WINDOW_END:
                loans.append(transfer)
    return loans


def main() -> int:
    """Sweeps loans for every modelled club and writes them to CSV.

    Returns:
        Process exit code.
    """
    master = pd.read_csv(REVIEW_CSV)
    index = build_club_index(master)
    master_keys = {normalise_club(str(club)) for club in master.club.unique()}
    missing = sorted(master_keys - set(index) - {"free agent"})
    print(f"{len(index)} clubs with ids; no id for: {missing or 'none'}")

    collected: list[Transfer] = []
    for position, club in enumerate(sorted(index.values(), key=lambda c: c.name), 1):
        loans = loans_for_club(club)
        collected.extend(loans)
        if loans:
            print(f"  [{position:>3}/{len(index)}] {club.name}: {len(loans)} loans")

    frame = pd.DataFrame([asdict(loan) for loan in collected])
    if frame.empty:
        print("No loans found in window.")
        return 1

    # A loan between two modelled clubs is returned by both, so the same
    # deal arrives twice.
    before = len(frame)
    frame = frame.drop_duplicates(
        subset=["player_slug", "club_to", "transfer_date"]
    ).sort_values("transfer_date", ascending=False)

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUT_CSV, index=False)
    print(f"\nWrote {len(frame)} loans to {OUT_CSV}")
    print(f"({before - len(frame)} duplicates dropped, seen from both clubs)")
    print(f"Dates: {frame.transfer_date.min()} to {frame.transfer_date.max()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

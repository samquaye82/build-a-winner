"""Hand-authored updates to the master, applied after a reconciliation.

Two jobs, both written into `review.csv`:

1. Loanees are listed at the club that OWNS them, not the club they are
   playing for. The reconciliation originally moved them to the host
   club, which reads correctly for 2026/27 but leaves them stranded when
   the loan ends: Ronald Araujo left Liverpool's squad in Summer 2027 and
   existed nowhere, because the dataset had him as a Liverpool player and
   no market row remained. Listing him at Barcelona instead means the
   squad borrows him for the season (see LOANED_IN in lockedLists.ts) and
   the existing market machinery hands him back afterwards, with no
   engine involvement at all.

   Loanees whose parent club sits outside the nine modelled leagues stay
   at their host club: their owner is not in the dataset, so there is
   nowhere to send them.

2. Real-world news since the 13/08/2026 sweep, as UPDATES below. Each
   entry records what changed and why, in the manner of corrections.py.

Usage (from scraper/, venv active):

    python -m pipeline.apply_updates --dry-run
    python -m pipeline.apply_updates
"""

import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import pandas as pd

from .matching import normalise_club
from .reconcile import (
    LOANS_CSV,
    OUT_CSV as DECISIONS_CSV,
    REVIEW_CSV,
    _code,
    club_keys,
    resolve_club,
)

ROOT = Path(__file__).resolve().parent.parent

#: Field updates by (name, club), so a namesake at another club is never
#: caught by accident. Each entry says what changed and when.
UPDATES: list[dict[str, Any]] = [
    # Sam, 13/08/2026: real-world business since the sweep.
    {
        "name": "Bradley Barcola",
        "club": "PSG",
        "reason": "value re-rated (Sam, 13/08/2026)",
        "set": {"true_value_m": 120.0},
    },
    {
        "name": "Ibrahim Mbaye",
        "club": "PSG",
        "reason": "value re-rated (Sam, 13/08/2026)",
        "set": {"true_value_m": 50.0},
    },
    {
        # New deal to 2032 on EUR 600,962/wk. The engine holds salaries
        # annually and the UI derives the weekly figure from them.
        "name": "Vinicius Junior",
        "club": "Real Madrid",
        "reason": "new contract to 2032 (Sam, 13/08/2026)",
        "set": {"expiry_year": 2032, "salary_eur_m": 31.3},
    },
    {
        "name": "Freddie Woodman",
        "club": "Liverpool",
        "reason": "new contract to 2029, same terms (Sam, 13/08/2026)",
        "set": {"expiry_year": 2029},
    },
    {
        # New deal to 2031 on EUR 327,839/wk.
        "name": "Dominik Szoboszlai",
        "club": "Liverpool",
        "reason": "new contract to 2031, and reclassified CM (Sam, 13/08/2026)",
        "set": {"expiry_year": 2031, "salary_eur_m": 17.1, "position": "CM"},
    },
    {
        "name": "Djed Spence",
        "club": "Tottenham",
        "reason": "transferred to Inter Milan (Sam, 13/08/2026)",
        "set": {"club": "Inter Milan", "league": "serie-a", "true_value_m": 35.0},
    },
]


def loan_parents(master: pd.DataFrame) -> dict[str, tuple[str, str]]:
    """Works out where each loanee's parent club is, when we model it.

    Args:
        master: The player master, used for the modelled-club vocabulary.

    Returns:
        Player name -> (parent club name, league), for loanees whose owner
        is a club the game models.
    """
    decisions = pd.read_csv(DECISIONS_CSV).fillna("")
    loans = pd.read_csv(LOANS_CSV).drop_duplicates("player_name").set_index(
        "player_name"
    )

    master_keys = {normalise_club(str(club)) for club in master.club.unique()}
    leagues_by_key: dict[str, set[str]] = defaultdict(set)
    names_by_key: dict[str, str] = {}
    for club, league in zip(master.club, master.league):
        key = normalise_club(str(club))
        leagues_by_key[key].add(str(league))
        names_by_key[key] = str(club)

    applied = decisions[
        (decisions.category == "loan_in")
        & (decisions.action != "No change")
        & (decisions.confidence != "incorrect classification")
    ]

    parents: dict[str, tuple[str, str]] = {}
    for _, row in applied.iterrows():
        if row.player not in loans.index:
            continue
        loan = loans.loc[row.player]
        key = resolve_club(
            club_keys(str(loan.club_from), str(loan.club_from_short)),
            master_keys,
            _code(loan.league_from),
            leagues_by_key,
        )
        if key is None:
            continue  # Owner outside our leagues: leave him at the host.
        league = sorted(leagues_by_key[key])[0]
        parents[str(row.player)] = (names_by_key[key], league)
    return parents


def apply_updates(master: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, int]]:
    """Applies the loanee rule and the hand-authored updates.

    Args:
        master: The player master.

    Returns:
        A pair of (updated master, counts by effect).

    Raises:
        ValueError: If a hand-authored update names nobody, which means
            the entry has gone stale and would otherwise pass silently.
    """
    result = master.copy()
    counts = {"loanees_returned": 0, "updated": 0}

    for name, (club, league) in loan_parents(master).items():
        mask = result["name"] == name
        if not mask.any():
            continue
        result.loc[mask, "club"] = club
        result.loc[mask, "league"] = league
        counts["loanees_returned"] += int(mask.sum())

    for update in UPDATES:
        by_name = result["name"] == update["name"]
        # The club disambiguates namesakes, but an update that MOVES a
        # player has already changed it once applied. Accept either the
        # club he came from or the one he is going to, so the stage can
        # be re-run without tripping over its own work.
        clubs = {update["club"], update["set"].get("club", update["club"])}
        mask = by_name & result["club"].isin(clubs)
        if not mask.any():
            raise ValueError(
                f"Update target not found: {update['name']} at {update['club']}"
            )
        for field, value in update["set"].items():
            result.loc[mask, field] = value
        counts["updated"] += int(mask.sum())

    return result, counts


def main(argv: list[str]) -> int:
    """Applies the updates to review.csv.

    Args:
        argv: Command-line arguments; ``--dry-run`` reports without
            writing.

    Returns:
        Process exit code.
    """
    master = pd.read_csv(REVIEW_CSV)
    updated, counts = apply_updates(master)

    print(f"Loanees moved to their parent club: {counts['loanees_returned']}")
    print(f"Hand-authored updates applied:      {counts['updated']}")

    # Compare with blanks filled, or every row carrying a NaN counts as
    # changed (NaN never equals NaN) and the report is meaningless.
    differs = updated.fillna("~").ne(master.fillna("~")).any(axis=1)
    print(f"Rows changed: {int(differs.sum())} of {len(master)}")

    if "--dry-run" in argv:
        print("\nDry run: review.csv not written.")
        return 0

    updated.to_csv(REVIEW_CSV, index=False)
    print(f"\nWrote {REVIEW_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

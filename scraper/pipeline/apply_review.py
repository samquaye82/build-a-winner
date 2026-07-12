"""Sam's reviewed dataset becomes the master: rebuild from review.csv.

The review file (scraper/review.csv, version-controlled, hand-edited) is
authoritative: rows Sam deleted stay deleted, players he moved (club
changes, releases to free agency) stay moved, and his valuations win even
where the model disagrees. This stage:

1. Re-attaches internal ids (player_slug) by matching review rows back to
   the enriched table: by name+club, then by unique name (which follows
   players Sam moved between clubs), else a synthesised slug.
2. Normalises hand-edited fields: 'Free agent' club rows join the
   free-agent league; spreadsheet booleans (TRUE/False) are parsed;
   numerics are coerced with a report of anything unparseable.
3. Applies ADDITIONS from corrections.py (players missing from every
   source, e.g. Victor Munoz's July 2026 move to Liverpool).

Output: output/final_players.csv, the generator's input.

Usage (from scraper/, venv active):

    python -m pipeline.apply_review
"""

import re
from pathlib import Path

import pandas as pd

from .corrections import ADDITIONS

ROOT = Path(__file__).resolve().parent.parent
REVIEW_CSV = ROOT / "review.csv"
ENRICHED_CSV = ROOT / "output" / "enriched_players.csv"
FINAL_CSV = ROOT / "output" / "final_players.csv"

#: Numeric columns coerced (and reported) on ingest.
_NUMERIC = ["age", "quality", "true_value_m", "salary_eur_m", "expiry_year"]


def slugify(name: str) -> str:
    """Synthesises a stable slug for rows with no enriched match."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + "-review"


def parse_bool(value: object) -> bool:
    """Parses spreadsheet booleans (True/TRUE/true/1)."""
    return str(value).strip().lower() in {"true", "1", "yes"}


def attach_ids(review: pd.DataFrame, enriched: pd.DataFrame) -> pd.DataFrame:
    """Re-attaches player_slug and club_slug to reviewed rows.

    Args:
        review: The hand-edited table.
        enriched: The machine table carrying slugs.

    Returns:
        review with player_slug and club_slug columns.
    """
    by_name_club = enriched.set_index(["name", "club"])
    name_counts = enriched.name.value_counts()
    by_unique_name = enriched[
        enriched.name.map(name_counts) == 1
    ].set_index("name")

    slugs: list[str] = []
    club_slugs: list[str] = []
    synthesised = 0
    for row in review.itertuples():
        key = (row.name, row.club)
        if key in by_name_club.index:
            hit = by_name_club.loc[key]
            hit = hit.iloc[0] if isinstance(hit, pd.DataFrame) else hit
            slugs.append(str(hit.player_slug))
            club_slugs.append(str(hit.club_slug))
        elif row.name in by_unique_name.index:
            # Sam moved this player: keep his identity, adopt the new club.
            hit = by_unique_name.loc[row.name]
            slugs.append(str(hit.player_slug))
            club_slugs.append(slugify(str(row.club)).removesuffix("-review"))
            synthesised += 0
        else:
            slugs.append(slugify(str(row.name)))
            club_slugs.append(slugify(str(row.club)).removesuffix("-review"))
            synthesised += 1

    result = review.copy()
    result["player_slug"] = slugs
    result["club_slug"] = club_slugs
    if synthesised > 0:
        print(f"NOTE: {synthesised} review rows had no enriched match; slugs synthesised")
    return result


def normalise(review: pd.DataFrame) -> pd.DataFrame:
    """Normalises hand-edited fields (see module docstring).

    Args:
        review: The reviewed table with ids attached.

    Returns:
        The normalised table.
    """
    result = review.copy()

    # Free-agency moves: club 'Free agent' implies the free-agent league.
    frees = result.club.str.strip().str.lower() == "free agent"
    result.loc[frees, "league"] = "free-agent"
    result.loc[frees, "club"] = "Free agent"
    result.loc[frees, "club_slug"] = "free-agent"
    result.loc[frees, "expiry_year"] = 2026

    result["homegrown"] = result.homegrown.map(parse_bool)

    for column in _NUMERIC:
        before = result[column].notna().sum()
        result[column] = pd.to_numeric(result[column], errors="coerce")
        lost = before - result[column].notna().sum()
        if lost > 0:
            print(f"WARNING: {lost} unparseable values in {column}")
    return result


def main() -> int:
    """Rebuilds the final dataset from the reviewed file."""
    review = pd.read_csv(REVIEW_CSV)
    enriched = pd.read_csv(ENRICHED_CSV)

    final = normalise(attach_ids(review, enriched))

    additions = pd.DataFrame(ADDITIONS)
    if not additions.empty:
        final = pd.concat([final, additions], ignore_index=True)
        for name in additions.name:
            print(f"Added: {name}")

    dropped = len(enriched) - len(review)
    final.to_csv(FINAL_CSV, index=False)
    print(
        f"Final dataset: {len(final)} players "
        f"({dropped} net removed in review, {len(additions)} added)"
    )
    print(f"Wrote {FINAL_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Writing EA FC 27 overall ratings into the player master.

The master (``review.csv``) is authoritative and hand-curated, so ratings
cannot simply be re-joined upstream as the FC 26 ones were: like
``pipeline.apply_snapshot``, this stage writes into the master directly,
for exactly two fields, ``quality`` and ``quality_source``. Players FC 27
does not list keep the quality they have, and its source says where it
came from (Sam, 02/10/2026).

The master carries no dates of birth, so they are taken from
``output/final_players.csv`` (the generator's input, built from this same
master), matched row for row on name and club. Matching onto FC 27 then
runs in layers, strictest first, as ``pipeline.ratings`` does for FC 26:

1. Date of birth and surname.
2. Date of birth and any shared name token.
3. A full name unique on both sides, with ages no more than a year apart
   (the guard that stopped a namesake inheriting Mohamed Salah's rating).

Only men's football is considered. Read-only unless ``--write`` is
passed: the default run reports what would change and touches nothing.

Usage (from scraper/, venv active):

    python -m pipeline.apply_ratings
    python -m pipeline.apply_ratings --write
"""

import argparse
import sys
from datetime import date
from pathlib import Path

import pandas as pd

from .matching import normalise_name, surname_key

ROOT = Path(__file__).resolve().parent.parent
REVIEW_CSV = ROOT / "review.csv"
FINAL_CSV = ROOT / "output" / "final_players.csv"
RATINGS_CSV = ROOT / "cache" / "ratings" / "ea_fc27_players.csv"

#: The source label written for every rating this stage applies.
SOURCE = "fc27"

#: EA's FC 27 database date, the moment its ages are measured at.
RATINGS_AS_OF = date(2026, 9, 10)

#: EA's label for the men's game.
MENS_FOOTBALL = "Men's Football"


def age_at(birthdate: str, when: date) -> int | None:
    """A player's age in whole years on a given day.

    Args:
        birthdate: ISO date, e.g. "1998-12-20".
        when: The day to measure at.

    Returns:
        The age, or None when the date is missing or malformed.
    """
    try:
        year, month, day = (int(part) for part in str(birthdate)[:10].split("-"))
        born = date(year, month, day)
    except ValueError:
        return None
    return when.year - born.year - ((when.month, when.day) < (born.month, born.day))


def load_fc27(path: Path = RATINGS_CSV) -> pd.DataFrame:
    """Loads the men's FC 27 ratings with the keys the join needs.

    Args:
        path: The ratings CSV written by ``python -m ratings_scraper``.

    Returns:
        One row per men's player: rating, birthdate, age and name keys.
    """
    ratings = pd.read_csv(path, dtype={"birthdate": str}, keep_default_na=False)
    ratings = ratings[ratings.gender == MENS_FOOTBALL].copy()
    full = (ratings.first_name + " " + ratings.last_name).str.strip()
    # A common name ("Rodri", "Alisson") is how he is known; prefer it.
    display = ratings.common_name.where(ratings.common_name != "", full)
    ratings["name_key"] = display.map(normalise_name)
    ratings["alt_name_key"] = full.map(normalise_name)
    ratings["surname"] = display.map(surname_key)
    ratings["alt_surname"] = full.map(surname_key)
    ratings["age"] = ratings.birthdate.map(lambda b: age_at(b, RATINGS_AS_OF))
    return ratings


def match_ratings(players: pd.DataFrame, ratings: pd.DataFrame) -> pd.DataFrame:
    """Finds each player's FC 27 rating.

    Args:
        players: Master rows with name, age and date_of_birth columns.
        ratings: Output of load_fc27().

    Returns:
        A frame indexed like `players` with ``fc27_rating`` and ``layer``
        for every matched row; unmatched rows are absent.
    """
    found: dict[int, tuple[int, str]] = {}
    by_dob = {dob: group for dob, group in ratings.groupby("birthdate") if dob}

    for index, row in players.iterrows():
        group = by_dob.get(str(row.date_of_birth)[:10])
        if group is None:
            continue
        surname = surname_key(row["name"])
        hits = group[(group.surname == surname) | (group.alt_surname == surname)]
        if len(hits) == 1:
            found[index] = (int(hits.iloc[0].overall), "dob-surname")
            continue
        tokens = set(normalise_name(row["name"]).split(" "))
        overlap = group[
            group.name_key.map(lambda key: bool(tokens & set(key.split(" "))))
            | group.alt_name_key.map(lambda key: bool(tokens & set(key.split(" "))))
        ]
        if len(overlap) == 1:
            found[index] = (int(overlap.iloc[0].overall), "dob-token")

    counts = ratings.name_key.value_counts()
    unique = ratings[ratings.name_key.map(counts) == 1].set_index("name_key")
    master_counts = players["name"].map(normalise_name).value_counts()
    for index, row in players.iterrows():
        key = normalise_name(row["name"])
        if index in found or key not in unique.index or master_counts[key] != 1:
            continue
        hit = unique.loc[key]
        if hit.age is not None and abs(int(hit.age) - int(row.age)) <= 1:
            found[index] = (int(hit.overall), "name-unique")

    return pd.DataFrame.from_dict(
        found, orient="index", columns=["fc27_rating", "layer"]
    )


def with_birthdates(master: pd.DataFrame, final: pd.DataFrame) -> pd.DataFrame:
    """Attaches dates of birth to master rows, by name and club.

    Args:
        master: The review master.
        final: final_players.csv, which carries date_of_birth.

    Returns:
        The master with a date_of_birth column (empty where unknown).
    """
    births = final.drop_duplicates(["name", "club"]).set_index(["name", "club"])
    keys = list(zip(master["name"], master["club"]))
    result = master.copy()
    result["date_of_birth"] = [
        births.date_of_birth.get(key, "") if key in births.index else "" for key in keys
    ]
    result["date_of_birth"] = result.date_of_birth.fillna("")
    return result


def main() -> int:
    """Reports, and with --write applies, FC 27 ratings to the master.

    Returns:
        Process exit status.
    """
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--write", action="store_true", help="write review.csv")
    args = parser.parse_args()

    # Read the master byte-faithfully: it is CRLF and hand-edited.
    master = pd.read_csv(REVIEW_CSV, keep_default_na=False, dtype=str)
    master["age"] = master.age.astype(int)
    final = pd.read_csv(FINAL_CSV, keep_default_na=False, dtype=str)
    matched = match_ratings(with_birthdates(master, final), load_fc27())

    old = pd.to_numeric(master.loc[matched.index, "quality"], errors="coerce")
    change = matched.fc27_rating - old
    print(f"Matched {len(matched)}/{len(master)} ({len(matched) / len(master):.1%})")
    print(matched.layer.value_counts().to_string())
    print(f"Rating change: mean {change.mean():+.2f}, "
          f"up {int((change > 0).sum())}, down {int((change < 0).sum())}, "
          f"same {int((change == 0).sum())}")
    unmatched = master.drop(index=matched.index)
    print("Unmatched by current quality source:")
    print(unmatched.quality_source.value_counts().to_string())

    if not args.write:
        print("Read-only run: pass --write to update review.csv")
        return 0
    master.loc[matched.index, "quality"] = matched.fc27_rating.astype(str)
    master.loc[matched.index, "quality_source"] = SOURCE
    master.to_csv(REVIEW_CSV, index=False, lineterminator="\r\n")
    print(f"Wrote {len(matched)} ratings to {REVIEW_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

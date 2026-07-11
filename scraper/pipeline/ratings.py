"""Joining EA FC 26 overall ratings onto the matched player table.

The ratings dataset carries full birthdates, which TM also has, so the
primary join is DOB + surname: far stronger than name matching alone.
Layers, strictest first:

1. DOB + surname
2. DOB + any name-token overlap (catches surname spelling variants)
3. Globally unique full-name match (for rows whose DOB differs between
   sources, which happens)

Quality for unmatched players is imputed later by the value model, not
here.
"""

from pathlib import Path

import pandas as pd

from .matching import normalise_name, surname_key

RATINGS_DIR = Path(__file__).resolve().parent.parent / "cache" / "ratings"


def load_ratings() -> pd.DataFrame:
    """Loads and normalises the FC 26 ratings (outfield + goalkeepers).

    Returns:
        One row per FC 26 player: rating, name keys and birthdate.
    """
    frames = []
    for filename in ("ea_fc26_outfield.csv", "ea_fc26_goalkeepers.csv"):
        path = RATINGS_DIR / filename
        if path.exists():
            frames.append(pd.read_csv(path))
    ratings = pd.concat(frames, ignore_index=True)

    full_name = (
        ratings["firstName"].fillna("") + " " + ratings["lastName"].fillna("")
    ).str.strip()
    # commonName ("Rodri", "Alisson") beats first+last when present.
    display = ratings["commonName"].fillna(full_name)

    ratings["name_key"] = display.map(normalise_name)
    ratings["alt_name_key"] = full_name.map(normalise_name)
    ratings["surname"] = display.map(surname_key)
    ratings["alt_surname"] = full_name.map(surname_key)
    ratings["birthdate"] = ratings["birthdate"].str[:10]
    ratings = ratings.rename(columns={"overallRating": "fc26_rating"})
    return ratings[
        ["fc26_rating", "name_key", "alt_name_key", "surname", "alt_surname",
         "birthdate", "team", "leagueName"]
    ]


def join_ratings(players: pd.DataFrame, ratings: pd.DataFrame) -> pd.DataFrame:
    """Attaches fc26_rating to the matched player table.

    Args:
        players: The matched table (needs date_of_birth, name, tm_name).
        ratings: Output of load_ratings().

    Returns:
        players with fc26_rating and rating_join_layer columns.
    """
    result = players.copy()
    result["dob"] = result["date_of_birth"].astype(str).str[:10]
    result["cap_name_key"] = result["name"].map(normalise_name)
    result["cap_surname"] = result["name"].map(surname_key)

    rating_by_index: dict[int, tuple[float, str]] = {}

    # Layer 1: DOB + surname (either surname form).
    by_dob = ratings.groupby("birthdate")
    for index, row in result.iterrows():
        if row.dob not in by_dob.groups:
            continue
        group = by_dob.get_group(row.dob)
        hits = group[
            (group.surname == row.cap_surname)
            | (group.alt_surname == row.cap_surname)
        ]
        if len(hits) == 1:
            rating_by_index[index] = (float(hits.iloc[0].fc26_rating), "dob-surname")

    # Layer 2: DOB + any token overlap between the two names.
    for index, row in result.iterrows():
        if index in rating_by_index or row.dob not in by_dob.groups:
            continue
        tokens = set(row.cap_name_key.split(" "))
        group = by_dob.get_group(row.dob)
        hits = [
            candidate
            for candidate in group.itertuples()
            if tokens & set(candidate.name_key.split(" "))
            or tokens & set(candidate.alt_name_key.split(" "))
        ]
        if len(hits) == 1:
            rating_by_index[index] = (float(hits[0].fc26_rating), "dob-token")

    # Layer 3: globally unique full-name match.
    name_counts = ratings.name_key.value_counts()
    unique_names = ratings[ratings.name_key.map(name_counts) == 1].set_index(
        "name_key"
    )
    for index, row in result.iterrows():
        if index in rating_by_index:
            continue
        if row.cap_name_key in unique_names.index:
            hit = unique_names.loc[row.cap_name_key]
            rating_by_index[index] = (float(hit.fc26_rating), "name-unique")

    result["fc26_rating"] = pd.Series(
        {i: r for i, (r, _) in rating_by_index.items()}
    )
    result["rating_join_layer"] = pd.Series(
        {i: layer for i, (_, layer) in rating_by_index.items()}
    )
    return result.drop(columns=["dob", "cap_name_key", "cap_surname"])

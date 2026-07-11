"""Source comparison: Capology snapshot vs Transfermarkt dataset.

Runs the layered match (see matching.py), writes the joined table to
output/matched_players.csv, and prints the comparison report that decides
which source is primary for each field.

Usage (from scraper/, venv active):

    python -m pipeline.compare
"""

from collections import Counter
from pathlib import Path

import pandas as pd

from .matching import (
    age_on_reference_date,
    ages_compatible,
    normalise_club,
    normalise_name,
    surname_key,
)

ROOT = Path(__file__).resolve().parent.parent
CAPOLOGY_CSV = ROOT / "output" / "players_capology.csv"
KAGGLE_DIR = ROOT / "cache" / "kaggle"
OUT_CSV = ROOT / "output" / "matched_players.csv"

#: TM domestic competition ids for the game's eight leagues.
TM_COMPETITIONS = ("GB1", "ES1", "L1", "IT1", "FR1", "PO1", "NL1", "BE1")


def load_tm_players() -> pd.DataFrame:
    """Loads recently active TM players as match candidates.

    Deliberately NOT filtered to the eight leagues: newly promoted clubs
    (e.g. a 2026/27 Premier League newcomer) are still filed under their
    old division in TM, and winter transfers can lag either source. The
    club-anchored match layers provide the precision instead.

    Returns:
        One row per recently active player, with normalised name/club keys
        and window-referenced age.
    """
    players = pd.read_csv(KAGGLE_DIR / "players.csv")
    current = players[
        (players.last_season >= 2024) & players.current_club_name.notna()
    ].copy()
    current["name_key"] = current["name"].map(normalise_name)
    current["club_key"] = current["current_club_name"].map(normalise_club)
    current["surname"] = current["name"].map(surname_key)
    current["tm_age"] = current["date_of_birth"].map(
        lambda d: age_on_reference_date(d) if isinstance(d, str) else None
    )
    current["tm_expiry_year"] = current["contract_expiration_date"].map(
        lambda d: int(d[:4]) if isinstance(d, str) else None
    )
    return current


def load_capology() -> pd.DataFrame:
    """Loads the Capology snapshot with normalised keys.

    Returns:
        The scraped rows plus name/club/surname matching keys.
    """
    cap = pd.read_csv(CAPOLOGY_CSV)
    cap["name_key"] = cap["name"].map(normalise_name)
    cap["club_key"] = cap["club"].map(normalise_club)
    cap["surname"] = cap["name"].map(surname_key)
    return cap


def match(cap: pd.DataFrame, tm: pd.DataFrame) -> pd.DataFrame:
    """Runs the three-layer match.

    Args:
        cap: Capology rows with matching keys.
        tm: TM rows with matching keys.

    Returns:
        cap with tm_player_id, match_layer and TM columns joined on.
    """
    tm_by_name = tm.groupby("name_key")
    unique_names = tm_by_name.filter(lambda g: len(g) == 1).set_index("name_key")

    matches: dict[int, tuple[int, str]] = {}  # cap index -> (tm id, layer)

    # Layer 1: globally unique full-name matches with compatible ages.
    for index, row in cap.iterrows():
        if row.name_key in unique_names.index:
            candidate = unique_names.loc[row.name_key]
            if ages_compatible(row.age, candidate.tm_age):
                matches[index] = (int(candidate.player_id), "name-unique")

    # Bootstrap the club mapping from layer-1 co-occurrence.
    club_pairs = Counter(
        (cap.loc[i, "club_key"], tm.loc[tm.player_id == pid, "club_key"].iloc[0])
        for i, (pid, _) in matches.items()
    )
    club_map: dict[str, str] = {}
    for (cap_club, tm_club), _count in club_pairs.most_common():
        club_map.setdefault(cap_club, tm_club)

    # Layer 2: full name + mapped club (for names TM holds more than once).
    tm_by_name_club = tm.set_index(["name_key", "club_key"])
    for index, row in cap.iterrows():
        if index in matches:
            continue
        tm_club = club_map.get(row.club_key)
        key = (row.name_key, tm_club)
        if tm_club is not None and key in tm_by_name_club.index:
            found = tm_by_name_club.loc[key]
            found = found.iloc[0] if isinstance(found, pd.DataFrame) else found
            if ages_compatible(row.age, found.tm_age):
                matches[index] = (int(found.player_id), "name-club")

    # Layer 3: surname + mapped club + age tolerance.
    tm_by_surname_club = tm.groupby(["surname", "club_key"])
    for index, row in cap.iterrows():
        if index in matches:
            continue
        tm_club = club_map.get(row.club_key)
        key = (row.surname, tm_club)
        if tm_club is None or key not in tm_by_surname_club.groups:
            continue
        group = tm_by_surname_club.get_group(key)
        compatible = group[[ages_compatible(row.age, a) for a in group.tm_age]]
        if len(compatible) == 1:
            matches[index] = (int(compatible.iloc[0].player_id), "surname-club")

    # Layer 4: name-token subset within the mapped club. Catches the two
    # sources using long and short forms of the same player ("Stefan
    # Ortega Moreno" vs "Stefan Ortega", "Gabriel Magalhaes" vs "Gabriel")
    # and Brazilian mononyms, safely anchored to one club plus age.
    tm_by_club = tm.groupby("club_key")
    for index, row in cap.iterrows():
        if index in matches:
            continue
        tm_club = club_map.get(row.club_key)
        if tm_club is None or tm_club not in tm_by_club.groups:
            continue
        cap_tokens = set(row.name_key.split(" "))
        group = tm_by_club.get_group(tm_club)
        candidates = [
            candidate
            for candidate in group.itertuples()
            if ages_compatible(row.age, candidate.tm_age)
            and (
                cap_tokens <= set(candidate.name_key.split(" "))
                or set(candidate.name_key.split(" ")) <= cap_tokens
            )
        ]
        if len(candidates) == 1:
            matches[index] = (int(candidates[0].player_id), "token-subset")

    layer = pd.Series(
        {i: layer for i, (_, layer) in matches.items()}, name="match_layer"
    )
    tm_id = pd.Series(
        {i: pid for i, (pid, _) in matches.items()}, name="tm_player_id"
    )
    joined = cap.join(tm_id).join(layer)
    tm_cols = tm.set_index("player_id")[
        [
            "name", "date_of_birth", "country_of_citizenship", "sub_position",
            "market_value_in_eur", "highest_market_value_in_eur",
            "tm_expiry_year", "tm_age", "current_club_name",
        ]
    ].rename(columns={"name": "tm_name"})
    return joined.merge(
        tm_cols, how="left", left_on="tm_player_id", right_index=True
    )


def report(joined: pd.DataFrame) -> None:
    """Prints the source-comparison report.

    Args:
        joined: The matched table from match().
    """
    total = len(joined)
    matched = joined.tm_player_id.notna().sum()
    print(f"Matched {matched}/{total} ({matched / total:.1%})")
    print("\nBy layer:")
    print(joined.match_layer.value_counts(dropna=False).to_string())
    print("\nMatch rate by league:")
    by_league = joined.groupby("league").apply(
        lambda g: g.tm_player_id.notna().mean(), include_groups=False
    )
    print(by_league.map("{:.1%}".format).to_string())

    both_expiry = joined.dropna(subset=["tm_player_id", "tm_expiry_year"])
    agree = (both_expiry.expiry_year == both_expiry.tm_expiry_year).mean()
    print(f"\nContract expiry agreement (Capology vs TM): {agree:.1%}")

    has_value = joined.market_value_in_eur.notna().sum()
    print(f"TM market value present for {has_value}/{total}")

    unmatched = joined[joined.tm_player_id.isna()]
    print("\nSample unmatched (first 12):")
    print(
        unmatched[["name", "club", "league", "age"]].head(12).to_string(index=False)
    )


def main() -> int:
    """Runs the comparison and writes the joined table."""
    cap = load_capology()
    tm = load_tm_players()
    print(f"Capology rows: {len(cap)} | TM candidate rows: {len(tm)}\n")
    joined = match(cap, tm)
    joined.to_csv(OUT_CSV, index=False)
    report(joined)
    print(f"\nWrote {OUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Tests for matching FC 27 ratings onto the master (pipeline.apply_ratings)."""

from datetime import date

import pandas as pd

from pipeline.apply_ratings import age_at, match_ratings, with_birthdates
from pipeline.matching import normalise_name, surname_key


def _ratings(rows: list[tuple[str, str, str, int]]) -> pd.DataFrame:
    """Builds a load_fc27()-shaped frame from (display name, full name, dob, overall)."""
    frame = pd.DataFrame(rows, columns=["display", "full", "birthdate", "overall"])
    frame["name_key"] = frame.display.map(normalise_name)
    frame["alt_name_key"] = frame.full.map(normalise_name)
    frame["surname"] = frame.display.map(surname_key)
    frame["alt_surname"] = frame.full.map(surname_key)
    frame["age"] = frame.birthdate.map(lambda b: age_at(b, date(2026, 9, 10)))
    return frame


def test_age_at_counts_whole_years_to_the_day() -> None:
    assert age_at("1998-12-20", date(2026, 9, 10)) == 27
    assert age_at("1998-09-10", date(2026, 9, 10)) == 28
    assert age_at("", date(2026, 9, 10)) is None


def test_matches_on_birthdate_and_surname_first() -> None:
    players = pd.DataFrame({"name": ["Kylian Mbappé"], "age": [27], "date_of_birth": ["1998-12-20"]})
    ratings = _ratings([("Kylian Mbappé", "Kylian Mbappé", "1998-12-20", 91)])
    result = match_ratings(players, ratings)
    assert result.loc[0, "fc27_rating"] == 91
    assert result.loc[0, "layer"] == "dob-surname"


def test_matches_a_common_name_on_a_shared_token() -> None:
    # Known as "Rodri"; the master spells out "Rodrigo Hernández".
    players = pd.DataFrame({"name": ["Rodrigo Hernández"], "age": [30], "date_of_birth": ["1996-06-22"]})
    ratings = _ratings([("Rodri", "Rodrigo Hernández Cascante", "1996-06-22", 87)])
    result = match_ratings(players, ratings)
    assert result.loc[0, "layer"] == "dob-token"


def test_name_only_match_needs_ages_within_a_year() -> None:
    # A namesake a decade older must not lend his rating.
    players = pd.DataFrame(
        {"name": ["Mohamed Salah", "Ali Ahmed"], "age": [22, 25], "date_of_birth": ["", ""]}
    )
    ratings = _ratings(
        [
            ("Mohamed Salah", "Mohamed Salah", "1992-06-15", 89),
            ("Ali Ahmed", "Ali Ahmed", "2001-05-01", 70),
        ]
    )
    result = match_ratings(players, ratings)
    assert 0 not in result.index
    assert result.loc[1, "layer"] == "name-unique"


def test_leaves_an_unknown_player_unmatched() -> None:
    players = pd.DataFrame({"name": ["Nobody Known"], "age": [20], "date_of_birth": ["2006-01-01"]})
    ratings = _ratings([("Someone Else", "Someone Else", "2005-01-01", 60)])
    assert match_ratings(players, ratings).empty


def test_with_birthdates_joins_on_name_and_club() -> None:
    master = pd.DataFrame({"name": ["Same Name", "Same Name"], "club": ["A", "B"]})
    final = pd.DataFrame(
        {"name": ["Same Name", "Same Name"], "club": ["A", "B"], "date_of_birth": ["2000-01-01", "2001-02-02"]}
    )
    assert with_birthdates(master, final).date_of_birth.tolist() == ["2000-01-01", "2001-02-02"]

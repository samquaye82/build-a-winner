"""Tests for rebuilding the final dataset from Sam's reviewed file.

The slug is the engine's player id, so a slug shared by two different
players means buying one and getting the other. That is what these tests
guard.
"""

import pandas as pd

from pipeline.apply_review import apply_birth_dates, attach_ids, decollide_slugs


def _rows(pairs: list[tuple[str, str, str]]) -> pd.DataFrame:
    """Builds a table of (name, player_slug, club_slug) rows.

    Args:
        pairs: One tuple per row.

    Returns:
        A frame with the columns decollide_slugs reads.
    """
    return pd.DataFrame(
        [
            {"name": name, "player_slug": slug, "club_slug": club}
            for name, slug, club in pairs
        ]
    )


def test_unique_slugs_are_left_alone() -> None:
    """Nothing changes when every slug is already unique."""
    rows = _rows(
        [
            ("Florian Wirtz", "florian-wirtz-37744", "liverpool"),
            ("Alexander Isak", "alexander-isak-36424", "liverpool"),
        ]
    )

    assert list(decollide_slugs(rows).player_slug) == list(rows.player_slug)


def test_a_shared_slug_is_suffixed_with_the_club() -> None:
    """Two players on one Capology slug get separate ids.

    The live case: a 24-year-old Manchester City midfielder and a
    28-year-old Juventus winger both called Nicolás González.
    """
    rows = _rows(
        [
            ("Nicolás González", "nicolas-gonzalez-35891", "manchester-city"),
            ("Nicolás González", "nicolas-gonzalez-35891", "juventus"),
        ]
    )

    result = decollide_slugs(rows)

    assert list(result.player_slug) == [
        "nicolas-gonzalez-35891",
        "nicolas-gonzalez-35891-juventus",
    ]


def test_the_first_row_keeps_the_original_slug() -> None:
    """Existing ids stay stable, so only the later row is renamed."""
    rows = _rows(
        [
            ("Shared Name", "shared-1", "arsenal"),
            ("Shared Name", "shared-1", "chelsea"),
            ("Shared Name", "shared-1", "everton"),
        ]
    )

    result = decollide_slugs(rows)

    assert result.player_slug.iloc[0] == "shared-1"
    assert result.player_slug.is_unique


def _enriched() -> pd.DataFrame:
    """Builds a machine table carrying slugs and dates of birth.

    Returns:
        The columns attach_ids reads.
    """
    return pd.DataFrame(
        [
            {
                "name": "Bukayo Saka",
                "club": "Arsenal",
                "player_slug": "bukayo-saka-36123",
                "club_slug": "arsenal",
                "date_of_birth": "2001-09-05 00:00:00",
            },
            {
                "name": "Moved Player",
                "club": "Chelsea",
                "player_slug": "moved-player-11111",
                "club_slug": "chelsea",
                "date_of_birth": "1999-01-31 00:00:00",
            },
            {
                "name": "Dateless Player",
                "club": "Arsenal",
                "player_slug": "dateless-player-22222",
                "club_slug": "arsenal",
                "date_of_birth": "",
            },
        ]
    )


def test_date_of_birth_rides_along_with_the_slug() -> None:
    """Exact ages can only come from enrichment, so it must survive."""
    review = pd.DataFrame([{"name": "Bukayo Saka", "club": "Arsenal"}])

    result = attach_ids(review, _enriched())

    assert result.date_of_birth.iloc[0] == "2001-09-05"


def test_a_player_moved_by_hand_keeps_his_date_of_birth() -> None:
    """Sam moves players between clubs, which breaks the name+club match.

    The unique-name fallback that keeps his id must keep his date of birth
    too, or every transfer would quietly lose one.
    """
    review = pd.DataFrame([{"name": "Moved Player", "club": "Arsenal"}])

    result = attach_ids(review, _enriched())

    assert result.player_slug.iloc[0] == "moved-player-11111"
    assert result.date_of_birth.iloc[0] == "1999-01-31"


def test_a_row_with_no_enriched_match_has_no_date_of_birth() -> None:
    """Hand-added players have no source for one; the chart falls back."""
    review = pd.DataFrame([{"name": "Brand New", "club": "Arsenal"}])

    result = attach_ids(review, _enriched())

    assert result.date_of_birth.iloc[0] == ""


def test_an_empty_source_date_stays_empty() -> None:
    """An enriched row without a date must not become a bogus one."""
    review = pd.DataFrame([{"name": "Dateless Player", "club": "Arsenal"}])

    result = attach_ids(review, _enriched())

    assert result.date_of_birth.iloc[0] == ""


def test_accented_and_unaccented_spellings_are_the_same_player() -> None:
    """Sam types 'Martin Dúbravka'; Capology stores 'Martin Dubravka'.

    Unmatched, he lost his id and his date of birth, and slipped past the
    league union's duplicate check to appear at two clubs at once.
    """
    review = pd.DataFrame([{"name": "Martin Dúbravka", "club": "Tottenham"}])
    enriched = pd.DataFrame(
        [
            {
                "name": "Martin Dubravka",
                "club": "Burnley",
                "player_slug": "martin-dubravka-32523",
                "club_slug": "burnley",
                "date_of_birth": "1989-01-15 00:00:00",
            }
        ]
    )

    result = attach_ids(review, enriched)

    assert result.player_slug.iloc[0] == "martin-dubravka-32523"
    assert result.date_of_birth.iloc[0] == "1989-01-15"


def test_two_players_differing_only_by_accent_are_not_merged() -> None:
    """Folding accents must not join players it cannot tell apart."""
    review = pd.DataFrame([{"name": "Jose Silva", "club": "Porto"}])
    enriched = pd.DataFrame(
        [
            {
                "name": "José Silva",
                "club": "Benfica",
                "player_slug": "jose-silva-1",
                "club_slug": "benfica",
                "date_of_birth": "1998-01-01 00:00:00",
            },
            {
                "name": "Jose Silvá",
                "club": "Braga",
                "player_slug": "jose-silva-2",
                "club_slug": "braga",
                "date_of_birth": "1999-01-01 00:00:00",
            },
        ]
    )

    result = attach_ids(review, enriched)

    assert result.player_slug.iloc[0].endswith("-review")
    assert result.date_of_birth.iloc[0] == ""


def test_hand_entered_dates_are_applied() -> None:
    """A date found by hand overrides whatever the sources had."""
    final = pd.DataFrame(
        [
            {"player_slug": "denner-39503", "date_of_birth": ""},
            {"player_slug": "someone-else", "date_of_birth": "1990-01-01"},
        ]
    )

    result, applied, unknown = apply_birth_dates(final)

    assert applied >= 1
    assert unknown == [] or all(isinstance(u, str) for u in unknown)
    assert result.loc[
        result.player_slug == "denner-39503", "date_of_birth"
    ].iloc[0] == "2008-02-25"


def test_a_hand_entered_date_for_an_unknown_player_is_reported() -> None:
    """A correction that matches nothing is dead, and must say so."""
    final = pd.DataFrame([{"player_slug": "nobody-at-all", "date_of_birth": ""}])

    _, applied, unknown = apply_birth_dates(final)

    assert applied == 0
    assert len(unknown) > 0

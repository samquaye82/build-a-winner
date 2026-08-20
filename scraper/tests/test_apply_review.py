"""Tests for rebuilding the final dataset from Sam's reviewed file.

The slug is the engine's player id, so a slug shared by two different
players means buying one and getting the other. That is what these tests
guard.
"""

import pandas as pd

from pipeline.apply_review import decollide_slugs


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

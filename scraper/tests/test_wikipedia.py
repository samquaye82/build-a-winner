"""Tests for reading player attributes out of Wikipedia articles."""

from datetime import date

from pipeline.wikipedia import (
    age_at_window,
    mentions_club,
    parse_birth_date,
    parse_position,
)

ARTICLE = """
{{Infobox football biography
| name = Kauã Prates
| full_name = Kauã Prates de Almeida
| birth_date = {{Birth date and age|2008|8|12|df=y}}
| birth_place = [[Brazil]]
| height = 1.83 m
| position = [[Left-back]]
| currentclub = [[Borussia Dortmund]]
}}
He joined [[Borussia Dortmund]] from [[Cruzeiro EC|Cruzeiro]] in 2026.
"""


def test_parse_birth_date_reads_the_infobox():
    assert parse_birth_date(ARTICLE) == date(2008, 8, 12)


def test_parse_birth_date_handles_the_df_first_form():
    # Some articles put the df=y flag before the date parts.
    article = ARTICLE.replace(
        "{{Birth date and age|2008|8|12|df=y}}",
        "{{birth date and age|df=y|1991|03|15}}",
    )
    assert parse_birth_date(article) == date(1991, 3, 15)


def test_parse_birth_date_returns_none_without_an_infobox_date():
    assert parse_birth_date("no infobox here") is None


def test_parse_position_maps_wiki_wording_onto_game_positions():
    assert parse_position(ARTICLE) == "LB"
    assert parse_position(ARTICLE.replace("Left-back", "Goalkeeper")) == "GK"
    assert parse_position(ARTICLE.replace("Left-back", "Centre-back")) == "CB"
    assert parse_position(ARTICLE.replace("Left-back", "Attacking midfielder")) == "AM"
    assert parse_position(ARTICLE.replace("Left-back", "Right winger")) == "RW"


def test_parse_position_takes_the_primary_of_several():
    article = ARTICLE.replace("[[Left-back]]", "[[Left-back]], [[Centre-back]]")
    assert parse_position(article) == "LB"


def test_parse_position_refuses_wording_too_vague_to_place():
    # "Winger" spans LW and RW, "Forward" spans three game positions, and
    # a wrong guess skews the balance score. Better to recover nothing.
    for vague in ("Winger", "Forward", "Midfielder", "Defender"):
        assert parse_position(ARTICLE.replace("Left-back", vague)) is None


def test_parse_position_reads_a_piped_link():
    article = ARTICLE.replace(
        "[[Left-back]]", "[[Winger (association football)|Right winger]]"
    )
    assert parse_position(article) == "RW"


def test_age_at_window_counts_to_the_window_reference_date():
    # The reference date is 01/07/2026, so a birthday later in July has
    # not happened yet.
    assert age_at_window(date(2006, 1, 15)) == 20
    assert age_at_window(date(2006, 8, 4)) == 19


def test_mentions_club_confirms_the_article_is_the_right_player():
    assert mentions_club(ARTICLE, "Borussia Dortmund") is True
    # The check that caught two namesakes: same name, different career.
    assert mentions_club(ARTICLE, "Levante") is False

"""Tests for the embedded-array parser and the cleaning stage.

The fixture reproduces the real structure of Capology's inline script:
one genuine record shape (Haaland, as captured 10/07/2026), one variant
exercising empty/missing fields, and one junk record to prove non-player
rows are skipped.
"""

from pathlib import Path

import pytest

from capology_scraper.clean import clean_players, eur_to_millions, map_position
from capology_scraper.parse import parse_players, split_records

FIXTURE = Path(__file__).parent / "fixtures" / "salaries_snippet.html"


@pytest.fixture(name="players")
def players_fixture():
    """Parses the fixture page once per test."""
    return parse_players(FIXTURE.read_text(encoding="utf-8"))


def test_parses_all_player_records(players):
    """Both real player records parse; the junk record is dropped."""
    assert [p.name for p in players] == ["Erling Haaland", "Testy McTestface"]


def test_parses_the_haaland_record_exactly(players):
    """Every field of the reference record survives extraction."""
    haaland = players[0]
    assert haaland.player_slug == "erling-haaland-36728"
    assert haaland.club == "Manchester City"
    assert haaland.club_slug == "manchester-city"
    assert haaland.country == "Norway"
    assert haaland.position_group == "F"
    assert haaland.position_detail == "CF"
    assert haaland.age == 25
    assert haaland.annual_gross_eur == 32012451
    assert haaland.expiry_year == 2034
    assert haaland.signed_date == "2025-01-17"
    assert haaland.release_eur is None
    assert haaland.active is True
    assert haaland.loan is False
    assert haaland.verified is True


def test_handles_missing_optional_fields(players):
    """The variant record: unverified loanee with a release clause."""
    testy = players[1]
    assert testy.release_eur == 50000000
    assert testy.loan is True
    assert testy.verified is False


def test_split_records_by_brace_counting():
    """Splitting survives braces inside embedded attribute strings."""
    text = "{ 'a': \"x{y}\" }, { 'b': \"z\" }"
    assert len(split_records(text)) == 2


class TestClean:
    """Cleaning-stage behaviour."""

    def test_maps_positions_to_the_game_vocabulary(self):
        assert map_position("F", "CF") == "ST"
        assert map_position("M", "DM") == "CM"
        assert map_position("D", "RWB") == "RB"
        # Unknown detail falls back to the coarse group.
        assert map_position("D", "??") == "CB"
        assert map_position("", "") is None

    def test_converts_eur_to_millions(self):
        assert eur_to_millions(32012451) == 32.0
        assert eur_to_millions(750000) == 0.8

    def test_keeps_loanees_and_flags_them(self, players):
        clean = clean_players(players, "premier-league")
        assert [p.loan for p in clean] == [False, True]
        assert clean[0].salary_eur_m == 32.0
        assert clean[0].position == "ST"
        assert clean[0].league == "premier-league"

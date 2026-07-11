"""Tests for the pure matching helpers."""

from pipeline.matching import (
    age_on_reference_date,
    ages_compatible,
    normalise_club,
    normalise_name,
    surname_key,
)


def test_normalise_name_strips_accents_and_case():
    assert normalise_name("Hugo Ekitiké") == "hugo ekitike"
    assert normalise_name("Kostas  Tsimikas ") == "kostas tsimikas"
    assert normalise_name("N'Golo Kanté") == "n golo kante"


def test_normalise_club_drops_legal_noise():
    assert normalise_club("Club Brugge KV") == "club brugge"
    assert normalise_club("club-brugges") == "club brugges"
    assert normalise_club("Manchester City") == "manchester city"
    assert normalise_club("1899 Hoffenheim") == "hoffenheim"


def test_normalise_club_keeps_short_names_whole():
    assert normalise_club("PSV") == "psv"
    assert normalise_club("AZ") == "az"


def test_surname_key_handles_mononyms():
    assert surname_key("Alisson") == "alisson"
    assert surname_key("Virgil van Dijk") == "dijk"


def test_age_on_reference_date():
    # Born 21/07/2000: still 25 on 01/07/2026.
    assert age_on_reference_date("2000-07-21") == 25
    # Born 30/06/2000: 26 by the reference date.
    assert age_on_reference_date("2000-06-30") == 26
    assert age_on_reference_date("not-a-date") is None


def test_ages_compatible_tolerates_one_year():
    assert ages_compatible(25, 26) is True
    assert ages_compatible(25, 23) is False
    assert ages_compatible(None, 30) is True

"""Tests for parsing EA's ratings pages (ratings_scraper.parse)."""

import json

import pytest

from ratings_scraper.parse import iso_birthdate, page_payload, parse_items


def _page(items: list[dict], total: int = 2) -> str:
    """Builds a minimal page carrying items the way ea.com embeds them."""
    data = {"props": {"pageProps": {"ratingDetails": {"items": items, "totalItems": total}}}}
    return (
        "<html><body><script id=\"__NEXT_DATA__\" type=\"application/json\">"
        f"{json.dumps(data)}</script></body></html>"
    )


MBAPPE = {
    "id": 231747,
    "rank": 1,
    "overallRating": 91,
    "firstName": "Kylian",
    "lastName": "Mbappé",
    "commonName": None,
    "birthdate": "12/20/1998 0:00",
    "position": {"id": "25", "shortLabel": "ST", "label": "Striker"},
    "team": {"id": 243, "label": "Real Madrid"},
    "leagueName": "LALIGA EA SPORTS",
    "gender": {"id": 0, "label": "Men's Football"},
}


def test_page_payload_reads_the_embedded_ratings() -> None:
    payload = page_payload(_page([MBAPPE], total=19789))
    assert payload["totalItems"] == 19789
    assert payload["items"][0]["id"] == 231747


def test_page_payload_fails_loudly_on_a_changed_page() -> None:
    with pytest.raises(ValueError, match="No __NEXT_DATA__"):
        page_payload("<html></html>")
    with pytest.raises(ValueError, match="No ratingDetails"):
        page_payload(
            '<script id="__NEXT_DATA__" type="application/json">{"props": {}}</script>'
        )


def test_iso_birthdate_converts_us_order_dates() -> None:
    assert iso_birthdate("12/20/1998 0:00") == "1998-12-20"
    assert iso_birthdate("3/4/2005 0:00") == "2005-03-04"
    assert iso_birthdate("") == ""


def test_iso_birthdate_rejects_an_impossible_date() -> None:
    with pytest.raises(ValueError):
        iso_birthdate("13/40/2001 0:00")


def test_parse_items_reads_every_field() -> None:
    [player] = parse_items([MBAPPE])
    assert player.ea_id == 231747
    assert player.overall == 91
    assert player.last_name == "Mbappé"
    assert player.common_name == ""
    assert player.birthdate == "1998-12-20"
    assert player.position == "ST"
    assert player.team == "Real Madrid"
    assert player.league == "LALIGA EA SPORTS"
    assert player.gender == "Men's Football"


def test_parse_items_tolerates_missing_optional_fields() -> None:
    sparse = {"id": 1, "overallRating": 60, "birthdate": None, "team": None}
    [player] = parse_items([sparse])
    assert player.birthdate == ""
    assert player.team == ""
    assert player.position == ""

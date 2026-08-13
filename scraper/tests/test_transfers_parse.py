"""Tests for parsing the confirmed-transfer feed's JSON records."""

from datetime import date

from transfers_scraper.parse import (
    parse_date,
    parse_fee,
    parse_position,
    parse_record,
    parse_records,
)


def _record(**overrides: object) -> dict[str, object]:
    """Builds a feed record, shaped like the real thing.

    Args:
        **overrides: Fields to replace on the baseline record.

    Returns:
        A record ready for parsing.
    """
    record: dict[str, object] = {
        "player_name": "Charlie Cresswell",
        "player_slug": "charlie-cresswell-1",
        "age": "24",
        "country_name": "England",
        "p1_name": "defender-center",
        "p1_group_id": "2",
        "position_name": "Defender (Center)",
        "club_from_name": "FC Toulouse",
        "club_to_name": "Stade Rennais FC",
        "club_from_short_name": "Toulouse",
        "club_to_short_name": "Rennes",
        "club_from_slug": "fr/toulouse",
        "club_to_slug": "fr/rennes",
        "amount": "€22.5M",
        "free": "0",
        "type_id": "1",
        "date_transfer": "2026-07-01T00:00:00Z",
    }
    record.update(overrides)
    return record


def test_parse_fee_reads_millions_and_thousands():
    assert parse_fee("€22.5M", "0") == 22.5
    assert parse_fee("€50K", "0") == 0.05
    assert parse_fee("€40M", "0") == 40.0


def test_parse_fee_treats_a_free_as_zero_not_missing():
    # The free flag is authoritative: the amount reads "Free", and a free
    # transfer is a known fee of nothing, not an undisclosed one.
    assert parse_fee("Free", "1") == 0.0
    assert parse_fee(None, "1") == 0.0


def test_parse_fee_returns_none_when_withheld():
    assert parse_fee("Undisclosed", "0") is None
    assert parse_fee(None, "0") is None
    assert parse_fee("", "0") is None


def test_parse_date_reads_the_iso_timestamp():
    assert parse_date("2026-08-03T00:00:00Z") == date(2026, 8, 3)
    assert parse_date(None) is None
    assert parse_date("not-a-date") is None


def test_parse_position_maps_onto_the_games_vocabulary():
    assert parse_position(_record()) == "CB"
    assert parse_position(_record(p1_name="goalkeeper")) == "GK"
    assert parse_position(_record(p1_name="striker-left")) == "LW"


def test_parse_position_covers_the_sources_whole_vocabulary():
    # Every p1_name the 13/08/2026 sweep contained. A key that is merely
    # plausible would fall through to the coarse group and turn wingers
    # into strikers, so the real list is pinned here.
    expected = {
        "goalkeeper": "GK",
        "defender-center": "CB",
        "defender-left": "LB",
        "defender-right": "RB",
        "defensive-midfielder-center": "CM",
        "defensive-midfielder-left": "CM",
        "defensive-midfielder-right": "CM",
        "midfielder-center": "CM",
        "midfielder-left": "LW",
        "midfielder-right": "RW",
        "attacking-midfielder-center": "AM",
        "attacking-midfielder-left": "LW",
        "attacking-midfielder-right": "RW",
        "striker-center": "ST",
        "striker-left": "LW",
        "striker-right": "RW",
    }
    for name, position in expected.items():
        # p1_group_id is deliberately absent, so nothing can be rescued
        # by the coarse fallback: the fine mapping has to stand alone.
        assert parse_position(_record(p1_name=name, p1_group_id=None)) == position


def test_parse_position_falls_back_to_the_coarse_group():
    # Plenty of lower-league records publish no fine position at all.
    assert parse_position(_record(p1_name=None, p1_group_id="1")) == "GK"
    assert parse_position(_record(p1_name="unheard-of", p1_group_id="4")) == "ST"
    assert parse_position(_record(p1_name=None, p1_group_id=None)) is None


def test_parse_record_keeps_the_short_club_names():
    # The short names are what the player master uses, so losing them
    # would break club matching downstream.
    transfer = parse_record(_record())
    assert transfer is not None
    assert transfer.club_to == "Stade Rennais FC"
    assert transfer.club_to_short == "Rennes"
    assert transfer.league_to == "fr"


def test_parse_record_classifies_a_permanent_move():
    transfer = parse_record(_record())
    assert transfer is not None
    assert transfer.is_loan is False
    assert transfer.is_free is False
    assert transfer.fee_eur_m == 22.5


def test_parse_record_flags_an_unknown_type_as_a_loan():
    # The confirmed feed only carries type_id 1; anything else must not
    # pass silently as a permanent transfer.
    transfer = parse_record(_record(type_id="7"))
    assert transfer is not None
    assert transfer.is_loan is True


def test_parse_record_rejects_records_missing_a_name_or_date():
    assert parse_record(_record(player_name="")) is None
    assert parse_record(_record(date_transfer=None)) is None


def test_parse_record_survives_an_unparseable_age():
    transfer = parse_record(_record(age=""))
    assert transfer is not None
    assert transfer.age is None


def test_parse_records_drops_the_unusable_ones():
    records = [_record(), _record(player_name=""), _record(age="30")]
    assert len(parse_records(records)) == 2

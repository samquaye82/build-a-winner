"""Turning raw transfer JSON records into typed, game-schema rows.

The feed is already structured, so this module does three jobs the raw
records leave undone: parsing the display fee string into euro millions,
classifying the move (permanent, free, loan), and reducing the source's
verbose position vocabulary to the game's nine positions.
"""

import re
from dataclasses import dataclass
from datetime import date
from typing import Any

#: Source's fine-grained position names -> the game's nine positions.
#: Keys are lowercased ``p1_name`` values, which are hyphenated slugs.
#: This is the source's complete vocabulary, enumerated from the whole
#: 13/08/2026 sweep rather than guessed: the site says "striker-left"
#: where one might expect "attacker-left", and a key that is merely
#: plausible falls through to the coarse group below, which silently
#: turns wingers into strikers.
_POSITION_TO_GAME: dict[str, str] = {
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

#: Coarse position-group ids -> the game's positions, used when the fine
#: position is missing or unrecognised. Group ids come from p1_group_id.
_GROUP_TO_GAME: dict[str, str] = {"1": "GK", "2": "CB", "3": "CM", "4": "ST"}

#: Fee strings carrying no number, matched case-insensitively.
_NON_NUMERIC_FEES = {"free", "undisclosed", "unknown", "loan", "-", ""}


@dataclass(frozen=True)
class Transfer:
    """One confirmed transfer.

    Attributes:
        player_name: Display name as published by the source.
        player_slug: Source's stable player identifier.
        age: Player's age at the time of the move, when published.
        country: Nationality as published.
        position: The game's position code, or None when underivable.
        position_raw: The source's own position label, kept for review.
        club_from: Selling or releasing club's full name.
        club_to: Buying club's full name.
        club_from_short: Selling club's short name ("Rennes"), which is
            far closer to the player master's vocabulary than the full
            legal name ("Stade Rennais FC") and is the key downstream
            matching should prefer.
        club_to_short: Buying club's short name.
        league_from: Country code of the selling club (e.g. "uk").
        league_to: Country code of the buying club.
        fee_eur_m: Fee in euro millions; 0.0 for a free, None if withheld.
        is_free: Whether the source flags the move as a free transfer.
        is_loan: Whether the move is a loan rather than a permanent deal.
        transfer_date: Effective date of the move.
    """

    player_name: str
    player_slug: str
    age: int | None
    country: str | None
    position: str | None
    position_raw: str | None
    club_from: str
    club_to: str
    club_from_short: str
    club_to_short: str
    league_from: str | None
    league_to: str | None
    fee_eur_m: float | None
    is_free: bool
    is_loan: bool
    transfer_date: date


def parse_fee(amount: str | None, free_flag: str | None) -> float | None:
    """Parses a display fee into euro millions.

    Handles the source's two magnitudes ("€50K", "€22.5M") and its
    non-numeric labels ("Free", "Undisclosed").

    Args:
        amount: The display fee string, e.g. "€22.5M".
        free_flag: The record's ``free`` field; "1" means a free transfer.

    Returns:
        The fee in euro millions, 0.0 for a free transfer, or None when
        the fee is undisclosed or unparseable.
    """
    if str(free_flag) == "1":
        return 0.0
    if amount is None or amount.strip().lower() in _NON_NUMERIC_FEES:
        return None

    match = re.search(r"([\d.]+)\s*([KM])?", amount.replace(",", ""), re.I)
    if match is None:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    # Thousands are the only other unit the feed uses; a bare number is
    # already in millions.
    return value / 1000 if (match.group(2) or "").upper() == "K" else value


def parse_position(record: dict[str, Any]) -> str | None:
    """Maps a record's position onto the game's nine-position vocabulary.

    Args:
        record: A raw transfer record.

    Returns:
        The game position code, or None when nothing usable is published.
    """
    fine = (record.get("p1_name") or "").strip().lower()
    if fine in _POSITION_TO_GAME:
        return _POSITION_TO_GAME[fine]
    return _GROUP_TO_GAME.get(str(record.get("p1_group_id")))


def parse_date(value: str | None) -> date | None:
    """Parses the feed's ISO-8601 transfer timestamp into a date.

    Args:
        value: Timestamp string, e.g. "2026-08-03T00:00:00Z".

    Returns:
        The date, or None when absent or unparseable.
    """
    if not value:
        return None
    try:
        year, month, day = (int(part) for part in value[:10].split("-"))
        return date(year, month, day)
    except ValueError:
        return None


def _country_code(club_slug: str | None) -> str | None:
    """Extracts the country code from a club slug such as "fr/rennes".

    Args:
        club_slug: The source's club slug.

    Returns:
        The leading country code, or None when the slug has no prefix.
    """
    if not club_slug or "/" not in club_slug:
        return None
    return club_slug.split("/", 1)[0]


def parse_record(record: dict[str, Any]) -> Transfer | None:
    """Converts one raw JSON record into a typed transfer.

    Args:
        record: A single element of the feed's ``records`` list.

    Returns:
        The parsed transfer, or None when it lacks a name or a date (both
        are required for every downstream use).
    """
    transfer_date = parse_date(record.get("date_transfer"))
    name = (record.get("player_name") or "").strip()
    if transfer_date is None or not name:
        return None

    age_raw = record.get("age")
    try:
        age = int(age_raw) if age_raw not in (None, "") else None
    except (TypeError, ValueError):
        age = None

    return Transfer(
        player_name=name,
        player_slug=record.get("player_slug") or "",
        age=age,
        country=record.get("country_name"),
        position=parse_position(record),
        position_raw=record.get("position_name"),
        club_from=record.get("club_from_name") or "",
        club_to=record.get("club_to_name") or "",
        club_from_short=record.get("club_from_short_name") or "",
        club_to_short=record.get("club_to_short_name") or "",
        league_from=_country_code(record.get("club_from_slug")),
        league_to=_country_code(record.get("club_to_slug")),
        fee_eur_m=parse_fee(record.get("amount"), record.get("free")),
        is_free=str(record.get("free")) == "1",
        # Every record in the confirmed feed is type_id 1, a permanent
        # move: loans sit on a separate tab and never appear here
        # (verified across the whole 13/08/2026 sweep). The field is kept
        # so a future id would show up as a loan rather than silently
        # passing as a permanent transfer.
        is_loan=str(record.get("type_id")) != "1",
        transfer_date=transfer_date,
    )


def parse_records(records: list[dict[str, Any]]) -> list[Transfer]:
    """Parses a page of records, dropping the unusable ones.

    Args:
        records: The feed's ``records`` list.

    Returns:
        Every record that parsed into a usable transfer.
    """
    parsed = (parse_record(record) for record in records)
    return [transfer for transfer in parsed if transfer is not None]

"""Pure parsing of an EA ratings page: no network, fully testable."""

import json
import re
from dataclasses import dataclass
from datetime import date
from typing import Any

#: The script tag Next.js embeds the page's data in.
_NEXT_DATA = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)


@dataclass(frozen=True)
class RatedPlayer:
    """One player as EA rates him."""

    ea_id: int
    rank: int
    overall: int
    first_name: str
    last_name: str
    common_name: str
    birthdate: str
    position: str
    team: str
    league: str
    gender: str


def page_payload(html: str) -> dict[str, Any]:
    """Extracts the ratings block from a page's embedded Next.js data.

    Args:
        html: The page's HTML.

    Returns:
        The ``ratingDetails`` object: ``items`` plus ``totalItems``.

    Raises:
        ValueError: If the page carries no ratings data, so a changed page
            fails loudly rather than reading as an empty last page.
    """
    match = _NEXT_DATA.search(html)
    if match is None:
        raise ValueError("No __NEXT_DATA__ script on the page")
    data = json.loads(match.group(1))
    try:
        return data["props"]["pageProps"]["ratingDetails"]
    except (KeyError, TypeError) as error:
        raise ValueError("No ratingDetails in the page data") from error


def iso_birthdate(raw: str) -> str:
    """Converts EA's ``MM/DD/YYYY H:MM`` birthdate to ISO ``YYYY-MM-DD``.

    Args:
        raw: The birthdate as EA publishes it, e.g. ``12/20/1998 0:00``.

    Returns:
        The ISO date, or an empty string when EA gives none.

    Raises:
        ValueError: If a non-empty value is not a valid date.
    """
    if not raw:
        return ""
    month, day, year = raw.split(" ")[0].split("/")
    return date(int(year), int(month), int(day)).isoformat()


def _label(value: Any) -> str:
    """Reads the display label from EA's ``{"label": ...}`` objects."""
    if isinstance(value, dict):
        return str(value.get("label") or value.get("shortLabel") or "")
    return "" if value is None else str(value)


def parse_items(items: list[dict[str, Any]]) -> list[RatedPlayer]:
    """Turns a page's raw items into typed rows.

    Args:
        items: The ``items`` list from page_payload().

    Returns:
        One RatedPlayer per item, in page order.
    """
    players = []
    for item in items:
        position = item.get("position") or {}
        players.append(
            RatedPlayer(
                ea_id=int(item["id"]),
                rank=int(item.get("rank") or 0),
                overall=int(item["overallRating"]),
                first_name=item.get("firstName") or "",
                last_name=item.get("lastName") or "",
                common_name=item.get("commonName") or "",
                birthdate=iso_birthdate(item.get("birthdate") or ""),
                position=position.get("shortLabel", "") if isinstance(position, dict) else "",
                team=_label(item.get("team")),
                league=item.get("leagueName") or "",
                gender=_label(item.get("gender")),
            )
        )
    return players

"""Parsing Capology's embedded player data.

Each salaries page embeds its complete dataset in an inline script:

    var data = [{ 'name': "<a ...>Erling Haaland</a>", ... }, ...];

The objects are JavaScript, not JSON (single-quoted keys, calls like
``accounting.formatMoney("32012451", ...)`` and ``moment("2034-06-30")``),
so this module splits the array into per-player chunks by brace counting
and pulls each field out with a targeted regular expression. Raw amounts
are the unformatted strings inside those calls, which is exactly what we
want: clean integers in EUR.
"""

import re
from dataclasses import dataclass

#: Matches the start of the embedded dataset.
_DATA_START = "var data = ["

_NAME_RE = re.compile(
    r"'name':\s*\"<a[^>]*href='/player/([^']+)/'[^>]*>(?:<img[^>]*>)?([^<]+)</a>\""
)
_CLUB_RE = re.compile(
    r"'club':\s*\"<a[^>]*href='/club/([^/]+)/salaries/'>([^<]+)</a>\""
)
_ANNUAL_GROSS_EUR_RE = re.compile(
    r"'annual_gross_eur':\s*accounting\.formatMoney\(\"(\d+)\""
)
_RELEASE_EUR_RE = re.compile(
    r"'release_eur':\s*accounting\.formatMoney\(\"(\d+)\""
)
_EXPIRATION_RE = re.compile(r"'expiration':\s*moment\(\"(\d{4})-\d{2}-\d{2}\"\)")
_SIGNED_RE = re.compile(r"'signed':\s*moment\(\"(\d{4}-\d{2}-\d{2})\"\)")
_POSITION_RE = re.compile(r"'position':\s*\"([^\"]*)\"")
_POSITION_DETAIL_RE = re.compile(r"'position_detail':\s*\"([^\"]*)\"")
_AGE_RE = re.compile(r"'age':\s*Math\.round\(\"(\d+)\"\)")
_COUNTRY_RE = re.compile(r"'country':\s*\"([^\"]*)\"")
_ACTIVE_RE = re.compile(r"'active':\s*\"(True|False)\"")
_LOAN_RE = re.compile(r"'loan':\s*\"(True|False)\"")


@dataclass(frozen=True)
class RawPlayer:
    """One player row exactly as Capology publishes it.

    Attributes:
        player_slug: Capology's player URL slug (stable unique id).
        name: Display name.
        club_slug: Capology's club URL slug.
        club: Club display name.
        country: Nationality as a country name.
        position_group: Coarse position: G, D, M or F.
        position_detail: Fine position, e.g. GK, CB, DM, AM, CF.
        age: Age in whole years at scrape time.
        annual_gross_eur: Fixed gross salary in EUR per year (no bonuses).
        expiry_year: Contract expiration year (contracts end 30 June).
        signed_date: ISO date the current contract was signed, if known.
        release_eur: Release clause in EUR, if any.
        active: Capology's active flag.
        loan: True when the player is at the club on loan.
        verified: True when Capology has verified the salary.
    """

    player_slug: str
    name: str
    club_slug: str
    club: str
    country: str
    position_group: str
    position_detail: str
    age: int | None
    annual_gross_eur: int | None
    expiry_year: int | None
    signed_date: str | None
    release_eur: int | None
    active: bool
    loan: bool
    verified: bool


def extract_data_array(html: str) -> str:
    """Extracts the raw text of the embedded ``var data = [...]`` array.

    Args:
        html: Full page HTML.

    Returns:
        The array's inner text, from the first ``[`` to its matching ``]``
        (exclusive of both brackets).

    Raises:
        ValueError: If the page contains no embedded data array.
    """
    start = html.find(_DATA_START)
    if start == -1:
        raise ValueError("No embedded 'var data = [' array found in page")
    open_bracket = start + len(_DATA_START) - 1

    depth = 0
    for index in range(open_bracket, len(html)):
        char = html[index]
        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return html[open_bracket + 1 : index]
    raise ValueError("Embedded data array is not terminated")


def split_records(array_text: str) -> list[str]:
    """Splits the array text into one string per player object.

    Brace counting rather than splitting on ``},`` because embedded HTML
    attribute strings can in principle contain commas and braces.

    Args:
        array_text: The array's inner text from extract_data_array.

    Returns:
        A list of ``{...}`` object strings.
    """
    records: list[str] = []
    depth = 0
    start: int | None = None
    for index, char in enumerate(array_text):
        if char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and start is not None:
                records.append(array_text[start : index + 1])
                start = None
    return records


def _search(pattern: re.Pattern[str], record: str) -> str | None:
    """Returns the first capture group of a match, or None."""
    match = pattern.search(record)
    return match.group(1) if match else None


def parse_record(record: str) -> RawPlayer | None:
    """Parses one player object into a RawPlayer.

    Args:
        record: A single ``{...}`` object string.

    Returns:
        The parsed player, or None when the record lacks the mandatory
        identity fields (name and club), which indicates a non-player row.
    """
    name_match = _NAME_RE.search(record)
    club_match = _CLUB_RE.search(record)
    if name_match is None or club_match is None:
        return None

    age = _search(_AGE_RE, record)
    annual = _search(_ANNUAL_GROSS_EUR_RE, record)
    expiry = _search(_EXPIRATION_RE, record)
    release = _search(_RELEASE_EUR_RE, record)

    return RawPlayer(
        player_slug=name_match.group(1),
        name=name_match.group(2).strip(),
        club_slug=club_match.group(1),
        club=club_match.group(2).strip(),
        country=_search(_COUNTRY_RE, record) or "",
        position_group=_search(_POSITION_RE, record) or "",
        position_detail=_search(_POSITION_DETAIL_RE, record) or "",
        age=int(age) if age is not None else None,
        annual_gross_eur=int(annual) if annual is not None else None,
        expiry_year=int(expiry) if expiry is not None else None,
        signed_date=_search(_SIGNED_RE, record),
        release_eur=int(release) if release is not None else None,
        active=_search(_ACTIVE_RE, record) == "True",
        loan=_search(_LOAN_RE, record) == "True",
        verified="verified-green" in record,
    )


def parse_players(html: str) -> list[RawPlayer]:
    """Parses every player embedded in a league salaries page.

    Args:
        html: Full page HTML.

    Returns:
        All parseable player rows, in page order.

    Raises:
        ValueError: If the page contains no embedded data array.
    """
    array_text = extract_data_array(html)
    players = []
    for record in split_records(array_text):
        player = parse_record(record)
        if player is not None:
            players.append(player)
    return players

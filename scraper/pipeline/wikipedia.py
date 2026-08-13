"""Recovering age and position for signings from Wikipedia.

The transfer feed publishes its long tail as little more than a name and
two clubs, with no age and no position: both fields live on a player
record the feed never links to. Wikipedia's per-country transfer lists
carry the same moves, and the players' own articles carry an infobox with
a date of birth and a position, which is exactly the gap.

This is a second, independent source, so it doubles as corroboration: a
player found here is one whose transfer two sources agree on.

Only players whose article gives BOTH a usable date of birth and an
unambiguous position are returned. A "Winger" with no side, or a
"Forward" that could be any of three game positions, is left out rather
than guessed, because position drives squad balance in scoring.

Usage (from scraper/, venv active):

    python -m pipeline.wikipedia
"""

import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd

from .matching import AGE_REFERENCE_DATE, normalise_name

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "cache" / "wikipedia"
OUT_CSV = ROOT / "output" / "wikipedia_attributes.csv"

API = "https://en.wikipedia.org/w/api.php"

#: Wikipedia asks automated clients to identify themselves and to keep
#: request rates modest; one request a second is well inside its limits.
USER_AGENT = (
    "SportingDirectorGame/1.0 (personal football-game dataset; "
    "contact sam.quaye@q15brands.co)"
)
REQUEST_DELAY_SECONDS = 1.0

#: The per-country lists that cover the game's leagues. Portugal has no
#: such page, so Primeira Liga moves cannot be checked here.
TRANSFER_LIST_PAGES: tuple[str, ...] = (
    "List_of_English_football_transfers_summer_2026",
    "List_of_Spanish_football_transfers_summer_2026",
    "List_of_Italian_football_transfers_summer_2026",
    "List_of_German_football_transfers_summer_2026",
    "List_of_French_football_transfers_summer_2026",
    "List_of_Dutch_football_transfers_summer_2026",
    "List_of_Belgian_football_transfers_summer_2026",
)

#: Infobox position wording -> the game's nine positions. Only the
#: unambiguous wordings appear: bare "Winger", "Forward", "Midfielder"
#: and "Defender" are deliberately absent, since each spans several game
#: positions and a wrong guess skews the balance score.
_POSITION_TO_GAME: dict[str, str] = {
    "goalkeeper": "GK",
    "centre-back": "CB",
    "center-back": "CB",
    "central defender": "CB",
    "left-back": "LB",
    "left back": "LB",
    "right-back": "RB",
    "right back": "RB",
    "left wing-back": "LB",
    "right wing-back": "RB",
    "defensive midfielder": "CM",
    "central midfielder": "CM",
    "centre midfielder": "CM",
    "attacking midfielder": "AM",
    "left winger": "LW",
    "right winger": "RW",
    "left midfielder": "LW",
    "right midfielder": "RW",
    "striker": "ST",
    "centre-forward": "ST",
    "center-forward": "ST",
}

_BIRTH_PATTERN = re.compile(
    r"birth_date\s*=\s*\{\{\s*[Bb]irth date(?: and age)?\s*\|"
    r"\s*(?:df=y\s*\|\s*)?(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})",
)
_POSITION_PATTERN = re.compile(r"\n\s*\|\s*position\s*=\s*([^\n]+)")


def _cache_path(title: str) -> Path:
    """Returns the cache location for an article's wikitext.

    Args:
        title: The article title.

    Returns:
        The path of the cached file (may not exist yet).
    """
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", title)[:120]
    return CACHE_DIR / f"{safe}.txt"


def fetch_wikitext(title: str) -> str | None:
    """Returns an article's wikitext, fetching it at most once ever.

    Args:
        title: The article title; redirects are followed.

    Returns:
        The wikitext, or None when there is no such article.
    """
    path = _cache_path(title)
    if path.exists():
        return path.read_text(encoding="utf-8") or None

    query = urllib.parse.urlencode(
        {
            "action": "parse",
            "page": title,
            "prop": "wikitext",
            "format": "json",
            "redirects": "1",
        }
    )
    request = urllib.request.Request(
        f"{API}?{query}", headers={"User-Agent": USER_AGENT}
    )
    time.sleep(REQUEST_DELAY_SECONDS)
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)

    text = payload.get("parse", {}).get("wikitext", {}).get("*", "")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    # An absent article is cached as empty, so a re-run does not re-ask.
    path.write_text(text, encoding="utf-8")
    return text or None


def parse_birth_date(wikitext: str) -> date | None:
    """Reads the date of birth from a football biography infobox.

    Args:
        wikitext: The article's wikitext.

    Returns:
        The date of birth, or None when the infobox does not give one.
    """
    match = _BIRTH_PATTERN.search(wikitext)
    if not match:
        return None
    try:
        return date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    except ValueError:
        return None


def parse_position(wikitext: str) -> str | None:
    """Reads an unambiguous playing position from the infobox.

    Args:
        wikitext: The article's wikitext.

    Returns:
        The game position code, or None when the infobox gives none or
        gives one too vague to place ("Winger", "Forward").
    """
    match = _POSITION_PATTERN.search(wikitext)
    if not match:
        return None
    # Strip wiki markup: "[[Left-back]]" or "[[Winger (association football)|Winger]]".
    raw = match.group(1)
    raw = re.sub(r"\[\[(?:[^\]|]+\|)?([^\]]+)\]\]", r"\1", raw)
    raw = re.sub(r"<[^>]+>|\{\{[^}]*\}\}", " ", raw)
    text = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode()

    # A player listing several positions leads with his primary one.
    for candidate in re.split(r"[,/]| or ", text):
        key = candidate.strip().strip("'").lower()
        if key in _POSITION_TO_GAME:
            return _POSITION_TO_GAME[key]
    return None


def age_at_window(born: date) -> int:
    """Returns a player's age at the Summer 2026 window.

    Args:
        born: The date of birth.

    Returns:
        Age in whole years at the window's reference date.
    """
    reference = AGE_REFERENCE_DATE
    return (
        reference.year
        - born.year
        - ((reference.month, reference.day) < (born.month, born.day))
    )


def article_titles(names: list[str]) -> dict[str, str]:
    """Finds article titles for players named in the transfer lists.

    The lists wikilink most players, and the link target is the reliable
    title (it carries disambiguators such as "(footballer, born 2005)").
    Players named in plain table cells fall back to their bare name,
    which the API resolves through redirects.

    Args:
        names: Player names to look for.

    Returns:
        Player name -> article title.
    """
    wanted = {normalise_name(name): name for name in names}
    titles: dict[str, str] = {}
    for page in TRANSFER_LIST_PAGES:
        wikitext = fetch_wikitext(page)
        if not wikitext:
            continue
        for match in re.finditer(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", wikitext):
            shown = normalise_name(match.group(2) or match.group(1))
            if shown in wanted and wanted[shown] not in titles:
                titles[wanted[shown]] = match.group(1)
    for name in names:
        titles.setdefault(name, name)
    return titles


def mentions_club(wikitext: str, club: str) -> bool:
    """Whether an article mentions a club, as a check of identity.

    Names like "Michael Frey" and "Kevin Muller" belong to several
    footballers, and an unlinked list entry resolves only to a bare
    title. Requiring the article to mention the club the player just
    joined is what stops a namesake's biography being read as his.

    Args:
        wikitext: The article's wikitext.
        club: The club name to look for.

    Returns:
        True when the article mentions the club.
    """
    text = normalise_name(wikitext)
    tokens = [token for token in normalise_name(club).split() if len(token) > 3]
    if not tokens:
        return normalise_name(club) in text
    return any(token in text for token in tokens)


def collect(
    names: list[str], clubs: dict[str, str] | None = None
) -> tuple[pd.DataFrame, list[str]]:
    """Collects age and position for the named players.

    Args:
        names: Player names to look up.
        clubs: Player name -> the club he joined, used to confirm the
            article is about the right man. Players whose article never
            mentions the club are rejected.

    Returns:
        A pair of (attributes frame, names left unresolved).
    """
    rows: list[dict[str, Any]] = []
    unresolved: list[str] = []
    clubs = clubs or {}
    for name, title in article_titles(names).items():
        wikitext = fetch_wikitext(title)
        if not wikitext:
            unresolved.append(f"{name}: no article")
            continue
        club = clubs.get(name)
        if club and not mentions_club(wikitext, club):
            unresolved.append(
                f"{name}: article '{title}' never mentions {club}, "
                "so it is probably a different player"
            )
            continue
        born = parse_birth_date(wikitext)
        position = parse_position(wikitext)
        if born is None or position is None:
            missing = "date of birth" if born is None else "clear position"
            unresolved.append(f"{name}: article gives no {missing}")
            continue
        rows.append(
            {
                "player_name": name,
                "age": age_at_window(born),
                "position": position,
                "birth_date": born.isoformat(),
                "article": title,
            }
        )
    return pd.DataFrame(rows), unresolved


def main() -> int:
    """Looks up every held-back signing and writes what Wikipedia gives.

    Returns:
        Process exit code.
    """
    from .apply_reconciliation import (
        build_new_players,
        load_decisions,
        source_attributes,
    )
    from .reconcile import REVIEW_CSV

    master = pd.read_csv(REVIEW_CSV)
    _, skipped = build_new_players(load_decisions(), master, source_attributes())
    names = sorted(set(skipped.player))
    if not names:
        print("Nothing held back.")
        return 0

    clubs = dict(zip(skipped.player, skipped.proposed_club))
    frame, unresolved = collect(names, clubs)
    print(f"Looked up {len(names)} players; recovered {len(frame)}.")
    for line in unresolved:
        print(f"  {line}")

    if frame.empty:
        return 1

    # Merge, never replace. Each run only looks up what is still held
    # back, so the players recovered last time are absent from this
    # frame; writing it straight out would throw them away.
    if OUT_CSV.exists():
        previous = pd.read_csv(OUT_CSV)
        frame = pd.concat([previous, frame]).drop_duplicates(
            "player_name", keep="last"
        )

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUT_CSV, index=False)
    print(f"\nWrote {len(frame)} players to {OUT_CSV}")
    print(frame.to_string(index=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

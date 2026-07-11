"""Matching Capology players to Transfermarkt records.

Neither source shares an identifier, so matching goes in layers, each more
permissive but club-anchored:

1. Globally unique normalised full-name matches (also used to bootstrap
   the Capology-club -> TM-club mapping from co-occurrence).
2. Full name + mapped club.
3. Surname + mapped club + age within one year.

Every helper is pure so the layers are unit-testable without CSVs.
"""

import re
import unicodedata
from datetime import date

#: Season-start reference date for age calculations (Summer 2026 window).
AGE_REFERENCE_DATE = date(2026, 7, 1)

#: Noise tokens stripped from club names before comparison.
_CLUB_NOISE = {
    "fc", "cf", "afc", "ac", "as", "ss", "ssc", "sc", "sv", "vfl", "vfb",
    "tsg", "rc", "cd", "ud", "rcd", "kv", "kvc", "krc", "kaa", "ogc", "og",
    "us", "psv", "az",  # psv/az kept whole below; listed for documentation
    "1", "1899", "04", "05", "team",
}

#: Clubs whose "noise" token IS the name; never strip these entirely.
_CLUB_KEEP_WHOLE = {"psv", "az", "nec", "como", "genk", "gent"}


def normalise_name(name: str) -> str:
    """Normalises a person or club name for comparison.

    Lowercases, strips accents (Ekitiké -> ekitike), and removes anything
    that is not a letter or space.

    Args:
        name: The raw display name.

    Returns:
        The normalised name with single spaces.
    """
    decomposed = unicodedata.normalize("NFKD", name)
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    letters = re.sub(r"[^a-zA-Z ]+", " ", ascii_only).lower()
    return re.sub(r"\s+", " ", letters).strip()


def normalise_club(name: str) -> str:
    """Normalises a club name by dropping legal-form noise tokens.

    "Club Brugge KV" and "club-brugges" both reduce towards "club brugge".

    Args:
        name: Raw club name or slug.

    Returns:
        The normalised club key.
    """
    base = normalise_name(name.replace("-", " "))
    tokens = [t for t in base.split(" ") if t]
    if len(tokens) == 1 or base in _CLUB_KEEP_WHOLE:
        return base
    kept = [t for t in tokens if t not in _CLUB_NOISE]
    return " ".join(kept) if kept else base


def surname_key(name: str) -> str:
    """Returns the final token of a normalised name.

    Args:
        name: The raw display name.

    Returns:
        The normalised surname, or the whole name for mononyms (Alisson).
    """
    parts = normalise_name(name).split(" ")
    return parts[-1] if parts else ""


def age_on_reference_date(date_of_birth: str) -> int | None:
    """Computes a player's age at the Summer 2026 window from an ISO date.

    Args:
        date_of_birth: ISO date string, e.g. "2000-07-21".

    Returns:
        Age in whole years, or None when the date is unparseable.
    """
    try:
        year, month, day = (int(part) for part in date_of_birth[:10].split("-"))
        born = date(year, month, day)
    except (ValueError, AttributeError):
        return None
    ref = AGE_REFERENCE_DATE
    return ref.year - born.year - ((ref.month, ref.day) < (born.month, born.day))


def ages_compatible(cap_age: int | None, tm_age: int | None) -> bool:
    """Whether two age readings plausibly describe the same player.

    Capology ages are as-of "now" and TM ages derive from DOB at the window
    reference date, so a one-year disagreement is normal.

    Args:
        cap_age: Age according to Capology.
        tm_age: Age according to Transfermarkt DOB.

    Returns:
        True when either age is missing or they differ by at most one year.
    """
    if cap_age is None or tm_age is None:
        return True
    return abs(cap_age - tm_age) <= 1

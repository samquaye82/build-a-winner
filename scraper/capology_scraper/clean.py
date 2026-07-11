"""Cleaning and normalisation: Capology rows to game-schema rows.

Maps Capology's position vocabulary onto the game's nine positions,
converts EUR integers to EUR millions, and filters to the players the
game wants (active first-team rows).
"""

from dataclasses import asdict, dataclass

from .parse import RawPlayer

#: Fine-grained position -> the game's nine-position vocabulary.
_DETAIL_TO_GAME: dict[str, str] = {
    "GK": "GK",
    "CB": "CB",
    "LB": "LB",
    "LWB": "LB",
    "RB": "RB",
    "RWB": "RB",
    "DM": "CM",
    "CM": "CM",
    "AM": "AM",
    "LM": "LW",
    "RM": "RW",
    "LW": "LW",
    "RW": "RW",
    "CF": "ST",
    "ST": "ST",
    "SS": "ST",
}

#: Coarse group fallback when the fine position is missing or unknown.
_GROUP_TO_GAME: dict[str, str] = {"G": "GK", "D": "CB", "M": "CM", "F": "ST"}


@dataclass(frozen=True)
class CleanPlayer:
    """A game-ready player row (pre-enrichment).

    Attributes:
        player_slug: Stable Capology id.
        name: Display name.
        league: League key from the registry.
        club_slug: Capology club slug.
        club: Club display name.
        country: Nationality.
        position: One of the game's nine positions.
        position_detail: Capology's fine position, kept for auditing.
        age: Age in whole years.
        salary_eur_m: Fixed gross salary in EUR millions per year. None when
            the source withholds it (Belgian Pro League wages sit behind
            Capology's paywall); downstream imputes and flags those.
        expiry_year: Contract expiration year (30 June convention).
        signed_date: ISO date the contract was signed, if known.
        release_eur_m: Release clause in EUR millions, if any.
        loan: True when at the club on loan.
        verified: True when Capology verified the salary.
    """

    player_slug: str
    name: str
    league: str
    club_slug: str
    club: str
    country: str
    position: str
    position_detail: str
    age: int
    salary_eur_m: float | None
    expiry_year: int
    signed_date: str | None
    release_eur_m: float | None
    loan: bool
    verified: bool


def map_position(position_group: str, position_detail: str) -> str | None:
    """Maps Capology positions onto the game's nine-position vocabulary.

    Args:
        position_group: Capology coarse group (G/D/M/F).
        position_detail: Capology fine position (e.g. DM, CF).

    Returns:
        A game position, or None if both inputs are unknown.
    """
    detail = _DETAIL_TO_GAME.get(position_detail.upper())
    if detail is not None:
        return detail
    return _GROUP_TO_GAME.get(position_group.upper())


def eur_to_millions(amount: int) -> float:
    """Converts integer EUR to EUR millions at 0.1m precision.

    Args:
        amount: An amount in whole euros.

    Returns:
        The amount in EUR millions, rounded to one decimal place.
    """
    return round(amount / 1_000_000, 1)


def clean_players(players: list[RawPlayer], league_key: str) -> list[CleanPlayer]:
    """Filters and normalises one league's parsed rows.

    Rows are dropped when inactive, or when missing the fields the game
    cannot function without (age, contract expiry, position). Salary is
    optional: some leagues' wages are paywalled at source and are imputed
    downstream instead. Loanees are kept and flagged: the loan row locates
    the player at the club he actually plays for.

    Args:
        players: Parsed rows from one league page.
        league_key: The league registry key for these rows.

    Returns:
        Game-ready rows, in input order.
    """
    cleaned: list[CleanPlayer] = []
    for player in players:
        if not player.active:
            continue
        if player.age is None or player.expiry_year is None:
            continue
        position = map_position(player.position_group, player.position_detail)
        if position is None:
            continue

        cleaned.append(
            CleanPlayer(
                player_slug=player.player_slug,
                name=player.name,
                league=league_key,
                club_slug=player.club_slug,
                club=player.club,
                country=player.country,
                position=position,
                position_detail=player.position_detail,
                age=player.age,
                salary_eur_m=(
                    eur_to_millions(player.annual_gross_eur)
                    if player.annual_gross_eur is not None
                    else None
                ),
                expiry_year=player.expiry_year,
                signed_date=player.signed_date,
                release_eur_m=(
                    eur_to_millions(player.release_eur)
                    if player.release_eur is not None
                    else None
                ),
                loan=player.loan,
                verified=player.verified,
            )
        )
    return cleaned


def to_dicts(players: list[CleanPlayer]) -> list[dict[str, object]]:
    """Converts clean rows to plain dictionaries for DataFrame/CSV output.

    Args:
        players: Clean player rows.

    Returns:
        One dictionary per player, field order preserved.
    """
    return [asdict(player) for player in players]

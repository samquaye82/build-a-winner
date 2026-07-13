"""League registry: the competitions in the game's player database.

The eight top-flight leagues Liverpool shop in, plus a curated slice of
the English Championship: only the three clubs relegated from the Premier
League in 2025/26 (West Ham, Wolves, Burnley), whose squads are full of
proven Premier League players available at relegation prices (Sam,
13/07/2026). A club_allowlist keeps the rest of the Championship out.

Slugs were discovered from Capology's own navigation; note Eredivisie
sits under the ``ne`` country code and the Belgian Pro League is listed
as ``first-division-a``.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class League:
    """A scrapeable league.

    Attributes:
        key: Stable identifier used for cache filenames and CSV rows.
        name: Human-readable league name.
        path: URL path of the league's salaries page on Capology.
        club_allowlist: If set, only players at these club slugs are kept
            (used to take just three clubs from the Championship).
    """

    key: str
    name: str
    path: str
    club_allowlist: frozenset[str] | None = None


BASE_URL = "https://www.capology.com"

#: The relegated clubs to lift out of the Championship (Capology slugs).
RELEGATED_CLUBS = frozenset({"west-ham", "wolverhampton", "burnley"})

LEAGUES: tuple[League, ...] = (
    League("premier-league", "Premier League", "/uk/premier-league/salaries/"),
    League("la-liga", "La Liga", "/es/la-liga/salaries/"),
    League("bundesliga", "Bundesliga", "/de/1-bundesliga/salaries/"),
    League("serie-a", "Serie A", "/it/serie-a/salaries/"),
    League("ligue-1", "Ligue 1", "/fr/ligue-1/salaries/"),
    League("primeira-liga", "Primeira Liga", "/pt/primeira-liga/salaries/"),
    League("eredivisie", "Eredivisie", "/ne/eredivisie/salaries/"),
    League("pro-league", "Belgian Pro League", "/be/first-division-a/salaries/"),
    League(
        "championship",
        "Championship (relegated clubs)",
        "/uk/championship/salaries/",
        club_allowlist=RELEGATED_CLUBS,
    ),
)


def league_url(league: League) -> str:
    """Builds the absolute salaries URL for a league.

    Args:
        league: The league to build the URL for.

    Returns:
        The absolute URL of the league's salaries page.
    """
    return f"{BASE_URL}{league.path}"

"""League registry: the eight competitions in the game's player database.

Slugs were discovered from Capology's own navigation (10/07/2026 cache);
note Eredivisie sits under the ``ne`` country code and the Belgian Pro
League is listed as ``first-division-a``.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class League:
    """A scrapeable league.

    Attributes:
        key: Stable identifier used for cache filenames and CSV rows.
        name: Human-readable league name.
        path: URL path of the league's salaries page on Capology.
    """

    key: str
    name: str
    path: str


BASE_URL = "https://www.capology.com"

LEAGUES: tuple[League, ...] = (
    League("premier-league", "Premier League", "/uk/premier-league/salaries/"),
    League("la-liga", "La Liga", "/es/la-liga/salaries/"),
    League("bundesliga", "Bundesliga", "/de/1-bundesliga/salaries/"),
    League("serie-a", "Serie A", "/it/serie-a/salaries/"),
    League("ligue-1", "Ligue 1", "/fr/ligue-1/salaries/"),
    League("primeira-liga", "Primeira Liga", "/pt/primeira-liga/salaries/"),
    League("eredivisie", "Eredivisie", "/ne/eredivisie/salaries/"),
    League("pro-league", "Belgian Pro League", "/be/first-division-a/salaries/"),
)


def league_url(league: League) -> str:
    """Builds the absolute salaries URL for a league.

    Args:
        league: The league to build the URL for.

    Returns:
        The absolute URL of the league's salaries page.
    """
    return f"{BASE_URL}{league.path}"

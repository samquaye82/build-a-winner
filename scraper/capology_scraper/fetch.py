"""Polite, cached fetching of Capology league pages.

Politeness rules, enforced in code rather than by good intentions:

* Every response is cached to disk on first fetch; subsequent runs read the
  cache and never touch the network. The snapshot is one-off by design.
* A fixed delay separates consecutive network requests.
* An honest desktop browser User-Agent is sent (the pages are public and
  server-rendered; no session tricks are needed or used).
"""

import time
from pathlib import Path

from scrapling.fetchers import Fetcher

from .leagues import League, league_url

#: Seconds between consecutive network requests.
REQUEST_DELAY_SECONDS = 3.0

#: A plain desktop browser identity.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def cache_path(cache_dir: Path, league: League) -> Path:
    """Returns the on-disk cache location for a league page.

    Args:
        cache_dir: Directory holding cached HTML.
        league: The league being fetched.

    Returns:
        The path of the cached HTML file (may not exist yet).
    """
    return cache_dir / f"{league.key}.html"


def fetch_league_html(cache_dir: Path, league: League) -> str:
    """Returns a league page's HTML, fetching it at most once ever.

    Args:
        cache_dir: Directory holding cached HTML.
        league: The league to fetch.

    Returns:
        The page HTML.

    Raises:
        RuntimeError: If the request fails or returns a non-200 status.
    """
    path = cache_path(cache_dir, league)
    if path.exists():
        return path.read_text(encoding="utf-8")

    time.sleep(REQUEST_DELAY_SECONDS)
    response = Fetcher.get(
        league_url(league), headers={"User-Agent": USER_AGENT}, timeout=30
    )
    if response.status != 200:
        raise RuntimeError(
            f"Fetching {league.name} failed with HTTP {response.status}"
        )

    html = response.html_content
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(html, encoding="utf-8")
    return html

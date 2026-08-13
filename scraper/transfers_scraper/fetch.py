"""Polite, cached paging of footballtransfers.com's confirmed-transfer feed.

The same politeness rules the Capology scraper enforces apply here, for
the same reasons:

* Every response is cached to disk on first fetch; later runs read the
  cache and never touch the network.
* A fixed delay separates consecutive network requests.
* An honest desktop browser User-Agent is sent (the endpoint backs a
  public page and needs no session tricks).

The endpoint is the POST target of the listing page's own filter form,
discovered from that page's markup. It returns JSON, so the client-side
rendering of the visible table is irrelevant to us.

Provenance note: footballtransfers.com's robots.txt disallows this
endpoint (``/en/transfers/actions/confirmed/overview``), as it does every
other data-bearing endpoint on the site; the visible pages are empty
placeholders filled in client-side, so there is no permitted route to the
data. Sam reviewed that and authorised the fetch anyway for this one-off
snapshot (13/08/2026). The sweep is therefore deliberately small and
permanently cached: roughly sixty requests, three seconds apart, once
ever. Do not widen it without asking him again.
"""

import gzip
import json
import time
from pathlib import Path
from typing import Any

from scrapling.fetchers import Fetcher

#: Seconds between consecutive network requests.
REQUEST_DELAY_SECONDS = 3.0

#: A plain desktop browser identity.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

#: POST target backing the confirmed-transfers table.
OVERVIEW_URL = (
    "https://www.footballtransfers.com/en/transfers/actions/confirmed/overview"
)

#: POST target backing a single club's transfer history. This is the only
#: place loans appear: the confirmed feed carries permanent moves alone,
#: and the site's global "latest transfers" feed does include loans but
#: holds just 250 recent records, far short of a whole window.
CLUB_URL = (
    "https://www.footballtransfers.com/en/teams/actions/transfers/overview"
)

#: Records per request. 100 is accepted by the endpoint and keeps the
#: request count (and therefore the load we place on the site) low.
PAGE_ITEMS = 100

#: Season identifiers, taken from the listing page's season <select>.
#: Summer 2026 moves are tagged 2026/27, but a June move can be filed
#: under the season just ended, so both are swept and filtered by date.
SEASON_2026_27 = "5841"
SEASON_2025_26 = "5843"


def cache_path(cache_dir: Path, season: str, page: int) -> Path:
    """Returns the on-disk cache location for one page of one season.

    Args:
        cache_dir: Directory holding cached JSON.
        season: The season identifier being paged.
        page: 1-based page number.

    Returns:
        The path of the cached JSON file (may not exist yet).
    """
    return cache_dir / f"confirmed_{season}_p{page:03d}.json"


def fetch_page(cache_dir: Path, season: str, page: int) -> dict[str, Any]:
    """Returns one page of confirmed transfers, fetching it at most once.

    Results are ordered by transfer date, newest first.

    Args:
        cache_dir: Directory holding cached JSON.
        season: The season identifier to filter on.
        page: 1-based page number.

    Returns:
        The decoded JSON payload, including the ``records`` list.

    Raises:
        RuntimeError: If the request fails or returns a non-200 status.
    """
    path = cache_path(cache_dir, season, page)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    time.sleep(REQUEST_DELAY_SECONDS)
    response = Fetcher.post(
        OVERVIEW_URL,
        data={
            "orderBy": "date_transfer",
            "orderByDescending": "1",
            "page": str(page),
            "pages": "0",
            "pageItems": str(PAGE_ITEMS),
            "season": season,
        },
        headers={
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=30,
    )
    if response.status != 200:
        raise RuntimeError(
            f"Fetching season {season} page {page} failed with "
            f"HTTP {response.status}"
        )

    payload = response.json()
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return payload


def club_cache_path(cache_dir: Path, team_id: str) -> Path:
    """Returns the on-disk cache location for a club's transfer history.

    Args:
        cache_dir: Directory holding cached JSON.
        team_id: The site's numeric club identifier.

    Returns:
        The path of the cached file (may not exist yet).
    """
    return cache_dir / f"club_{team_id}.json.gz"


def fetch_club_transfers(cache_dir: Path, team_id: str) -> dict[str, Any]:
    """Returns one club's full transfer history, fetching it at most once.

    The endpoint ignores paging and season filters and returns the club's
    entire recorded history, incoming and outgoing, in one response. That
    runs to a couple of megabytes per club, so the cache is gzipped:
    uncompressed, the modelled clubs would occupy a few hundred MB.

    Args:
        cache_dir: Directory holding cached JSON.
        team_id: The site's numeric club identifier.

    Returns:
        The decoded payload, with ``incoming_records`` and
        ``outgoing_records`` lists.

    Raises:
        RuntimeError: If the request fails or returns a non-200 status.
    """
    path = club_cache_path(cache_dir, team_id)
    if path.exists():
        with gzip.open(path, "rt", encoding="utf-8") as cached:
            return json.load(cached)

    time.sleep(REQUEST_DELAY_SECONDS)
    response = Fetcher.post(
        CLUB_URL,
        data={
            "orderBy": "",
            "orderByDescending": "1",
            "page": "1",
            "pages": "0",
            "pageItems": str(PAGE_ITEMS),
            "teamId": team_id,
        },
        headers={
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
        },
        timeout=60,
    )
    if response.status != 200:
        raise RuntimeError(
            f"Fetching club {team_id} failed with HTTP {response.status}"
        )

    payload = response.json()
    cache_dir.mkdir(parents=True, exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as cached:
        json.dump(payload, cached)
    return payload

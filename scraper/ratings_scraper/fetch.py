"""Polite, cached fetching of ea.com's player ratings pages.

* Every page is cached on first fetch, as the hundred items it carries;
  later runs read the cache and never touch the network.
* A fixed delay separates consecutive network requests.
* An honest desktop browser User-Agent is sent, and scrapling's default
  "stealthy" headers (which add a made-up Google referer) are switched
  off. The 02/10/2026 fetch ran before that switch; it is cached for good,
  so no further requests were ever made with them.
"""

import json
import time
from pathlib import Path
from typing import Any

from scrapling.fetchers import Fetcher

from .parse import page_payload

#: Seconds between consecutive network requests.
REQUEST_DELAY_SECONDS = 1.0

#: A plain desktop browser identity.
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

#: The public ratings listing, sorted by overall rating, 100 per page.
RATINGS_URL = "https://www.ea.com/games/ea-sports-fc/ratings"


def cache_path(cache_dir: Path, page: int) -> Path:
    """Returns the on-disk cache location for one page.

    Args:
        cache_dir: Directory holding cached pages.
        page: 1-based page number.

    Returns:
        The path of the cached JSON file (may not exist yet).
    """
    return cache_dir / f"page_{page:03d}.json"


def fetch_page(cache_dir: Path, page: int) -> dict[str, Any]:
    """Returns one page's ratings block, fetching it at most once.

    Only the ratings block is cached, not the 1.5 MB page around it.

    Args:
        cache_dir: Directory holding cached pages.
        page: 1-based page number.

    Returns:
        The ``ratingDetails`` object: ``items`` and ``totalItems``.

    Raises:
        RuntimeError: If the request fails or returns a non-200 status.
        ValueError: If the page no longer carries the ratings data.
    """
    path = cache_path(cache_dir, page)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))

    time.sleep(REQUEST_DELAY_SECONDS)
    response = Fetcher.get(
        RATINGS_URL,
        params={"page": str(page)},
        headers={"User-Agent": USER_AGENT},
        stealthy_headers=False,
        timeout=30,
    )
    if response.status != 200:
        raise RuntimeError(f"Fetching ratings page {page} failed with HTTP {response.status}")

    details = page_payload(response.body.decode("utf-8"))
    payload = {"totalItems": details.get("totalItems"), "items": details.get("items") or []}
    cache_dir.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload

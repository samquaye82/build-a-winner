"""Reading a single player's profile page.

The transfer feed leaves age and position blank for lower-profile
players. Where the site holds a real player record, its profile page
carries both (plus a contract expiry), server-rendered, so a page fetch
fills the gap.

Note the limit: most players missing an age carry no player slug in any
feed either, meaning the site has no record for them at all and there is
no page to read. This module only helps the minority that do have one.

Unlike the table endpoints, ``/en/players/<slug>`` is not disallowed by
the site's robots.txt (only its ``/actions/`` subpaths are).
"""

import re
import time
from pathlib import Path
from typing import Any

from scrapling.fetchers import Fetcher

from .fetch import REQUEST_DELAY_SECONDS, USER_AGENT
from .parse import _GROUP_TO_GAME, _POSITION_TO_GAME

#: Player profile pages, by slug.
PROFILE_URL = "https://www.footballtransfers.com/en/players/{slug}"

#: The profile card's label/value pairs.
_FIELD_PATTERN = re.compile(
    r'<strong class="ttl">([^<]+)</strong>\s*<span class="txt[^"]*">(.*?)</span>',
    re.S,
)

#: JSON-LD job title, which uses the same position vocabulary as the feed
#: ("Defender (Center)"), and so maps through the same table.
_JOB_TITLE_PATTERN = re.compile(r'"jobTitle"\s*:\s*"([^"]+)"')

#: "23 years old (17 Aug 2002)"
_AGE_PATTERN = re.compile(r"(\d+)\s+years old")

#: "30 Jun 28" -> the contract's expiry year.
_EXPIRY_PATTERN = re.compile(r"(\d{1,2})\s+(\w{3})\s+(\d{2})\s*$")

#: An unknown slug does NOT 404: the site answers 200 and serves its
#: player index instead, whose <h1> gives it away. Without this check a
#: missing player reads as a profile that merely parsed badly.
_INDEX_PAGE_PATTERN = re.compile(r"<h1[^>]*>\s*All Football Players")


def is_player_index(html: str) -> bool:
    """Whether a fetched page is the player index rather than a profile.

    Args:
        html: The page HTML.

    Returns:
        True when the site substituted its index for a missing player.
    """
    return _INDEX_PAGE_PATTERN.search(html) is not None


def profile_url(slug: str) -> str:
    """Builds a player's profile URL.

    Args:
        slug: The site's player slug.

    Returns:
        The absolute profile URL.
    """
    return PROFILE_URL.format(slug=slug)


def fetch_profile(cache_dir: Path, slug: str) -> str | None:
    """Returns a player's profile HTML, fetching it at most once ever.

    Args:
        cache_dir: Directory holding cached HTML.
        slug: The site's player slug.

    Returns:
        The page HTML, or None when the site has no such player (404).

    Raises:
        RuntimeError: If the request fails for any other reason.
    """
    path = cache_dir / f"{slug}.html"
    if path.exists():
        return path.read_text(encoding="utf-8") or None

    time.sleep(REQUEST_DELAY_SECONDS)
    response = Fetcher.get(
        profile_url(slug), headers={"User-Agent": USER_AGENT}, timeout=30
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    if response.status == 404:
        # Cache the absence too, so a re-run does not ask again.
        path.write_text("", encoding="utf-8")
        return None
    if response.status != 200:
        raise RuntimeError(
            f"Fetching profile {slug} failed with HTTP {response.status}"
        )

    html = response.html_content
    path.write_text(html, encoding="utf-8")
    return html


def _game_position(job_title: str) -> str | None:
    """Maps a profile's job title onto the game's nine positions.

    Args:
        job_title: e.g. "Defender (Center)".

    Returns:
        The game position code, or None when unrecognised.
    """
    # "Defender (Center)" -> "defender-center", the feed's own key.
    key = re.sub(r"[^a-z]+", "-", job_title.lower()).strip("-")
    if key in _POSITION_TO_GAME:
        return _POSITION_TO_GAME[key]
    # Fall back on the leading word, which names the coarse group.
    coarse = {"goalkeeper": "1", "defender": "2", "midfielder": "3"}
    head = key.split("-")[0]
    if head in {"striker", "attacker", "forward"}:
        return "ST"
    return _GROUP_TO_GAME.get(coarse.get(head, ""))


def parse_profile(html: str) -> dict[str, Any]:
    """Extracts the attributes the master needs from a profile page.

    Args:
        html: The profile page HTML.

    Returns:
        A dict with any of age, position and expiry_year that the page
        carries; missing fields are simply absent.
    """
    fields: dict[str, str] = {}
    for match in _FIELD_PATTERN.finditer(html):
        value = re.sub(r"<[^>]+>", "", match.group(2))
        fields[match.group(1).strip()] = " ".join(value.split())

    result: dict[str, Any] = {}

    age_match = _AGE_PATTERN.search(fields.get("Age", ""))
    if age_match:
        result["age"] = int(age_match.group(1))

    job_title = _JOB_TITLE_PATTERN.search(html)
    if job_title:
        position = _game_position(job_title.group(1))
        if position:
            result["position"] = position

    expiry_match = _EXPIRY_PATTERN.search(fields.get("Contracted Until", ""))
    if expiry_match:
        # Two-digit years on this page are all 20xx.
        result["expiry_year"] = 2000 + int(expiry_match.group(3))

    return result

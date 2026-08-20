"""Sam's reviewed dataset becomes the master: rebuild from review.csv.

The review file (scraper/review.csv, version-controlled, hand-edited) is
authoritative: rows Sam deleted stay deleted, players he moved (club
changes, releases to free agency) stay moved, and his valuations win even
where the model disagrees. This stage:

1. Re-attaches internal ids (player_slug) by matching review rows back to
   the enriched table: by name+club, then by unique name (which follows
   players Sam moved between clubs), else a synthesised slug.
2. Normalises hand-edited fields: 'Free agent' club rows join the
   free-agent league; spreadsheet booleans (TRUE/False) are parsed;
   numerics are coerced with a report of anything unparseable.
3. Applies ADDITIONS from corrections.py (players missing from every
   source, e.g. Victor Munoz's July 2026 move to Liverpool).
4. Makes player_slug unique, since Capology occasionally issues one slug
   to two different players and the slug becomes the engine's player id.

Output: output/final_players.csv, the generator's input.

Usage (from scraper/, venv active):

    python -m pipeline.apply_review
"""

import re
import unicodedata
from pathlib import Path

import pandas as pd

from .corrections import ADDITIONS, BIRTH_DATES

ROOT = Path(__file__).resolve().parent.parent
REVIEW_CSV = ROOT / "review.csv"
ENRICHED_CSV = ROOT / "output" / "enriched_players.csv"
FINAL_CSV = ROOT / "output" / "final_players.csv"

#: Numeric columns coerced (and reported) on ingest.
_NUMERIC = ["age", "quality", "true_value_m", "salary_eur_m", "expiry_year"]


def slugify(name: str) -> str:
    """Synthesises a stable slug for rows with no enriched match."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + "-review"


def fold_accents(name: str) -> str:
    """Strips accents and case, for matching names spelled two ways.

    Sam types names as the club does, enrichment stores them as Capology
    does, and the two disagree over accents: 'Martin Dúbravka' against
    'Martin Dubravka'. Left unmatched he lost his id, his date of birth,
    and slipped past the post-review league union's duplicate check to
    appear at two clubs at once (Sam, 20/08/2026).

    Args:
        name: A player's name.

    Returns:
        The name folded to unaccented lower case.
    """
    return "".join(
        c for c in unicodedata.normalize("NFD", str(name))
        if unicodedata.category(c) != "Mn"
    ).lower().strip()


def parse_bool(value: object) -> bool:
    """Parses spreadsheet booleans (True/TRUE/true/1)."""
    return str(value).strip().lower() in {"true", "1", "yes"}


def attach_ids(review: pd.DataFrame, enriched: pd.DataFrame) -> pd.DataFrame:
    """Re-attaches player_slug, club_slug and date_of_birth to reviewed rows.

    The date of birth rides along on the same lookup as the slug: it is the
    only place exact ages can come from, review.csv carrying whole years
    only, and the squad age profile chart needs them (Sam, 20/08/2026). A
    row with no enriched match has no date of birth, and the chart falls
    back to the whole-year age for those players.

    Args:
        review: The hand-edited table.
        enriched: The machine table carrying slugs.

    Returns:
        review with player_slug, club_slug and date_of_birth columns.
    """
    by_name_club = enriched.set_index(["name", "club"])
    name_counts = enriched.name.value_counts()
    by_unique_name = enriched[
        enriched.name.map(name_counts) == 1
    ].set_index("name")

    # Last resort before synthesising: the same name spelled without its
    # accents. Only unambiguous folded names are used, so two players who
    # differ only by accent are never merged.
    folded = enriched.assign(_folded=enriched.name.map(fold_accents))
    folded_counts = folded._folded.value_counts()
    by_folded_name = folded[
        folded._folded.map(folded_counts) == 1
    ].set_index("_folded")

    slugs: list[str] = []
    club_slugs: list[str] = []
    births: list[str] = []
    synthesised = 0
    for row in review.itertuples():
        key = (row.name, row.club)
        if key in by_name_club.index:
            hit = by_name_club.loc[key]
            hit = hit.iloc[0] if isinstance(hit, pd.DataFrame) else hit
            slugs.append(str(hit.player_slug))
            club_slugs.append(str(hit.club_slug))
            births.append(_birth_date(hit))
        elif row.name in by_unique_name.index:
            # Sam moved this player: keep his identity, adopt the new club.
            hit = by_unique_name.loc[row.name]
            slugs.append(str(hit.player_slug))
            club_slugs.append(slugify(str(row.club)).removesuffix("-review"))
            births.append(_birth_date(hit))
            synthesised += 0
        elif fold_accents(row.name) in by_folded_name.index:
            # Same player, spelled with or without accents.
            hit = by_folded_name.loc[fold_accents(row.name)]
            slugs.append(str(hit.player_slug))
            club_slugs.append(slugify(str(row.club)).removesuffix("-review"))
            births.append(_birth_date(hit))
        else:
            slugs.append(slugify(str(row.name)))
            club_slugs.append(slugify(str(row.club)).removesuffix("-review"))
            births.append("")
            synthesised += 1

    result = review.copy()
    result["player_slug"] = slugs
    result["club_slug"] = club_slugs
    result["date_of_birth"] = births
    if synthesised > 0:
        print(f"NOTE: {synthesised} review rows had no enriched match; slugs synthesised")
    return result


def decollide_slugs(rows: pd.DataFrame) -> pd.DataFrame:
    """Makes player_slug unique, suffixing later rows with their club.

    Capology occasionally issues one slug to two different players. The
    live case is Nicolás González: a 24-year-old Manchester City midfielder
    and a 28-year-old Juventus winger, two real people sharing
    ``nicolas-gonzalez-35891`` (Sam, 20/08/2026). The slug becomes the
    engine's player id, which identifies players in the game, so a
    collision means buying one and getting the other.

    The first row to claim a slug keeps it, so existing ids are stable;
    every later row takes ``<slug>-<club_slug>``. review.csv is
    version-controlled and its order is stable, which makes this
    deterministic across runs.

    Args:
        rows: The reviewed table with slugs attached.

    Returns:
        The table with unique player_slug values.
    """
    result = rows.copy()
    seen: set[str] = set()
    slugs: list[str] = []
    collisions: list[str] = []
    for slug, club_slug in zip(result.player_slug, result.club_slug):
        slug = str(slug)
        if slug in seen:
            slug = f"{slug}-{club_slug}"
            collisions.append(slug)
        seen.add(slug)
        slugs.append(slug)
    result["player_slug"] = slugs
    if collisions:
        print(f"NOTE: {len(collisions)} slug collisions renamed: {', '.join(collisions)}")
    return result


def _birth_date(hit: "pd.Series[object]") -> str:
    """Reads an enriched row's date of birth as a plain YYYY-MM-DD string.

    Args:
        hit: The matched enriched row.

    Returns:
        The date as YYYY-MM-DD, or "" when the source has none. Enrichment
        stores it as a timestamp ("2001-09-05 00:00:00"), of which only the
        date half is wanted.
    """
    raw = getattr(hit, "date_of_birth", "")
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    return str(raw).strip()[:10]


def normalise(review: pd.DataFrame) -> pd.DataFrame:
    """Normalises hand-edited fields (see module docstring).

    Args:
        review: The reviewed table with ids attached.

    Returns:
        The normalised table.
    """
    result = review.copy()

    # Free-agency moves: club 'Free agent' implies the free-agent league.
    frees = result.club.str.strip().str.lower() == "free agent"
    result.loc[frees, "league"] = "free-agent"
    result.loc[frees, "club"] = "Free agent"
    result.loc[frees, "club_slug"] = "free-agent"
    result.loc[frees, "expiry_year"] = 2026

    result["homegrown"] = result.homegrown.map(parse_bool)

    for column in _NUMERIC:
        before = result[column].notna().sum()
        result[column] = pd.to_numeric(result[column], errors="coerce")
        lost = before - result[column].notna().sum()
        if lost > 0:
            print(f"WARNING: {lost} unparseable values in {column}")
    return result


#: Leagues added to the scrape AFTER Sam's review file was frozen, so their
#: players are unioned in from the enriched table rather than review.csv.
POST_REVIEW_LEAGUES = frozenset({"championship"})


def append_post_review_leagues(
    final: pd.DataFrame, enriched: pd.DataFrame
) -> tuple[pd.DataFrame, int]:
    """Unions enriched players from leagues absent from the review file.

    The review file (Sam's master) predates these leagues, so their rows
    are taken straight from enrichment, keyed so nothing already reviewed
    is duplicated.

    Args:
        final: The dataset built from the review file plus additions.
        enriched: The full enriched table.

    Returns:
        The extended dataset and the number of rows added.
    """
    existing = set(final.player_slug)
    extra = enriched[
        enriched.league.isin(POST_REVIEW_LEAGUES)
        & ~enriched.player_slug.isin(existing)
    ].copy()
    if extra.empty:
        return final, 0
    extra = extra.reindex(columns=final.columns)
    extra["homegrown"] = extra["homegrown"].map(parse_bool)
    return pd.concat([final, extra], ignore_index=True), len(extra)


def apply_birth_dates(final: pd.DataFrame) -> tuple[pd.DataFrame, int, list[str]]:
    """Applies the hand-entered dates of birth from corrections.py.

    Run after the additions and the league union so it reaches every row,
    including players who exist only because corrections.py added them.

    Args:
        final: The assembled dataset.

    Returns:
        A triple of (dataset, how many were applied, slugs that matched
        nothing). An entry matching nothing is reported rather than
        ignored: it means the player has been renamed or removed, and a
        silently dead correction is worse than a noisy one.
    """
    if not BIRTH_DATES:
        return final, 0, []
    result = final.copy()
    if "date_of_birth" not in result.columns:
        result["date_of_birth"] = ""
    known = set(result.player_slug)
    applied = 0
    for slug, date in BIRTH_DATES.items():
        if slug not in known:
            continue
        result.loc[result.player_slug == slug, "date_of_birth"] = date
        applied += 1
    return result, applied, sorted(set(BIRTH_DATES) - known)


def main() -> int:
    """Rebuilds the final dataset from the reviewed file."""
    review = pd.read_csv(REVIEW_CSV)
    enriched = pd.read_csv(ENRICHED_CSV)

    final = normalise(attach_ids(review, enriched))

    additions = pd.DataFrame(ADDITIONS)
    if not additions.empty:
        final = pd.concat([final, additions], ignore_index=True)
        for name in additions.name:
            print(f"Added: {name}")

    final, extra_count = append_post_review_leagues(final, enriched)
    if extra_count > 0:
        print(f"Unioned {extra_count} players from post-review leagues "
              f"({', '.join(sorted(POST_REVIEW_LEAGUES))})")

    final, dated, unknown = apply_birth_dates(final)
    if dated > 0:
        print(f"Applied {dated} hand-entered dates of birth")
    for slug in unknown:
        print(f"WARNING: hand-entered date of birth for unknown player: {slug}")

    # Last, so the reviewed rows, corrections.py's ADDITIONS and the
    # unioned post-review leagues are all covered.
    final = decollide_slugs(final)

    dropped = len(enriched) - len(review)
    final.to_csv(FINAL_CSV, index=False)
    print(
        f"Final dataset: {len(final)} players "
        f"({dropped} net removed in review, "
        f"{len(additions)} added, {extra_count} unioned)"
    )
    print(f"Wrote {FINAL_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

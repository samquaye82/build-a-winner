"""Home-grown status, derived from appearance histories.

The Premier League rule (per Sam, 10/07/2026): a player is home-grown if
registered with any English or Welsh club for three seasons (in effect 36
months) before turning 21, regardless of nationality.

The TM dataset's transfers table is too sparse to reconstruct careers
(35k recent rows only), so club history comes from appearances.csv: every
senior appearance since 2012 with a club id. That sees where a player
actually played, with two blind spots handled explicitly:

* Academy years produce no senior appearances, so English months are
  systematically undercounted. The qualifying threshold is therefore 24
  observed months rather than the nominal 36: a player with two seasons
  of senior English appearances before 21 almost always has the missing
  academy year behind them.
* Careers whose 16-21 window predates 2012 are invisible. For those (and
  players with no appearances at all), England/Wales citizenship decides.

An overrides CSV gets the final word for the edge cases a human spots at
review time.
"""

from datetime import date
from pathlib import Path

import pandas as pd

#: Observed senior months at English clubs required (see module docstring).
OBSERVED_MONTHS_REQUIRED = 24

#: Age window in which qualifying months accrue.
WINDOW_START_AGE = 16
WINDOW_END_AGE = 21

#: Citizenships that default to home-grown when history is invisible.
HOME_NATIONS = {"England", "Wales"}

#: Optional hand-maintained corrections: columns name, homegrown.
OVERRIDES_CSV = Path(__file__).resolve().parent / "hg_overrides.csv"


def english_welsh_club_ids(
    clubs: pd.DataFrame, competitions: pd.DataFrame
) -> set[int]:
    """Identifies clubs playing in English competitions (Welsh clubs in
    the English pyramid carry English domestic competitions).

    Args:
        clubs: TM clubs table.
        competitions: TM competitions table.

    Returns:
        Club ids whose domestic competition is English.
    """
    english = competitions[competitions.country_name == "England"]
    ids = set(english.competition_id)
    return set(clubs[clubs.domestic_competition_id.isin(ids)].club_id)


def _window(born: date) -> tuple[date, date]:
    """The [16th, 21st) birthday window, day clamped for leap safety."""
    day = min(born.day, 28)
    return (
        date(born.year + WINDOW_START_AGE, born.month, day),
        date(born.year + WINDOW_END_AGE, born.month, day),
    )


def observed_english_months(
    born: date,
    appearance_spans: list[tuple[date, date, int]],
    english_ids: set[int],
) -> float:
    """Months of the 16-21 window covered by English-club appearance spans.

    Args:
        born: Date of birth.
        appearance_spans: (first_seen, last_seen, club_id) per club stint.
        english_ids: Club ids classified as English/Welsh.

    Returns:
        Overlapping months (30.4-day months), summed across English spans.
    """
    window_start, window_end = _window(born)
    total = 0.0
    for first_seen, last_seen, club_id in appearance_spans:
        if club_id not in english_ids:
            continue
        overlap_start = max(first_seen, window_start)
        overlap_end = min(last_seen, window_end)
        if overlap_end > overlap_start:
            total += (overlap_end - overlap_start).days / 30.4
    return total


def window_visible(born: date, data_start: date, today: date) -> bool:
    """Whether the appearance data can see a meaningful part of the window.

    Args:
        born: Date of birth.
        data_start: First date covered by appearances data.
        today: Snapshot date.

    Returns:
        True when at least half the 16-21 window lies inside the data era.
    """
    window_start, window_end = _window(born)
    visible_start = max(window_start, data_start)
    visible_end = min(window_end, today)
    if visible_end <= visible_start:
        return False
    visible = (visible_end - visible_start).days
    return visible >= (window_end - window_start).days / 2


def load_overrides() -> dict[str, bool]:
    """Loads the hand-maintained override table, if present.

    Returns:
        Mapping of player display name to forced HG status.
    """
    if not OVERRIDES_CSV.exists():
        return {}
    table = pd.read_csv(OVERRIDES_CSV)
    return {
        str(row["name"]): bool(row["homegrown"]) for _, row in table.iterrows()
    }


def homegrown_table(
    players: pd.DataFrame,
    appearances: pd.DataFrame,
    clubs: pd.DataFrame,
    competitions: pd.DataFrame,
    today: date,
) -> pd.DataFrame:
    """Computes HG flags for every matched player.

    Args:
        players: Matched rows with tm_player_id, date_of_birth,
            country_of_citizenship and name columns.
        appearances: TM appearances with player_id, date, player_club_id.
        clubs: TM clubs table.
        competitions: TM competitions table.
        today: Snapshot date.

    Returns:
        DataFrame indexed like players with hg_months (observed English
        months), homegrown (bool) and hg_basis (audit trail).
    """
    english_ids = english_welsh_club_ids(clubs, competitions)
    overrides = load_overrides()

    appearances = appearances.copy()
    appearances["date"] = pd.to_datetime(appearances["date"]).dt.date
    data_start = appearances["date"].min()
    spans = (
        appearances.groupby(["player_id", "player_club_id"])["date"]
        .agg(["min", "max"])
        .reset_index()
    )
    spans_by_player: dict[int, list[tuple[date, date, int]]] = {}
    for row in spans.itertuples():
        spans_by_player.setdefault(int(row.player_id), []).append(
            (row.min, row.max, int(row.player_club_id))
        )

    months_out: list[float | None] = []
    flags: list[bool] = []
    basis: list[str] = []

    for row in players.itertuples():
        override = overrides.get(str(row.name))
        if override is not None:
            months_out.append(None)
            flags.append(override)
            basis.append("override")
            continue

        citizen = str(row.country_of_citizenship) in HOME_NATIONS
        if pd.isna(row.tm_player_id) or not isinstance(row.date_of_birth, str):
            months_out.append(None)
            flags.append(citizen)
            basis.append("citizenship-no-tm")
            continue

        born = date.fromisoformat(row.date_of_birth[:10])
        player_spans = spans_by_player.get(int(row.tm_player_id), [])
        months = observed_english_months(born, player_spans, english_ids)
        months_out.append(round(months, 1))

        if not window_visible(born, data_start, today) or not player_spans:
            # History invisible: citizenship decides.
            flags.append(citizen)
            basis.append("citizenship-window-invisible")
        elif months >= OBSERVED_MONTHS_REQUIRED:
            flags.append(True)
            basis.append("appearances")
        elif citizen:
            # Home-nations player below the observed threshold: the
            # unobserved academy years almost always make up the
            # difference (a young English pro with few senior minutes is
            # an academy product, not an import).
            flags.append(True)
            basis.append("citizenship-plus-appearances")
        else:
            flags.append(False)
            basis.append("appearances")

    result = pd.DataFrame(index=players.index)
    result["hg_months"] = months_out
    result["homegrown"] = flags
    result["hg_basis"] = basis
    return result

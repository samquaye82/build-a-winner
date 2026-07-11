"""Current free agents: contractless since 25/26, still unsigned.

Detection (Sam's observation, 11/07/2026: e.g. Salah): TM still files
these players at their old club, but Capology's 2026/27 squads no longer
contain them and their TM contracts have expired or vanished. So a free
agent is a TM player who:

* was active in 2025 at a club in one of the game's eight leagues,
* is absent from the Capology snapshot (by matched TM id, with a name
  guard against the few Capology rows we failed to match), and
* has a contract_expiration_date on or before 30/06/2026, or none at all.

Deceased players (whom TM also lists as clubless, with stale values) are
structurally excluded by the requirement of a current league club.

The stage appends the pool to matched_players.csv in the same schema
(league "free-agent"), idempotently, so enrichment prices them exactly
like everyone else. Wages are imputed there; the generator applies the
free-agent premium and zero fees.

Usage (from scraper/, venv active, after pipeline.compare):

    python -m pipeline.free_agents
"""

from datetime import date

import pandas as pd

from .compare import KAGGLE_DIR, OUT_CSV, TM_COMPETITIONS
from .matching import age_on_reference_date, ages_compatible, normalise_name

#: Keep the pool meaningful: minimum TM value and maximum age.
MIN_VALUE_EUR = 1_000_000
MAX_AGE = 36
POOL_SIZE = 60

#: Contracts ending on or before this date count as expired.
EXPIRY_CUTOFF = date(2026, 6, 30)

#: TM sub_position -> the game's nine positions.
_SUB_POSITION_MAP: dict[str, str] = {
    "Goalkeeper": "GK",
    "Centre-Back": "CB",
    "Left-Back": "LB",
    "Right-Back": "RB",
    "Defensive Midfield": "CM",
    "Central Midfield": "CM",
    "Attacking Midfield": "AM",
    "Left Midfield": "LW",
    "Right Midfield": "RW",
    "Left Winger": "LW",
    "Right Winger": "RW",
    "Second Striker": "ST",
    "Centre-Forward": "ST",
}


def find_free_agents(
    matched: pd.DataFrame, tm_players: pd.DataFrame
) -> pd.DataFrame:
    """Identifies the free-agent pool.

    Args:
        matched: The matched_players table (for known TM ids and the
            unmatched-name guard).
        tm_players: The TM players table.

    Returns:
        The top free agents by market value, in TM schema.
    """
    known_ids = set(matched.tm_player_id.dropna().astype(int))
    # Guard against listing players who are really employed but whom the
    # matcher missed: an unmatched Capology row with the same name AND a
    # compatible age blocks the candidate. Age matters: Lommel's
    # 22-year-old Mohamed Salah must not block the 34-year-old legend.
    unmatched = matched[matched.tm_player_id.isna()]
    unmatched_ages: dict[str, list[int]] = {}
    for row in unmatched.itertuples():
        unmatched_ages.setdefault(normalise_name(str(row.name)), []).append(
            int(row.age)
        )

    candidates = tm_players[
        (tm_players.last_season == 2025)
        & tm_players.current_club_domestic_competition_id.isin(TM_COMPETITIONS)
        & tm_players.market_value_in_eur.ge(MIN_VALUE_EUR)
    ].copy()
    candidates = candidates[~candidates.player_id.isin(known_ids)]

    def blocked_by_unmatched(row: pd.Series) -> bool:
        ages = unmatched_ages.get(normalise_name(str(row["name"])), [])
        tm_age = (
            age_on_reference_date(row["date_of_birth"])
            if isinstance(row["date_of_birth"], str)
            else None
        )
        return any(ages_compatible(a, tm_age) for a in ages)

    candidates = candidates[~candidates.apply(blocked_by_unmatched, axis=1)]

    expiry = pd.to_datetime(candidates.contract_expiration_date, errors="coerce")
    candidates = candidates[
        expiry.isna() | (expiry.dt.date <= EXPIRY_CUTOFF)
    ]

    candidates["fa_age"] = candidates.date_of_birth.map(
        lambda d: age_on_reference_date(d) if isinstance(d, str) else None
    )
    candidates = candidates[candidates.fa_age.notna()]
    candidates = candidates[candidates.fa_age <= MAX_AGE]
    candidates["fa_position"] = candidates.sub_position.map(_SUB_POSITION_MAP)
    candidates = candidates[candidates.fa_position.notna()]

    return candidates.nlargest(POOL_SIZE, "market_value_in_eur")


def to_matched_rows(free_agents: pd.DataFrame) -> pd.DataFrame:
    """Converts TM free-agent rows to the matched_players schema.

    Args:
        free_agents: Output of find_free_agents.

    Returns:
        Rows appendable to matched_players.csv (league "free-agent").
    """
    rows = pd.DataFrame(
        {
            "player_slug": "fa-" + free_agents.player_id.astype(int).astype(str),
            "name": free_agents.name,
            "league": "free-agent",
            "club_slug": "free-agent",
            "club": "Free agent",
            "country": free_agents.country_of_citizenship,
            "position": free_agents.fa_position,
            "position_detail": free_agents.sub_position,
            "age": free_agents.fa_age.astype(int),
            "salary_eur_m": pd.NA,  # imputed by the wage model
            "expiry_year": 2026,
            "signed_date": pd.NA,
            "release_eur_m": pd.NA,
            "loan": False,
            "verified": False,
            "tm_player_id": free_agents.player_id.astype(float),
            "match_layer": "free-agent",
            "tm_name": free_agents.name,
            "date_of_birth": free_agents.date_of_birth.astype(str).str[:10],
            "country_of_citizenship": free_agents.country_of_citizenship,
            "sub_position": free_agents.sub_position,
            "market_value_in_eur": free_agents.market_value_in_eur,
            "highest_market_value_in_eur": free_agents.highest_market_value_in_eur,
            "tm_expiry_year": pd.NA,
            "tm_age": free_agents.fa_age,
            "current_club_name": "Free agent",
        }
    )
    return rows


def main() -> int:
    """Appends the free-agent pool to matched_players.csv, idempotently."""
    matched = pd.read_csv(OUT_CSV)
    # Idempotence: drop any pool from a previous run before re-appending.
    matched = matched[matched.league != "free-agent"]

    tm_players = pd.read_csv(KAGGLE_DIR / "players.csv")
    pool = find_free_agents(matched, tm_players)
    rows = to_matched_rows(pool)

    combined = pd.concat([matched, rows], ignore_index=True)
    combined.to_csv(OUT_CSV, index=False)

    print(f"Free-agent pool: {len(rows)} players appended")
    print(
        rows.nlargest(15, "market_value_in_eur")[
            ["name", "position", "age", "market_value_in_eur"]
        ].to_string(index=False)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

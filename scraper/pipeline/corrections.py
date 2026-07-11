"""Hand corrections to the enriched dataset: THE file for review fixes.

Applied as the final enrichment step, so corrections survive every
pipeline re-run. Each entry matches a player by Capology slug and
overrides fields. Add entries as Sam's dataset review finds anomalies.

Known source defects this stage exists for: Capology's 2026/27 squad
pages carry the occasional stale row (players who left on frees still
listed at their old club).
"""

import pandas as pd

#: Field overrides by player_slug. Comments give the reason and date.
CORRECTIONS: dict[str, dict[str, object]] = {
    # Robertson left Liverpool on a free (contract expired 2026) and
    # signed for Tottenham. Stale Capology row had him at Liverpool with
    # a 2027 expiry. Two-year deal assumed (age 32). Sam, 11/07/2026.
    "andrew-robertson-34404": {
        "club": "Tottenham Hotspur",
        "club_slug": "tottenham-hotspur",
        "league": "premier-league",
        "expiry_year": 2028,
        "salary_eur_m": 8.0,
        "salary_estimated": True,
    },
    # Konaté left Liverpool on a free and signed for Real Madrid.
    # Five-year deal assumed (age 27). Sam, 11/07/2026.
    "ibrahima-konate-36305": {
        "club": "Real Madrid",
        "club_slug": "real-madrid",
        "league": "la-liga",
        "expiry_year": 2031,
        "salary_eur_m": 11.0,
        "salary_estimated": True,
    },
}


def apply_corrections(players: pd.DataFrame) -> pd.DataFrame:
    """Applies the hand-correction table.

    Args:
        players: The enriched player table.

    Returns:
        The corrected table; unknown slugs are reported, not fatal.
    """
    result = players.copy()
    for slug, overrides in CORRECTIONS.items():
        mask = result.player_slug == slug
        if not mask.any():
            print(f"WARNING: correction target not found: {slug}")
            continue
        for field, value in overrides.items():
            result.loc[mask, field] = value
        print(f"Corrected {slug}: {', '.join(overrides)}")
    return result

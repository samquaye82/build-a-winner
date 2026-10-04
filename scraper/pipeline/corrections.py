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


#: Players missing from every source, appended by pipeline.apply_review.
#: Victor Munoz: Osasuna attacker, transferred to Liverpool July 2026;
#: absent from both clubs' 26/27 Capology pages (Sam, 12/07/2026).
#: Quality and salary are Claude's estimates pending Sam's adjustment;
#: the value is now the realised fee. Note he is a different player from
#: the Iker Munoz who remains at Osasuna in review.csv: same surname,
#: same club, a year apart in age (Sam, 13/08/2026).
ADDITIONS: list[dict[str, object]] = [
    {
        "player_slug": "victor-munoz-osasuna",
        "name": "Victor Muñoz",
        "league": "premier-league",
        "club": "Liverpool",
        "club_slug": "liverpool",
        "country": "Spain",
        "position": "LW",
        "age": 22,
        "quality": 78,
        "quality_source": "manual",
        # The realised fee, confirmed by the summer 2026 transfer sweep
        # (Osasuna to Liverpool, 01/07/2026). Sam's rule is that a price
        # actually paid beats an estimate (Sam, 13/08/2026).
        "true_value_m": 40.0,
        "tm_value_m": None,
        "salary_eur_m": 3.5,
        "salary_estimated": True,
        "expiry_year": 2031,
        "homegrown": False,
        "hg_basis": "manual",
    },
]


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


#: Dates of birth for players no source carries one for, found by hand
#: (Sam, 20/08/2026). Keyed by player_slug, as ISO YYYY-MM-DD.
#:
#: The game ages a player on his real birthday; without a date of birth it
#: has to estimate one from his whole-year age.
#: These fill the gaps at the clubs Sam follows most closely. The generator
#: cross-checks every date against the recorded age and drops any that
#: disagree by more than eighteen months, so a typo here shows up as a
#: dropped date rather than a wrong dot.
BIRTH_DATES: dict[str, str] = {
    # Chelsea
    "denner-39503": "2008-02-25",
    "emanuel-emegha-37655": "2003-02-03",
    # Liverpool
    "lewis-koumas-review": "2005-09-19",
    "james-mcconnell-review": "2004-09-13",
    "luke-chambers-review": "2004-06-24",
    "victor-munoz-osasuna": "2004-07-13",
    # Manchester City
    "jeremy-monga-review": "2009-07-10",
    "pierce-charles-review": "2005-07-21",
    # Tottenham
    "min-hyeok-yang-38823": "2006-04-16",
    "savio-38087": "2004-04-10",
    # Martin Dubravka is not listed: folding accents in apply_review
    # reunites Sam's "Martin Dúbravka" with the enriched row that already
    # carries his date, and removes his duplicate at Burnley with it.
}

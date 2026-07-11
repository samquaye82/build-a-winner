"""Enrichment CLI: ratings, quality, true value, wages and HG status.

Reads output/matched_players.csv (from pipeline.compare) and writes
output/enriched_players.csv: the complete game-ready dataset, one row per
player, pending only the TS codegen stage.

Usage (from scraper/, venv active):

    python -m pipeline.enrich
"""

from datetime import date
from pathlib import Path

import pandas as pd

from .homegrown import homegrown_table
from .ratings import join_ratings, load_ratings
from .value_model import (
    add_quality,
    add_true_value,
    add_wages,
    divergence_report,
)

ROOT = Path(__file__).resolve().parent.parent
KAGGLE_DIR = ROOT / "cache" / "kaggle"
IN_CSV = ROOT / "output" / "matched_players.csv"
OUT_CSV = ROOT / "output" / "enriched_players.csv"

#: Snapshot date used for HG month accrual.
TODAY = date(2026, 7, 1)


def main() -> int:
    """Runs the full enrichment and prints the review reports."""
    players = pd.read_csv(IN_CSV)

    # 1. FC 26 ratings.
    players = join_ratings(players, load_ratings())
    joined = players.fc26_rating.notna()
    print(f"FC 26 ratings joined: {joined.sum()}/{len(players)} ({joined.mean():.1%})")
    print(players.rating_join_layer.value_counts(dropna=False).to_string())

    # 2. Quality, true value, wages.
    players = add_quality(players)
    print("\nQuality sources:")
    print(players.quality_source.value_counts().to_string())

    players = add_true_value(players)
    with_tm = players.dropna(subset=["tm_value_m"])
    error = (
        (with_tm.true_value_m - with_tm.tm_value_m).abs()
        / with_tm.tm_value_m.clip(lower=1)
    ).median()
    print(f"\nValue model vs TM: median abs error {error:.1%}")
    print("\nBiggest divergences (model vs market, EUR 10m+ players):")
    print(divergence_report(players).to_string(index=False))

    estimated_before = players.salary_eur_m.isna().sum()
    players = add_wages(players)
    print(f"\nWages imputed for {estimated_before} players (flagged salary_estimated)")

    # 3. Home-grown status (from appearance histories; see homegrown.py).
    appearances = pd.read_csv(
        KAGGLE_DIR / "appearances.csv",
        usecols=["player_id", "date", "player_club_id"],
    )
    clubs = pd.read_csv(KAGGLE_DIR / "clubs.csv")
    competitions = pd.read_csv(KAGGLE_DIR / "competitions.csv")
    hg = homegrown_table(players, appearances, clubs, competitions, TODAY)
    players = players.join(hg)
    print(f"\nHome-grown players: {players.homegrown.sum()}")
    print("HG basis:")
    print(players.hg_basis.value_counts().to_string())
    lfc = players[players.club_slug == "liverpool"].sort_values(
        "homegrown", ascending=False
    )
    print("\nLiverpool HG check (observed English months, ages 16-21):")
    print(
        lfc[["name", "age", "country", "hg_months", "hg_basis", "homegrown"]]
        .to_string(index=False)
    )

    players.to_csv(OUT_CSV, index=False)
    print(f"\nWrote {len(players)} players to {OUT_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

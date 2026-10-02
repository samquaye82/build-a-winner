"""Re-deriving every player's value from his rating and age.

Sam's baseline (02/10/2026): a player's value follows his EA FC rating and
his age, and nothing else, on one curve for the whole database:

    value = min(TOP_VALUE x RATING_STEP ** (rating - top rating) x age factor,
                TOP_VALUE)

A prime-age (25-27) player at the database's top rating is worth exactly
TOP_VALUE, and nobody is worth more: younger stars the youth premium would
lift above it are capped there (Sam, 03/10/2026, chosen over scaling the
curve so its maximum is TOP_VALUE, which cut the database's total value by
a third). Each rating point is worth RATING_STEP (about +26%), and the age
factors price youth up and age down; both come from a fit of Transfermarkt
values on rating and age bands across the master, with the under-21
premium softened from the fitted x2.67 to x1.8 by Sam.

Contract length is deliberately absent: the game already applies it on top
of this baseline, discounting sale prices and market fees by the months a
contract has left, so including it here would count it twice.

Realised transfer fees still win (Sam's standing rule): every player who
moved for a disclosed fee in the summer 2026 sweep keeps that fee as his
value, whatever the curve says.

Values are then rounded to transfer-fee-like numbers (round_game_value).

Read-only unless ``--write`` is passed.

Usage (from scraper/, venv active):

    python -m pipeline.rebaseline_values
    python -m pipeline.rebaseline_values --write
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

from .value_model import round_game_value

ROOT = Path(__file__).resolve().parent.parent
REVIEW_CSV = ROOT / "review.csv"
RECONCILIATION_CSV = ROOT / "output" / "reconciliation_2026.csv"

#: A prime-age player at the top rating is worth this, and it is the
#: ceiling for everyone (EUR m).
TOP_VALUE = 250.0

#: Value multiple per rating point (Transfermarkt fit: x1.260).
RATING_STEP = 1.26

#: Value multiples by age band, upper age inclusive; 25-27 is the anchor.
#: Fitted on Transfermarkt values, under-21s softened to x1.8 by Sam.
AGE_FACTORS: tuple[tuple[int, float], ...] = (
    (21, 1.8),
    (24, 1.29),
    (27, 1.0),
    (29, 0.79),
    (31, 0.48),
    (33, 0.33),
    (200, 0.17),
)

#: Reconciliation categories whose fee is a completed permanent move.
#: Departures and free-agent clean-ups carry fees for players no longer in
#: the master's view of the move, so they are excluded.
_REALISED_CATEGORIES = frozenset(
    {"confirmed", "fee_gap", "missing_player", "stale_club"}
)


def age_factor(age: int) -> float:
    """The value multiple for a player's age.

    Args:
        age: Age in whole years.

    Returns:
        The multiple from AGE_FACTORS.
    """
    for upper, factor in AGE_FACTORS:
        if age <= upper:
            return factor
    return AGE_FACTORS[-1][1]


def baseline_values(quality: pd.Series, age: pd.Series) -> pd.Series:
    """Unrounded values on the curve: a prime-age player at the top rating
    is worth TOP_VALUE, and no one more.

    Args:
        quality: Ratings, 0-100.
        age: Ages in whole years, aligned with `quality`.

    Returns:
        Values in EUR m, aligned with the inputs.
    """
    curve = TOP_VALUE * RATING_STEP ** (quality - quality.max()) * age.map(age_factor)
    return curve.clip(upper=TOP_VALUE)


def realised_fees(reconciliation: pd.DataFrame) -> dict[str, float]:
    """Disclosed fees for completed permanent moves, by player name.

    Args:
        reconciliation: output/reconciliation_2026.csv.

    Returns:
        Player name to fee in EUR m. A name with two different fees is
        dropped rather than guessed between.
    """
    moves = reconciliation[
        reconciliation.category.isin(_REALISED_CATEGORIES)
        & (pd.to_numeric(reconciliation.fee_eur_m, errors="coerce") > 0)
    ]
    fees = pd.to_numeric(moves.fee_eur_m, errors="coerce").groupby(moves.player)
    return {name: float(f.iloc[0]) for name, f in fees if f.nunique() == 1}


def rebaseline(master: pd.DataFrame, fees: dict[str, float]) -> pd.Series:
    """Every master row's new value, rounded.

    Args:
        master: The review master with quality and age.
        fees: Output of realised_fees().

    Returns:
        New true_value_m per row, aligned with `master`. A realised fee is
        kept as published; everyone else is on the rounded curve.
    """
    quality = pd.to_numeric(master.quality).astype(float)
    age = pd.to_numeric(master.age).astype(int)
    curve = pd.Series(
        round_game_value(baseline_values(quality, age).to_numpy()), index=master.index
    )
    fee = master["name"].map(fees)
    return fee.where(fee.notna(), curve)


def main() -> int:
    """Reports, and with --write applies, the new values to the master.

    Returns:
        Process exit status.
    """
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--write", action="store_true", help="write review.csv")
    args = parser.parse_args()

    master = pd.read_csv(REVIEW_CSV, keep_default_na=False, dtype=str)
    fees = realised_fees(pd.read_csv(RECONCILIATION_CSV, keep_default_na=False))
    new = rebaseline(master, fees)
    old = pd.to_numeric(master.true_value_m, errors="coerce")

    kept = master["name"].map(fees).notna()
    print(f"{len(master)} players: {int(kept.sum())} keep a realised fee, "
          f"{int((~kept).sum())} on the curve")
    print(f"Total value: EUR {old.sum():,.0f}m -> EUR {new.sum():,.0f}m")
    report = master[["name", "club", "age", "quality"]].assign(old=old, new=new)
    print("\nMost valuable:")
    print(report.sort_values("new", ascending=False).head(15).to_string(index=False))
    print("\nLiverpool:")
    print(report[report.club == "Liverpool"].sort_values("new", ascending=False).to_string(index=False))

    if not args.write:
        print("\nRead-only run: pass --write to update review.csv")
        return 0
    master["true_value_m"] = new.map(lambda v: f"{v:.1f}")
    master.to_csv(REVIEW_CSV, index=False, lineterminator="\r\n")
    print(f"\nWrote values for {len(master)} players to {REVIEW_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

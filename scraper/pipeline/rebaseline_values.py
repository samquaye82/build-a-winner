"""Re-deriving every player's value from his rating and age.

Sam's baseline (02/10/2026): a player's value follows his EA FC rating and
his age, and nothing else, on one curve for the whole database:

    value = min(TOP_VALUE x RATING_STEP ** (rating - top rating) x age factor,
                TOP_VALUE)

Positional rules then apply (Sam, 03/10/2026): the most valuable
goalkeeper is worth EUR 80m, defender EUR 120m and midfielder EUR 170m,
each group's curve scaled so its top player is exactly that and everyone
else in proportion. A prime-age forward at the top rating is worth
EUR 200m (FORWARD_ANCHOR), and no forward more than EUR 250m.

A prime-age player at the database's top rating is worth exactly
TOP_VALUE, and nobody is worth more: younger stars the youth premium would
lift above it are capped there (Sam, 03/10/2026, chosen over scaling the
curve so its maximum is TOP_VALUE, which cut the database's total value by
a third). Each rating point is worth RATING_STEP (about +26%), and the age
factors price youth up and age down; both come from a fit of Transfermarkt
values on rating and age bands across the master, with the under-21
premium softened from the fitted x2.67 to x1.8 by Sam.

Age is smooth, not banded (Sam, 03/10/2026). Each fitted band's factor
sits at the band's mid-age, and between those points the factor changes by
a constant percentage per year, so a birthday never moves a value by a
band's worth at once: banded, Willian Pacho was worth EUR 80m more than
William Saliba, born seven months earlier, mostly for sitting on the young
side of a band edge. Ages are exact, from date of birth on the day the
game opens, so seven months counts as seven months.

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

from datetime import date

from .apply_ratings import with_birthdates
from .value_model import round_game_value

ROOT = Path(__file__).resolve().parent.parent
REVIEW_CSV = ROOT / "review.csv"
RECONCILIATION_CSV = ROOT / "output" / "reconciliation_2026.csv"
FINAL_CSV = ROOT / "output" / "final_players.csv"

#: Ages are measured on the day the game opens: the January 2027 window.
AGE_REFERENCE_DATE = date(2027, 1, 1)

#: A player with no date of birth is assumed this far into his year of age.
UNKNOWN_BIRTHDAY_OFFSET = 0.5

#: A prime-age player at the top rating is worth this, and it is the
#: ceiling for everyone (EUR m).
TOP_VALUE = 250.0

#: Value multiple per rating point (Sam, 03/10/2026). Transfermarkt's
#: fit was x1.260, but Sam judged the flatter x1.138 closer to the real
#: market: it is the step that values Cody Gakpo at EUR 70m.
RATING_STEP = 1.138

#: Positional groups, for the positional caps.
POSITION_GROUPS: dict[str, str] = {
    "GK": "GK",
    "RB": "DEF",
    "LB": "DEF",
    "CB": "DEF",
    "CM": "MID",
    "AM": "MID",
    "RW": "FWD",
    "LW": "FWD",
    "ST": "FWD",
}

#: The most valuable player in each positional group, in EUR m (Sam,
#: 03/10/2026). Goalkeepers, defenders and midfielders: each group's curve
#: is scaled so its most valuable player is exactly its cap, everyone else
#: in proportion. Forwards: see FORWARD_ANCHOR.
POSITION_CAPS: dict[str, float] = {"GK": 80.0, "DEF": 120.0, "MID": 170.0, "FWD": TOP_VALUE}

#: A prime-age forward at the top rating is worth this (EUR m), and young
#: stars the age premium lifts higher stop at the forwards' cap (Sam,
#: 03/10/2026). The midpoint between leaving forwards on the TOP_VALUE
#: anchor (which put 57 forwards in the top 100) and scaling them to their
#: most valuable player (which let Lamine Yamal's youth premium cut every
#: forward by 37%, Erling Haaland to EUR 160m).
FORWARD_ANCHOR = 200.0

#: Value multiples at each fitted band's centre, youngest first. Fitted on
#: Transfermarkt values by whole-year band (<=21, 22-24, 25-27, 28-29,
#: 30-31, 32-33, 34+), under-21s softened to x1.8 by Sam. A whole-year band
#: spans exact ages from its first birthday to its last plus a year, so
#: 25-27 is 25.0 to 28.0 and centred on 26.5, the anchor; the open-ended
#: bands sit at 19.5 and 35.5.
AGE_KNOTS: tuple[tuple[float, float], ...] = (
    (19.5, 1.8),
    (23.5, 1.29),
    (26.5, 1.0),
    (29.0, 0.79),
    (31.0, 0.48),
    (33.0, 0.33),
    (35.5, 0.17),
)

#: Reconciliation categories whose fee is a completed permanent move.
#: Departures and free-agent clean-ups carry fees for players no longer in
#: the master's view of the move, so they are excluded.
_REALISED_CATEGORIES = frozenset(
    {"confirmed", "fee_gap", "missing_player", "stale_club"}
)


def age_factor(age: float) -> float:
    """The value multiple for a player's exact age.

    Between two knots the multiple changes by a constant percentage per
    year (interpolated on a log scale, as suits a multiplier); younger than
    the first knot or older than the last, it holds that knot's value.

    Args:
        age: Exact age in years, e.g. 25.2.

    Returns:
        The multiple.
    """
    first_age, first_factor = AGE_KNOTS[0]
    if age <= first_age:
        return first_factor
    for (low_age, low), (high_age, high) in zip(AGE_KNOTS, AGE_KNOTS[1:]):
        if age <= high_age:
            share = (age - low_age) / (high_age - low_age)
            return float(np.exp(np.log(low) + share * (np.log(high) - np.log(low))))
    return AGE_KNOTS[-1][1]


def exact_age(birthdate: str, whole_years: int, on: date = AGE_REFERENCE_DATE) -> float:
    """A player's age in years, to the day where his birth date is known.

    Args:
        birthdate: ISO date of birth, or an empty string.
        whole_years: His whole-year age in the master, the fallback.
        on: The day to measure at.

    Returns:
        Exact age; without a usable birth date, whole_years plus
        UNKNOWN_BIRTHDAY_OFFSET.
    """
    try:
        year, month, day = (int(part) for part in str(birthdate)[:10].split("-"))
        born = date(year, month, day)
    except ValueError:
        return whole_years + UNKNOWN_BIRTHDAY_OFFSET
    return (on - born).days / 365.25


def baseline_values(
    quality: pd.Series,
    age: pd.Series,
    position: pd.Series | None = None,
    on_curve: pd.Series | None = None,
) -> pd.Series:
    """Unrounded values on the curve.

    A prime-age player at the top rating is worth TOP_VALUE, and no one
    more. With positions given, the positional rules then apply: a
    prime-age forward at the top rating is worth FORWARD_ANCHOR, capped at
    the forwards' cap, and every other group is scaled so its most valuable
    player on the curve is exactly the group's cap.

    Args:
        quality: Ratings, 0-100.
        age: Exact ages in years, aligned with `quality`.
        position: Positions (GK, CB, ST, ...), aligned; None for no caps.
        on_curve: Which rows take a curve value (False for realised
            fees); a group is scaled to its top on-curve player. None
            means every row.

    Returns:
        Values in EUR m, aligned with the inputs.
    """
    curve = TOP_VALUE * RATING_STEP ** (quality - quality.max()) * age.map(age_factor)
    if position is None:
        return curve.clip(upper=TOP_VALUE)
    group = position.map(POSITION_GROUPS)
    eligible = pd.Series(True, index=curve.index) if on_curve is None else on_curve
    result = curve.clip(upper=TOP_VALUE)
    for name, cap in POSITION_CAPS.items():
        members = group == name
        if name == "FWD":
            result[members] = (curve[members] * (FORWARD_ANCHOR / TOP_VALUE)).clip(upper=cap)
            continue
        top = curve[members & eligible].max()
        if pd.notna(top) and top > 0:
            result[members] = curve[members] * (cap / top)
    return result


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
        master: The review master with quality, age, position and
            date_of_birth (see apply_ratings.with_birthdates; empty where
            unknown).
        fees: Output of realised_fees().

    Returns:
        New true_value_m per row, aligned with `master`. A realised fee is
        kept as published; everyone else is on the rounded curve.
    """
    quality = pd.to_numeric(master.quality).astype(float)
    age = pd.Series(
        [
            exact_age(dob, int(whole))
            for dob, whole in zip(master.date_of_birth, master.age)
        ],
        index=master.index,
    )
    fee = master["name"].map(fees)
    values = baseline_values(quality, age, master.position, on_curve=fee.isna())
    curve = pd.Series(round_game_value(values.to_numpy()), index=master.index)
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
    final = pd.read_csv(FINAL_CSV, keep_default_na=False, dtype=str)
    fees = realised_fees(pd.read_csv(RECONCILIATION_CSV, keep_default_na=False))
    new = rebaseline(with_birthdates(master, final), fees)
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

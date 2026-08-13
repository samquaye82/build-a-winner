"""Applying the reviewed reconciliation to the player master.

Takes `output/reconciliation_2026.csv` after Sam has been through it and
writes the decisions into `review.csv`. His edits are authoritative:

* ``action`` says what to do; "No change" means leave the row alone.
* ``confidence`` of "incorrect classification" marks a finding he has
  rejected (usually mistaken identity), and is never applied.
* Deleting a row from the CSV means the same as "No change".

New players need attributes the transfer feed does not carry (quality,
salary, contract length), so those are imputed with the same machinery
the main enrichment uses: EA FC 26 ratings where the player is found,
otherwise least-squares fits taken over the existing master, whose 4,000
rows supply the shape. Everything imputed is flagged in the existing
`quality_source`, `salary_estimated` and `hg_basis` columns so it is
never mistaken for authored data.

Usage (from scraper/, venv active):

    python -m pipeline.apply_reconciliation --dry-run   # report only
    python -m pipeline.apply_reconciliation             # writes review.csv
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

from .corrections import ADDITIONS
from .matching import normalise_name
from .ratings import load_ratings
from .reconcile import LOANS_CSV, OUT_CSV as DECISIONS_CSV, REVIEW_CSV, TRANSFERS_CSV
from .value_model import add_wages, round_game_value

ROOT = Path(__file__).resolve().parent.parent

#: Age and position recovered from Wikipedia for the feed's thin rows,
#: written by pipeline.wikipedia. Optional: absent, the stage simply
#: holds those signings back as before.
WIKIPEDIA_CSV = ROOT / "output" / "wikipedia_attributes.csv"

#: Actions that remove a player from the dataset entirely.
_REMOVE_ACTIONS = frozenset(
    {
        "Remove from dataset",
        "Remove from squad (loaned out)",
        "Remove from free-agent pool",
    }
)

#: Actions that move a player to a different club.
_MOVE_ACTIONS = frozenset({"Change club", "Change club (loan for 26/27)"})

#: Marker Sam writes in the confidence column to reject a finding.
_REJECTED = "incorrect classification"

#: Contract length granted to a new signing, by age. Mirrors the
#: assumptions already used by hand in corrections.py: long deals for the
#: young, short ones for players the wrong side of thirty.
_CONTRACT_YEARS: tuple[tuple[int, int], ...] = (
    (21, 5),
    (25, 5),
    (29, 4),
    (32, 2),
    (99, 1),
)

#: The season the window feeds into; contract expiry counts from here.
_SEASON_START_YEAR = 2026

#: Quality floor and ceiling, matching the value model's scale.
_QUALITY_FLOOR, _QUALITY_CEILING = 45, 99

#: The age range a professional squad player can plausibly fall in.
#: Anything outside is a source error, not a footballer.
MIN_PLAUSIBLE_AGE, MAX_PLAUSIBLE_AGE = 15, 45


def contract_expiry(age: float) -> int:
    """Returns the expiry year for a new signing of a given age.

    Args:
        age: The player's age at the window.

    Returns:
        The calendar year the contract runs to.
    """
    for threshold, years in _CONTRACT_YEARS:
        if age <= threshold:
            return _SEASON_START_YEAR + years
    return _SEASON_START_YEAR + 1


def load_decisions() -> pd.DataFrame:
    """Loads Sam's reviewed reconciliation, dropping what he rejected.

    Returns:
        The decisions that are actually to be applied.
    """
    decisions = pd.read_csv(DECISIONS_CSV).fillna("")
    live = decisions[
        (decisions.action != "No change")
        & (decisions.confidence != _REJECTED)
    ]
    return live


def source_attributes() -> pd.DataFrame:
    """Collects per-player attributes from both sweeps.

    Returns:
        One row per player name, with age, position, country and fee.
    """
    transfers = pd.read_csv(TRANSFERS_CSV)
    loans = pd.read_csv(LOANS_CSV)
    if "fee_eur_m" not in loans:
        loans["fee_eur_m"] = np.nan
    columns = ["player_name", "age", "position", "country", "fee_eur_m"]
    combined = pd.concat([transfers[columns], loans[columns]])
    # Prefer the row that actually carries an age and a position.
    combined = combined.sort_values(
        ["age", "position"], na_position="last"
    ).drop_duplicates("player_name")
    combined = combined.set_index("player_name")

    # Discard impossible ages before the Wikipedia merge, not after: an
    # age of 54 is not a value to be preserved, and leaving it in place
    # would block the correct age from filling the gap.
    combined.loc[
        ~combined.age.between(MIN_PLAUSIBLE_AGE, MAX_PLAUSIBLE_AGE), "age"
    ] = np.nan

    # Wikipedia fills the age and position the feed omits for its long
    # tail (see pipeline.wikipedia). It only ever fills blanks: where the
    # feed published a value, the feed's own value stands.
    if WIKIPEDIA_CSV.exists():
        recovered = pd.read_csv(WIKIPEDIA_CSV).set_index("player_name")
        shared = combined.index.intersection(recovered.index)
        for column in ("age", "position"):
            combined.loc[shared, column] = combined.loc[shared, column].fillna(
                recovered.loc[shared, column]
            )
    return combined


def impute_quality(
    new_players: pd.DataFrame, master: pd.DataFrame
) -> pd.DataFrame:
    """Fills quality for new players, FC 26 ratings first.

    Where the player is not in the ratings file, quality is fitted from
    the master's own relationship between quality, value and age, which
    is the same shape the value model fits; the master is used as the
    training set because it already carries both for every player.

    Args:
        new_players: Rows to fill, with age and true_value_m.
        master: The existing player master.

    Returns:
        `new_players` with `quality` and `quality_source` set.
    """
    result = new_players.copy()
    ratings = load_ratings()
    by_name = (
        ratings.dropna(subset=["fc26_rating"])
        .drop_duplicates("name_key")
        .set_index("name_key")
        .fc26_rating
    )
    # Bracket access throughout: `frame.name` collides with pandas' own
    # `.name` attribute and does not reliably reach the column.
    keys = result["name"].map(normalise_name)
    result["quality"] = keys.map(by_name)
    result["quality_source"] = np.where(result.quality.notna(), "fc26", None)

    # Fit quality ~ log(value) + age + age^2 over the master.
    trained = master.dropna(subset=["quality", "true_value_m", "age"])
    design = np.column_stack(
        [
            np.log1p(trained.true_value_m),
            trained.age,
            trained.age**2,
            np.ones(len(trained)),
        ]
    )
    coefficients, *_ = np.linalg.lstsq(design, trained.quality, rcond=None)

    gap = result.quality.isna() & result.true_value_m.notna() & result.age.notna()
    if gap.any():
        predict = np.column_stack(
            [
                np.log1p(result.loc[gap, "true_value_m"]),
                result.loc[gap, "age"],
                result.loc[gap, "age"] ** 2,
                np.ones(int(gap.sum())),
            ]
        )
        result.loc[gap, "quality"] = predict @ coefficients
        result.loc[gap, "quality_source"] = "imputed_value"

    # Anything still empty (a loanee with no fee and no rating) falls back
    # to the master's median for the position, which is the value model's
    # own last resort.
    medians = master.groupby("position").quality.median()
    still = result.quality.isna()
    if still.any():
        result.loc[still, "quality"] = (
            result.loc[still, "position"].map(medians).fillna(master.quality.median())
        )
        result.loc[still, "quality_source"] = "imputed_median"

    result["quality"] = (
        result.quality.clip(_QUALITY_FLOOR, _QUALITY_CEILING).round().astype(int)
    )
    return result


def impute_value(
    new_players: pd.DataFrame, master: pd.DataFrame
) -> pd.DataFrame:
    """Fills true value for new players without a fee.

    Players who arrived for a disclosed fee keep that fee as their value,
    which is Sam's decision (13/08/2026): the realised price is better
    evidence than any model. Loanees and undisclosed moves are predicted
    from quality and age, fitted over the master.

    Args:
        new_players: Rows to fill, with quality and age.
        master: The existing player master.

    Returns:
        `new_players` with `true_value_m` set for every row.
    """
    result = new_players.copy()
    trained = master.dropna(subset=["quality", "true_value_m", "age"])
    design = np.column_stack(
        [trained.quality, trained.quality**2, trained.age, np.ones(len(trained))]
    )
    coefficients, *_ = np.linalg.lstsq(
        design, np.log1p(trained.true_value_m), rcond=None
    )

    gap = result.true_value_m.isna()
    if gap.any():
        predict = np.column_stack(
            [
                result.loc[gap, "quality"],
                result.loc[gap, "quality"] ** 2,
                result.loc[gap, "age"],
                np.ones(int(gap.sum())),
            ]
        )
        values = np.expm1(predict @ coefficients).clip(0.1, None)
        result.loc[gap, "true_value_m"] = round_game_value(values)
    return result


def build_new_players(
    decisions: pd.DataFrame, master: pd.DataFrame, attributes: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Builds master rows for players the reconciliation wants added.

    Args:
        decisions: The live decisions.
        master: The existing player master.
        attributes: Per-player attributes from the sweeps.

    Returns:
        A pair of (new rows, rows skipped for want of age or position).
    """
    wanted = decisions[
        (decisions.action == "Add player")
        | ((decisions.category == "loan_in") & (decisions.master_club == ""))
    ].drop_duplicates("player")

    # corrections.py appends its ADDITIONS to the final dataset without a
    # duplicate check, so anyone already hand-added there must not be
    # added again here (Victor Munoz, whose Osasuna-to-Liverpool move
    # this sweep also found).
    hand_added = {normalise_name(str(entry["name"])) for entry in ADDITIONS}
    wanted = wanted[~wanted.player.map(normalise_name).isin(hand_added)]

    # The stage has to be safe to run twice: applying it to an already
    # updated master must not add the same signing a second time.
    already = {
        (normalise_name(str(name)), str(club))
        for name, club in zip(master["name"], master["club"])
    }
    if not wanted.empty:
        keep = [
            (normalise_name(str(row.player)), str(row.proposed_club)) not in already
            for row in wanted.itertuples()
        ]
        wanted = wanted[keep]

    # The decisions carry their own fee column; the sweep's is the one
    # with the per-player detail, so it wins.
    rows = wanted.drop(columns=["fee_eur_m"]).join(attributes, on="player")
    leagues = (
        master.drop_duplicates("club").set_index("club").league
    )

    # The source occasionally attaches the wrong person's age: it has
    # Paul Okon Engstler at 54, which is his father's age, the father
    # being a footballer of the same name. An impossible age would age
    # the player straight out of the squad and skew the age-profile
    # score, so it is treated as no age at all.
    rows.loc[
        ~rows.age.between(MIN_PLAUSIBLE_AGE, MAX_PLAUSIBLE_AGE), "age"
    ] = np.nan

    # Age drives the ageing curve and position drives squad balance, so a
    # guess at either would quietly corrupt scoring. Those rows are held
    # back rather than invented.
    usable = rows.age.notna() & rows.position.notna()
    skipped = rows[~usable]
    rows = rows[usable]

    new_players = pd.DataFrame(
        {
            "name": rows.player,
            "club": rows.proposed_club,
            "league": rows.proposed_club.map(leagues),
            "position": rows.position,
            "age": rows.age.astype(int),
            "quality": np.nan,
            "quality_source": None,
            "true_value_m": rows.fee_eur_m,
            "tm_value_m": np.nan,
            "salary_eur_m": np.nan,
            "salary_estimated": True,
            "expiry_year": rows.age.map(contract_expiry),
            "homegrown": False,
            "hg_basis": "unknown",
            "country": rows.country,
        }
    ).reset_index(drop=True)

    # A loan is not a purchase: the host pays no fee, so any fee on those
    # rows would be the parent club's old transfer, not this move.
    is_loan = rows.category.eq("loan_in").reset_index(drop=True)
    new_players.loc[is_loan, "true_value_m"] = np.nan

    # A free transfer costs nothing, which says nothing about what the
    # player is worth: an out-of-contract keeper rated 73 is not a EUR 0
    # footballer. Zero fees are therefore no signal at all, and both his
    # quality and his value get imputed instead.
    new_players.loc[new_players.true_value_m.fillna(0) <= 0, "true_value_m"] = np.nan

    new_players = impute_quality(new_players, master)
    new_players = impute_value(new_players, master)
    return new_players, skipped


def apply_decisions(
    master: pd.DataFrame, decisions: pd.DataFrame, attributes: pd.DataFrame
) -> tuple[pd.DataFrame, dict[str, int], pd.DataFrame]:
    """Applies every live decision to the master.

    Order matters. Valuations run first because they address players by
    their pre-window club; then removals, so a player who left is not
    then given a new club; then club moves; then additions.

    Args:
        master: The existing player master.
        decisions: The live decisions.
        attributes: Per-player attributes from the sweeps.

    Returns:
        A triple of (updated master, counts by effect, skipped additions).
    """
    result = master.copy()
    counts: dict[str, int] = {}

    # Master rows are addressed by name plus current club: names alone are
    # not unique across 4,000 players, and every decision carries both.
    def locate(row: pd.Series) -> pd.Series:
        """Finds the master rows a decision refers to."""
        return (result["name"] == row.player) & (result["club"] == row.master_club)

    # Valuations first: they address players by their pre-window club, so
    # running them after the club moves would leave most rows unfindable.
    valuations = decisions[decisions.action == "Review valuation"]
    revalued = 0
    for _, row in valuations.iterrows():
        mask = locate(row)
        if not mask.any() or not row.fee_eur_m:
            continue
        result.loc[mask, "true_value_m"] = float(row.fee_eur_m)
        revalued += int(mask.sum())
    counts["revalued"] = revalued

    removals = decisions[decisions.action.isin(_REMOVE_ACTIONS)]
    drop_mask = pd.Series(False, index=result.index)
    for _, row in removals.iterrows():
        drop_mask |= locate(row)
    counts["removed"] = int(drop_mask.sum())
    result = result[~drop_mask]

    leagues = master.drop_duplicates("club").set_index("club").league
    moves = decisions[decisions.action.isin(_MOVE_ACTIONS)]
    moved = 0
    for _, row in moves.iterrows():
        mask = locate(row)
        if not mask.any() or not row.proposed_club:
            continue
        result.loc[mask, "club"] = row.proposed_club
        result.loc[mask, "league"] = leagues.get(row.proposed_club, np.nan)
        moved += int(mask.sum())
    counts["moved"] = moved

    new_players, skipped = build_new_players(decisions, master, attributes)
    counts["added"] = len(new_players)
    counts["skipped"] = len(skipped)

    result = pd.concat([result, new_players], ignore_index=True)

    # Wages for the new rows, fitted over everyone whose wage is known.
    result["salary_eur_m"] = result.salary_eur_m.replace("", np.nan)
    result = add_wages(result)
    return result[master.columns], counts, skipped


def main(argv: list[str]) -> int:
    """Applies the reviewed reconciliation to review.csv.

    Args:
        argv: Command-line arguments; ``--dry-run`` reports without
            writing.

    Returns:
        Process exit code.
    """
    dry_run = "--dry-run" in argv
    master = pd.read_csv(REVIEW_CSV)
    decisions = load_decisions()
    updated, counts, skipped = apply_decisions(
        master, decisions, source_attributes()
    )

    print(f"Master in:  {len(master)} players")
    print(f"  removed:  {counts['removed']}")
    print(f"  moved:    {counts['moved']}")
    print(f"  revalued: {counts['revalued']}")
    print(f"  added:    {counts['added']}")
    print(f"Master out: {len(updated)} players")
    if counts["skipped"]:
        print(
            f"\nHELD BACK: {counts['skipped']} additions lack an age or a "
            "position and were not invented:"
        )
        print("  " + ", ".join(sorted(skipped.player)[:12]) + " ...")

    if dry_run:
        print("\nDry run: review.csv not written.")
        return 0

    updated.to_csv(REVIEW_CSV, index=False)
    print(f"\nWrote {REVIEW_CSV}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

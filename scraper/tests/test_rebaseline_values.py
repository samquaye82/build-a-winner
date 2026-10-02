"""Tests for the rating-and-age value baseline (pipeline.rebaseline_values)."""

import pandas as pd
import pytest

from pipeline.rebaseline_values import (
    RATING_STEP,
    TOP_VALUE,
    age_factor,
    baseline_values,
    realised_fees,
    rebaseline,
)


def test_age_factor_follows_the_bands() -> None:
    assert age_factor(18) == 1.8
    assert age_factor(21) == 1.8
    assert age_factor(22) == 1.29
    assert age_factor(26) == 1.0
    assert age_factor(29) == 0.79
    assert age_factor(31) == 0.48
    assert age_factor(33) == 0.33
    assert age_factor(38) == 0.17


def test_a_prime_age_player_at_the_top_rating_is_worth_the_top_value() -> None:
    values = baseline_values(pd.Series([91.0, 85.0]), pd.Series([26, 26]))
    assert values.iloc[0] == pytest.approx(TOP_VALUE)


def test_each_rating_point_below_the_top_divides_by_the_step() -> None:
    values = baseline_values(pd.Series([91.0, 90.0]), pd.Series([26, 26]))
    assert values.iloc[1] == pytest.approx(TOP_VALUE / RATING_STEP)


def test_nobody_is_worth_more_than_the_top_value() -> None:
    # An 18-year-old 90 would be 250 / 1.26 x 1.8 = 357 uncapped.
    values = baseline_values(pd.Series([91.0, 90.0]), pd.Series([26, 18]))
    assert values.iloc[1] == pytest.approx(TOP_VALUE)


def test_age_scales_value_at_equal_rating() -> None:
    values = baseline_values(pd.Series([91.0, 80.0, 80.0]), pd.Series([26, 26, 32]))
    assert values.iloc[2] == pytest.approx(values.iloc[1] * 0.33)


def test_realised_fees_keep_only_completed_permanent_moves() -> None:
    reconciliation = pd.DataFrame(
        {
            "category": ["confirmed", "missing_player", "departed", "fee_gap", "stale_club"],
            "player": ["Signed", "Added", "Gone", "Revalued", "Free"],
            "fee_eur_m": ["40", "12.5", "30", "60", ""],
        }
    )
    assert realised_fees(reconciliation) == {"Signed": 40.0, "Added": 12.5, "Revalued": 60.0}


def test_realised_fees_drop_a_name_with_conflicting_fees() -> None:
    reconciliation = pd.DataFrame(
        {"category": ["confirmed", "confirmed"], "player": ["Twin", "Twin"], "fee_eur_m": ["10", "20"]}
    )
    assert realised_fees(reconciliation) == {}


def test_rebaseline_keeps_a_realised_fee_and_rounds_the_curve() -> None:
    master = pd.DataFrame(
        {"name": ["Top", "Bought", "Squad"], "quality": ["91", "80", "80"], "age": ["26", "24", "26"]}
    )
    values = rebaseline(master, {"Bought": 37.3})
    assert values.iloc[0] == 250
    assert values.iloc[1] == 37.3
    # 250 / 1.26^11 = 19.7, rounded to the nearest 5.
    assert values.iloc[2] == 20

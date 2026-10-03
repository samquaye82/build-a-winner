"""Tests for the rating-and-age value baseline (pipeline.rebaseline_values)."""

from datetime import date

import pandas as pd
import pytest

from pipeline.rebaseline_values import (
    FORWARD_ANCHOR,
    RATING_STEP,
    TOP_VALUE,
    age_factor,
    baseline_values,
    exact_age,
    realised_fees,
    rebaseline,
)


def test_age_factor_meets_each_band_at_its_centre() -> None:
    # Whole-year band 25-27 spans exact ages 25.0-28.0: centre 26.5.
    assert age_factor(19.5) == pytest.approx(1.8)
    assert age_factor(23.5) == pytest.approx(1.29)
    assert age_factor(26.5) == pytest.approx(1.0)
    assert age_factor(29.0) == pytest.approx(0.79)
    assert age_factor(31.0) == pytest.approx(0.48)
    assert age_factor(33.0) == pytest.approx(0.33)
    assert age_factor(35.5) == pytest.approx(0.17)


def test_age_factor_holds_flat_beyond_the_ends() -> None:
    assert age_factor(16) == pytest.approx(1.8)
    assert age_factor(39) == pytest.approx(0.17)


def test_age_factor_changes_by_a_constant_percentage_within_a_segment() -> None:
    # 23.5 -> 26.5 is three equal steps of (1.0 / 1.29) ** (1/3).
    step = (1.0 / 1.29) ** (1 / 3)
    assert age_factor(24.5) == pytest.approx(1.29 * step)
    assert age_factor(25.5) == pytest.approx(1.29 * step**2)


def test_a_birthday_never_moves_value_by_a_band_at_once() -> None:
    # Banded, 24.99 -> 25.0 cost 22%; now it is a day's worth.
    assert age_factor(25.0) / age_factor(24.99) == pytest.approx(1.0, abs=0.001)


def test_age_factor_falls_steadily_with_age() -> None:
    ages = [16 + tenth / 10 for tenth in range(0, 240)]
    factors = [age_factor(a) for a in ages]
    assert all(later <= earlier for earlier, later in zip(factors, factors[1:]))


def test_exact_age_measures_to_the_day() -> None:
    on = date(2027, 1, 1)
    assert exact_age("2001-10-16", 24, on) == pytest.approx(25.21, abs=0.01)
    assert exact_age("2001-03-24", 25, on) == pytest.approx(25.78, abs=0.01)


def test_exact_age_falls_back_to_mid_year_without_a_birthdate() -> None:
    assert exact_age("", 24) == 24.5


def test_a_prime_age_player_at_the_top_rating_is_worth_the_top_value() -> None:
    values = baseline_values(pd.Series([91.0, 85.0]), pd.Series([26.5, 26.5]))
    assert values.iloc[0] == pytest.approx(TOP_VALUE)


def test_each_rating_point_below_the_top_divides_by_the_step() -> None:
    values = baseline_values(pd.Series([91.0, 90.0]), pd.Series([26.5, 26.5]))
    assert values.iloc[1] == pytest.approx(TOP_VALUE / RATING_STEP)


def test_nobody_is_worth_more_than_the_top_value() -> None:
    # An 18-year-old 90 would be 250 / 1.26 x 1.8 = 357 uncapped.
    values = baseline_values(pd.Series([91.0, 90.0]), pd.Series([26.5, 18.0]))
    assert values.iloc[1] == pytest.approx(TOP_VALUE)


def test_age_scales_value_at_equal_rating() -> None:
    values = baseline_values(pd.Series([91.0, 80.0, 80.0]), pd.Series([26.5, 26.5, 33.0]))
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
    # Born 01/07/2000: 26.5 on 01/01/2027, the anchor age. All forwards.
    master = pd.DataFrame(
        {
            "name": ["Top", "Bought", "Squad"],
            "position": ["ST", "ST", "ST"],
            "quality": ["91", "80", "80"],
            "age": ["26", "24", "26"],
            "date_of_birth": ["2000-07-01", "", "2000-07-01"],
        }
    )
    values = rebaseline(master, {"Bought": 37.3})
    assert values.iloc[0] == 200
    assert values.iloc[1] == 37.3
    # 200 / 1.138^11 = 48.2, rounded to the nearest 5.
    assert values.iloc[2] == 50


def _squad(*players: tuple[str, str, float]) -> tuple[pd.Series, pd.Series, pd.Series]:
    """Quality, age and position series from (position, quality, age) rows."""
    position = pd.Series([p for p, _, _ in players])
    quality = pd.Series([float(q) for _, q, _ in players])
    age = pd.Series([a for _, _, a in players])
    return quality, age, position


def test_each_capped_group_tops_out_exactly_at_its_cap() -> None:
    quality, age, position = _squad(
        ("ST", "91", 26.5),
        ("GK", "90", 26.5),
        ("CB", "89", 26.5),
        ("CM", "90", 26.5),
    )
    values = baseline_values(quality, age, position)
    assert values.tolist() == pytest.approx([FORWARD_ANCHOR, 80.0, 120.0, 170.0])


def test_a_capped_group_keeps_its_players_in_proportion() -> None:
    quality, age, position = _squad(("GK", "90", 26.5), ("GK", "85", 26.5))
    values = baseline_values(quality, age, position)
    assert values.iloc[0] == pytest.approx(80.0)
    assert values.iloc[1] == pytest.approx(80.0 / RATING_STEP**5)


def test_a_groups_top_is_decided_by_curve_value_not_rating() -> None:
    # A 90-rated keeper of 34 is worth less than an 88-rated one of 26.5.
    quality, age, position = _squad(("GK", "90", 34.2), ("GK", "88", 26.5))
    values = baseline_values(quality, age, position)
    assert values.iloc[1] == pytest.approx(80.0)
    assert values.iloc[0] < 80.0


def test_a_prime_top_rated_forward_is_worth_the_forward_anchor() -> None:
    quality, age, position = _squad(("ST", "91", 26.5), ("RW", "85", 26.5))
    values = baseline_values(quality, age, position)
    assert values.iloc[0] == pytest.approx(FORWARD_ANCHOR)
    assert values.iloc[1] == pytest.approx(FORWARD_ANCHOR / RATING_STEP**6)


def test_a_young_star_forward_stops_at_the_forwards_cap() -> None:
    # 200 / 1.138 x 1.8 = 316 uncapped.
    quality, age, position = _squad(("ST", "91", 26.5), ("LW", "90", 18.0))
    values = baseline_values(quality, age, position)
    assert values.iloc[1] == pytest.approx(TOP_VALUE)


def test_a_realised_fee_does_not_set_a_groups_scale() -> None:
    # The best keeper keeps his fee; the cap goes to the best on the curve.
    quality, age, position = _squad(("GK", "90", 26.5), ("GK", "85", 26.5))
    on_curve = pd.Series([False, True])
    values = baseline_values(quality, age, position, on_curve=on_curve)
    assert values.iloc[1] == pytest.approx(80.0)

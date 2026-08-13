"""Tests for applying the reviewed reconciliation to the player master.

The risk here is silent damage to a hand-curated file: applying a finding
Sam rejected, moving the wrong player, or inventing attributes for a new
signing. Each of those has a test.
"""

import pandas as pd

from pipeline.apply_reconciliation import (
    apply_decisions,
    build_new_players,
    contract_expiry,
)


def _master() -> pd.DataFrame:
    """Builds a small player master fixture.

    Returns:
        A master with the columns review.csv carries.
    """
    return pd.DataFrame(
        [
            {
                "name": "Stale Player",
                "club": "Leeds",
                "league": "premier-league",
                "position": "CM",
                "age": 25,
                "quality": 75,
                "quality_source": "fc26",
                "true_value_m": 20.0,
                "tm_value_m": 20.0,
                "salary_eur_m": 3.0,
                "salary_estimated": False,
                "expiry_year": 2029,
                "homegrown": False,
                "hg_basis": "observed",
                "country": "England",
            },
            {
                "name": "Leaving Player",
                "club": "Leeds",
                "league": "premier-league",
                "position": "ST",
                "age": 30,
                "quality": 70,
                "quality_source": "fc26",
                "true_value_m": 10.0,
                "tm_value_m": 10.0,
                "salary_eur_m": 4.0,
                "salary_estimated": False,
                "expiry_year": 2027,
                "homegrown": True,
                "hg_basis": "observed",
                "country": "England",
            },
            {
                "name": "Namesake Player",
                "club": "Chelsea",
                "league": "premier-league",
                "position": "CB",
                "age": 28,
                "quality": 80,
                "quality_source": "fc26",
                "true_value_m": 40.0,
                "tm_value_m": 40.0,
                "salary_eur_m": 8.0,
                "salary_estimated": False,
                "expiry_year": 2028,
                "homegrown": False,
                "hg_basis": "observed",
                "country": "England",
            },
        ]
    )


def _decision(**overrides: object) -> dict[str, object]:
    """Builds a reviewed decision row.

    Args:
        **overrides: Fields to replace on the baseline row.

    Returns:
        A row shaped like the reviewed reconciliation CSV.
    """
    row: dict[str, object] = {
        "category": "stale_club",
        "action": "Change club",
        "player": "Stale Player",
        "master_club": "Leeds",
        "proposed_club": "Chelsea",
        "confidence": "ok",
        "detail": "",
        "move": "Leeds United -> Chelsea",
        "transfer_date": "2026-07-01",
        "fee_eur_m": 25.0,
    }
    row.update(overrides)
    return row


def _attributes() -> pd.DataFrame:
    """Builds the per-player attribute table the additions draw on.

    Returns:
        Attributes indexed by the feed's player name.
    """
    return pd.DataFrame(
        [
            {
                "player_name": "New Signing",
                "age": 24.0,
                "position": "LW",
                "country": "France",
                "fee_eur_m": 30.0,
            },
            {
                "player_name": "Free Signing",
                "age": 30.0,
                "position": "GK",
                "country": "Germany",
                "fee_eur_m": 0.0,
            },
            {
                "player_name": "Impossible Signing",
                "age": 54.0,
                "position": "CM",
                "country": "Australia",
                "fee_eur_m": 1.0,
            },
            {
                "player_name": "Faceless Signing",
                "age": None,
                "position": None,
                "country": "Brazil",
                "fee_eur_m": 5.0,
            },
        ]
    ).set_index("player_name")


def _apply(decisions: list[dict[str, object]]):
    """Applies decisions to the fixture master.

    Args:
        decisions: The reviewed decision rows.

    Returns:
        The triple returned by apply_decisions.
    """
    return apply_decisions(_master(), pd.DataFrame(decisions), _attributes())


def test_contract_expiry_is_longer_for_younger_players():
    assert contract_expiry(20) == 2031  # five years
    assert contract_expiry(28) == 2030  # four
    assert contract_expiry(30) == 2028  # two
    assert contract_expiry(34) == 2027  # one


def test_a_club_change_moves_the_player_and_his_league():
    updated, counts, _ = _apply([_decision()])
    assert counts["moved"] == 1
    row = updated[updated["name"] == "Stale Player"].iloc[0]
    assert row.club == "Chelsea"
    assert row.league == "premier-league"


def test_a_removal_drops_the_player():
    updated, counts, _ = _apply(
        [
            _decision(
                category="departed",
                action="Remove from dataset",
                player="Leaving Player",
                proposed_club="",
            )
        ]
    )
    assert counts["removed"] == 1
    assert "Leaving Player" not in set(updated["name"])


def test_a_rejected_finding_is_never_applied():
    # Sam marks mistaken identity in the confidence column; the row must
    # be inert even though its action still reads as an edit.
    updated, counts, _ = _apply(
        [_decision(confidence="incorrect classification", action="No change")]
    )
    assert counts["moved"] == 0
    assert updated[updated["name"] == "Stale Player"].iloc[0].club == "Leeds"


def test_a_decision_only_touches_the_player_at_the_named_club():
    # Two players can share a name, so the club disambiguates them. This
    # decision names a Namesake Player at Leeds; the master's is at
    # Chelsea, so nothing should move.
    updated, counts, _ = _apply(
        [_decision(player="Namesake Player", master_club="Leeds")]
    )
    assert counts["moved"] == 0
    assert updated[updated["name"] == "Namesake Player"].iloc[0].club == "Chelsea"


def test_a_valuation_takes_the_realised_fee():
    updated, counts, _ = _apply(
        [
            _decision(
                category="fee_gap",
                action="Review valuation",
                proposed_club="Leeds",
                fee_eur_m=55.0,
            )
        ]
    )
    assert counts["revalued"] == 1
    assert updated[updated["name"] == "Stale Player"].iloc[0].true_value_m == 55.0


def test_valuations_apply_even_when_the_player_also_moved():
    # The valuation addresses him at his old club, so it has to run
    # before the club change rewrites it.
    updated, counts, _ = _apply(
        [
            _decision(),
            _decision(
                category="fee_gap",
                action="Review valuation",
                proposed_club="Leeds",
                fee_eur_m=55.0,
            ),
        ]
    )
    assert counts["revalued"] == 1
    row = updated[updated["name"] == "Stale Player"].iloc[0]
    assert row.true_value_m == 55.0
    assert row.club == "Chelsea"


def test_a_new_signing_is_added_with_imputed_attributes():
    decisions = pd.DataFrame(
        [
            _decision(
                category="missing_player",
                action="Add player",
                player="New Signing",
                master_club="",
                proposed_club="Leeds",
            )
        ]
    )
    new_players, _ = build_new_players(decisions, _master(), _attributes())
    assert len(new_players) == 1
    row = new_players.iloc[0]
    assert row.club == "Leeds"
    assert row.league == "premier-league"
    assert row.true_value_m == 30.0
    assert 45 <= row.quality <= 99
    assert row.expiry_year == 2031
    assert row.hg_basis == "unknown"


def test_a_free_transfer_is_not_valued_at_nothing():
    # A free costs nothing, which says nothing about the player's worth.
    decisions = pd.DataFrame(
        [
            _decision(
                category="missing_player",
                action="Add player",
                player="Free Signing",
                master_club="",
                proposed_club="Leeds",
            )
        ]
    )
    new_players, _ = build_new_players(decisions, _master(), _attributes())
    assert new_players.iloc[0].true_value_m > 0


def test_a_loanee_is_not_valued_at_his_parents_old_fee():
    decisions = pd.DataFrame(
        [
            _decision(
                category="loan_in",
                action="Change club (loan for 26/27)",
                player="New Signing",
                master_club="",
                proposed_club="Leeds",
            )
        ]
    )
    new_players, _ = build_new_players(decisions, _master(), _attributes())
    # 30.0 was the fee on his record; a loan pays no fee, so the value
    # must have been imputed instead.
    assert new_players.iloc[0].true_value_m != 30.0


def test_a_signing_already_in_the_master_is_not_added_twice():
    # The stage must be safe to run again on a master it already updated.
    master = _master()
    decisions = pd.DataFrame(
        [
            _decision(
                category="missing_player",
                action="Add player",
                player="Stale Player",
                master_club="",
                proposed_club="Leeds",
            )
        ]
    )
    new_players, _ = build_new_players(decisions, master, _attributes())
    assert len(new_players) == 0


def test_an_impossible_age_is_treated_as_no_age_at_all():
    # The source has Paul Okon Engstler at 54, which is his father's age.
    # Letting it through would age him out of the squad immediately.
    decisions = pd.DataFrame(
        [
            _decision(
                category="missing_player",
                action="Add player",
                player="Impossible Signing",
                master_club="",
                proposed_club="Leeds",
            )
        ]
    )
    new_players, skipped = build_new_players(decisions, _master(), _attributes())
    assert len(new_players) == 0
    assert list(skipped.player) == ["Impossible Signing"]


def test_a_signing_without_age_or_position_is_held_back_not_invented():
    decisions = pd.DataFrame(
        [
            _decision(
                category="missing_player",
                action="Add player",
                player="Faceless Signing",
                master_club="",
                proposed_club="Leeds",
            )
        ]
    )
    new_players, skipped = build_new_players(decisions, _master(), _attributes())
    assert len(new_players) == 0
    assert list(skipped.player) == ["Faceless Signing"]

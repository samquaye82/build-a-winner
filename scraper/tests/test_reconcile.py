"""Tests for reconciling the transfer sweep against the player master.

The club resolver carries the risk here: matching too eagerly invents
transfers for clubs we do not model, and matching too timidly reads a
routine move as a player leaving our leagues.
"""

import pandas as pd

from pipeline.reconcile import (
    club_keys,
    reconcile,
    reconcile_loans,
    resolve_club,
    to_frame,
)

#: Master club keys and the leagues they sit in, as reconcile builds them.
MASTER_KEYS = {
    "leipzig",
    "leeds",
    "eintracht frankfurt",
    "koln",
    "angers",
    "porto",
    "sporting lisbon",
    "wolves",
    "deportivo",
    "atalanta",
    "monchengladbach",
}

LEAGUES_BY_KEY = {
    "leipzig": {"bundesliga"},
    "leeds": {"premier-league"},
    "eintracht frankfurt": {"bundesliga"},
    "koln": {"bundesliga"},
    "angers": {"ligue-1"},
    "porto": {"primeira-liga"},
    "sporting lisbon": {"primeira-liga"},
    "wolves": {"championship"},
    "deportivo": {"la-liga"},
    "atalanta": {"serie-a"},
    "monchengladbach": {"bundesliga"},
}


def _resolve(full: str, short: str, country: str | None) -> str | None:
    """Resolves a club against the fixture master.

    Args:
        full: The feed's full club name.
        short: The feed's short club name.
        country: The feed's country code.

    Returns:
        The matching master key, or None.
    """
    return resolve_club(
        club_keys(full, short), MASTER_KEYS, country, LEAGUES_BY_KEY
    )


def test_club_keys_offers_both_published_names():
    assert club_keys("Stade Rennais FC", "Rennes") == {"stade rennais", "rennes"}


def test_resolve_club_matches_on_the_short_name():
    assert _resolve("Leeds United", "Leeds", "uk") == "leeds"


def test_resolve_club_sees_through_club_decoration():
    # "RB" is decoration on top of the master's "Leipzig".
    assert _resolve("RB Leipzig", "RB Leipzig", "de") == "leipzig"


def test_resolve_club_uses_the_alias_table_for_renamed_clubs():
    assert _resolve("Borussia Mönchengladbach", "Gladbach", "de") == "monchengladbach"
    assert _resolve("Sporting", "Sporting", "pt") == "sporting lisbon"
    assert _resolve("Wolverhampton Wanderers", "Wolves", "uk") == "wolves"


def test_resolve_club_rejects_a_shared_city():
    # Different clubs that merely share a city with one we model.
    assert _resolve("BSG Chemie Leipzig", "Chemie Leipzig", "de") is None
    assert _resolve("FC Viktoria Köln", "Viktoria Köln", "de") is None


def test_resolve_club_rejects_a_shared_first_word():
    assert _resolve("Eintracht Braunschweig", "Eintracht", "de") is None


def test_resolve_club_rejects_a_substring_lookalike():
    # The bug this rule exists to prevent: "Rangers" is not Angers.
    assert _resolve("Rangers FC", "Rangers", "uk") is None
    assert _resolve("Queens Park Rangers", "QPR", "uk") is None


def test_resolve_club_rejects_an_ambiguous_short_name_abroad():
    # The feed calls Australia's Newcastle Jets "Newcastle", which is an
    # exact match for the Premier League club's key.
    assert _resolve("Newcastle United Jets", "Newcastle", "au") is None


def test_resolve_club_does_not_alias_across_countries():
    # The feed's short name for Sporting Gijón is "Sporting", which the
    # alias table maps to Sporting Lisbon. Spain is not Portugal.
    assert _resolve("Sporting Gijón", "Sporting", "es") is None


def test_resolve_club_confines_matches_to_one_country():
    # A Brazilian side sharing a name with a Portuguese one.
    assert _resolve("Grêmio Foot-Ball Porto Alegrense", "Grêmio", "br") is None


def test_resolve_club_rejects_reserve_and_youth_sides():
    assert _resolve("Atalanta Bergamasca Calcio Under 23", "Atalanta U23", "it") is None


def test_resolve_club_refuses_a_lone_generic_token():
    # Spain fields dozens of "Club Deportivo X" sides.
    assert _resolve("Club Deportivo Teruel", "Teruel", "es") is None


def test_resolve_club_skips_the_fuzzy_layer_without_a_country():
    assert resolve_club({"rb leipzig"}, MASTER_KEYS, None, LEAGUES_BY_KEY) is None


def _master() -> pd.DataFrame:
    """Builds a small player master fixture.

    Returns:
        A master with one player per scenario the reconciler classifies.
    """
    return pd.DataFrame(
        [
            {
                "name": "Stale Player",
                "club": "Leeds",
                "league": "premier-league",
                "age": 25,
                "country": "England",
                "true_value_m": 20.0,
            },
            {
                "name": "Leaving Player",
                "club": "Leeds",
                "league": "premier-league",
                "age": 30,
                "country": "England",
                "true_value_m": 10.0,
            },
            {
                "name": "Pool Player",
                "club": "Free agent",
                "league": "premier-league",
                "age": 34,
                "country": "England",
                "true_value_m": 5.0,
            },
            {
                "name": "Correct Player",
                "club": "Leipzig",
                "league": "bundesliga",
                "age": 22,
                "country": "Germany",
                "true_value_m": 30.0,
            },
        ]
    )


def _transfer(**overrides: object) -> dict[str, object]:
    """Builds a swept transfer row.

    Args:
        **overrides: Fields to replace on the baseline row.

    Returns:
        A row shaped like the sweep's CSV.
    """
    row: dict[str, object] = {
        "player_name": "Stale Player",
        "age": 25,
        "country": "England",
        "club_from": "Leeds United",
        "club_to": "RB Leipzig",
        "club_from_short": "Leeds",
        "club_to_short": "RB Leipzig",
        "league_from": "uk",
        "league_to": "de",
        "fee_eur_m": 25.0,
        "transfer_date": "2026-07-01",
    }
    row.update(overrides)
    return row


def _categories(rows: list[dict[str, object]]) -> dict[str, list[str]]:
    """Runs the reconciler and groups the players by finding category.

    Args:
        rows: Transfer rows to reconcile.

    Returns:
        Category -> the players found under it.
    """
    findings = reconcile(_master(), pd.DataFrame(rows))
    grouped: dict[str, list[str]] = {}
    for finding in findings:
        grouped.setdefault(finding.category, []).append(finding.player)
    return grouped


def test_reconcile_flags_a_stale_club():
    grouped = _categories([_transfer()])
    assert grouped["stale_club"] == ["Stale Player"]


def test_reconcile_confirms_a_move_the_master_already_has():
    grouped = _categories(
        [
            _transfer(
                player_name="Correct Player",
                age=22,
                country="Germany",
                club_from="Leeds United",
                club_from_short="Leeds",
                club_to="RB Leipzig",
                club_to_short="RB Leipzig",
            )
        ]
    )
    assert grouped["confirmed"] == ["Correct Player"]


def test_reconcile_reports_a_move_out_of_our_leagues_as_departed():
    grouped = _categories(
        [
            _transfer(
                player_name="Leaving Player",
                age=30,
                club_to="Fenerbahce",
                club_to_short="Fenerbahce",
                league_to="tr",
            )
        ]
    )
    assert grouped["departed"] == ["Leaving Player"]


def test_reconcile_reports_an_unknown_arrival_as_missing():
    grouped = _categories([_transfer(player_name="Nobody Known", age=19)])
    assert grouped["missing_player"] == ["Nobody Known"]


def test_reconcile_ignores_arrivals_at_clubs_we_do_not_model():
    grouped = _categories(
        [
            _transfer(
                player_name="Nobody Known",
                age=19,
                club_to="Fenerbahce",
                club_to_short="Fenerbahce",
                league_to="tr",
            )
        ]
    )
    assert grouped == {}


def test_reconcile_marks_a_finding_uncorroborated_when_the_origin_differs():
    # The master says Leeds but the player moved from somewhere else, so
    # either the master was already stale or this is the wrong player.
    findings = reconcile(
        _master(),
        pd.DataFrame(
            [_transfer(club_from="AS Monaco", club_from_short="Monaco", league_from="fr")]
        ),
    )
    stale = [f for f in findings if f.category == "stale_club"]
    assert stale and stale[0].corroborated is False


def test_reconcile_judges_only_the_last_move_of_a_double_transfer():
    # A player moved twice inside the window; only where he ended up
    # counts, so the intermediate club must not be reported as an error.
    rows = [
        _transfer(club_to="1.FC Köln", club_to_short="Köln", transfer_date="2026-06-10"),
        _transfer(transfer_date="2026-08-01"),
    ]
    findings = reconcile(_master(), pd.DataFrame(rows))
    stale = [f for f in findings if f.category == "stale_club"]
    assert len(stale) == 1
    assert "Leipzig" in stale[0].detail


def test_reconcile_reports_a_free_agent_who_has_signed():
    # A pool player who signs anywhere is no longer available, whether or
    # not the club is one we model.
    grouped = _categories(
        [
            _transfer(
                player_name="Pool Player",
                age=34,
                club_from="Liverpool FC",
                club_from_short="Liverpool",
                club_to="Trabzonspor",
                club_to_short="Trabzonspor",
                league_to="tr",
                fee_eur_m=0.0,
            )
        ]
    )
    assert grouped["free_agent_signed"] == ["Pool Player"]


def test_reconcile_does_not_match_a_namesake_with_a_different_forename():
    # Víctor Muñoz and Iker Muñoz are two real Spanish players of nearly
    # the same age. Matching on surname, age and nationality alone bound
    # one club's signing onto the other player's record.
    master = pd.concat(
        [
            _master(),
            pd.DataFrame(
                [
                    {
                        "name": "Iker Muñoz",
                        "club": "Leeds",
                        "league": "premier-league",
                        "age": 23,
                        "country": "Spain",
                        "true_value_m": 3.0,
                    }
                ]
            ),
        ],
        ignore_index=True,
    )
    findings = reconcile(
        master,
        pd.DataFrame(
            [
                _transfer(
                    player_name="Víctor Muñoz",
                    age=22,
                    country="Spain",
                    club_from="CA Osasuna",
                    club_from_short="Osasuna",
                    league_from="es",
                )
            ]
        ),
    )
    # He must read as a new player, leaving the other's record alone.
    assert [f.category for f in findings] == ["missing_player"]
    assert findings[0].player == "Víctor Muñoz"


def test_reconcile_still_matches_an_abbreviated_forename():
    master = pd.concat(
        [
            _master(),
            pd.DataFrame(
                [
                    {
                        "name": "Joao Gomes",
                        "club": "Leeds",
                        "league": "premier-league",
                        "age": 25,
                        "country": "Brazil",
                        "true_value_m": 30.0,
                    }
                ]
            ),
        ],
        ignore_index=True,
    )
    findings = reconcile(
        master,
        pd.DataFrame([_transfer(player_name="J. Gomes", age=25, country="Brazil")]),
    )
    assert [f.category for f in findings] == ["stale_club"]


def _loan(**overrides: object) -> dict[str, object]:
    """Builds a swept loan row.

    Args:
        **overrides: Fields to replace on the baseline row.

    Returns:
        A row shaped like the loan sweep's CSV.
    """
    row: dict[str, object] = {
        "player_name": "Correct Player",
        "age": 22,
        "country": "Germany",
        "club_from": "RB Leipzig",
        "club_to": "Leeds United",
        "club_from_short": "RB Leipzig",
        "club_to_short": "Leeds",
        "league_from": "de",
        "league_to": "uk",
        "transfer_date": "2026-08-10",
    }
    row.update(overrides)
    return row


def test_reconcile_loans_puts_an_incoming_loanee_at_his_host_club():
    # Araujo's case: a Barcelona player who spends 26/27 at Liverpool
    # belongs in Liverpool's squad list.
    findings = reconcile_loans(_master(), pd.DataFrame([_loan()]))
    assert [f.category for f in findings] == ["loan_in"]
    assert findings[0].proposed_club == "Leeds"


def test_reconcile_loans_adds_a_loanee_the_master_does_not_have():
    findings = reconcile_loans(
        _master(), pd.DataFrame([_loan(player_name="Unknown Loanee", age=19)])
    )
    assert findings[0].category == "loan_in"
    assert findings[0].corroborated is False
    assert findings[0].db_club is None


def test_reconcile_loans_removes_a_player_loaned_out_of_our_leagues():
    findings = reconcile_loans(
        _master(),
        pd.DataFrame(
            [
                _loan(
                    player_name="Stale Player",
                    age=25,
                    country="England",
                    club_from="Leeds United",
                    club_from_short="Leeds",
                    league_from="uk",
                    club_to="HJK Helsinki",
                    club_to_short="HJK",
                    league_to="fi",
                )
            ]
        ),
    )
    assert [f.category for f in findings] == ["loan_out"]
    assert findings[0].proposed_club == ""


def test_reconcile_loans_ignores_loans_between_clubs_we_do_not_model():
    findings = reconcile_loans(
        _master(),
        pd.DataFrame(
            [
                _loan(
                    player_name="Nobody",
                    club_from="Fenerbahce",
                    club_from_short="Fenerbahce",
                    league_from="tr",
                    club_to="Besiktas JK",
                    club_to_short="Besiktas",
                    league_to="tr",
                )
            ]
        ),
    )
    assert findings == []


def test_to_frame_leads_with_the_edits_that_need_making():
    findings = reconcile(_master(), pd.DataFrame([_transfer()]))
    frame = to_frame(findings)
    assert list(frame.columns)[:5] == [
        "category",
        "action",
        "player",
        "master_club",
        "proposed_club",
    ]
    assert frame.iloc[0].category == "stale_club"
    assert frame.iloc[0].action == "Change club"


def test_reconcile_flags_a_fee_far_from_the_recorded_value():
    grouped = _categories([_transfer(fee_eur_m=80.0)])
    assert grouped["fee_gap"] == ["Stale Player"]


def test_reconcile_ignores_small_fees_when_checking_valuations():
    # Below the notice floor, a wide ratio is just noise.
    grouped = _categories([_transfer(fee_eur_m=1.0)])
    assert "fee_gap" not in grouped

"""Reconciling the summer 2026 transfer sweep against the player master.

The player master (``scraper/review.csv``) is a snapshot taken on
13/07/2026 from Capology's 2026/27 squad pages. Squads have moved since,
and Capology itself carries stale rows, so club assignments drift out of
date in two directions: players listed at clubs they have left, and
arrivals missing entirely.

This module is read-only. It classifies every in-window transfer against
the master and writes a report; applying the findings is a separate,
reviewed pass through ``review.csv`` and ``corrections.py``.

Usage (from scraper/, venv active):

    python -m pipeline.reconcile
"""

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .matching import normalise_club, normalise_name, surname_key

ROOT = Path(__file__).resolve().parent.parent
REVIEW_CSV = ROOT / "review.csv"
TRANSFERS_CSV = ROOT / "output" / "transfers_summer_2026.csv"
LOANS_CSV = ROOT / "output" / "loans_summer_2026.csv"
OUT_MD = ROOT / "output" / "reconciliation_2026.md"
OUT_CSV = ROOT / "output" / "reconciliation_2026.csv"

#: Fee gap, as a multiple of the recorded value, worth flagging. A club
#: paying twice what we value a player at means one of the two is wrong.
FEE_DISCREPANCY_RATIO = 2.0

#: Minimum fee (EUR m) before a discrepancy is worth Sam's attention.
FEE_NOTICE_FLOOR = 15.0

#: The master's pseudo-club for contractless players (see
#: pipeline.free_agents). Not a club, so club matching never applies.
FREE_AGENT_CLUB = "Free agent"


def club_keys(full_name: str, short_name: str) -> set[str]:
    """Builds the candidate keys a transfer's club might be known by.

    The feed publishes a legal name ("Stade Rennais FC") and a short name
    ("Rennes"); the master uses the short form. Normalising the legal name
    alone silently fails to match, which reads as a player leaving our
    leagues when he has done nothing of the sort, so both are offered.

    Args:
        full_name: The club's full published name.
        short_name: The club's short published name; may be empty.

    Returns:
        The non-empty normalised keys to try.
    """
    keys = {normalise_club(full_name), normalise_club(short_name)}
    return {key for key in keys if key}


#: Single-token club names too generic to match on their own. Spain and
#: Portugal field dozens of "Club Deportivo X" and "Sporting X" sides, so
#: a lone such token would drag them all onto one modelled club.
_GENERIC_CLUB_TOKENS = frozenset(
    {
        "deportivo",
        "sporting",
        "racing",
        "nacional",
        "union",
        "atletico",
        "athletic",
        "real",
        "olympic",
        "arsenal",
        "internacional",
        "estrela",
    }
)


#: Feed country code -> the master's league keys. Clubs only ever match
#: within their own country, which is what stops a Brazilian "Porto
#: Alegrense" or a Belarusian "Dynamo Brest" landing on Porto or Brest.
_COUNTRY_TO_LEAGUES: dict[str, frozenset[str]] = {
    "uk": frozenset({"premier-league", "championship"}),
    "es": frozenset({"la-liga"}),
    "de": frozenset({"bundesliga"}),
    "it": frozenset({"serie-a"}),
    "fr": frozenset({"ligue-1"}),
    # Monaco is its own country but plays in Ligue 1.
    "mc": frozenset({"ligue-1"}),
    "pt": frozenset({"primeira-liga"}),
    "ne": frozenset({"eredivisie"}),
    "nl": frozenset({"eredivisie"}),
    "be": frozenset({"pro-league"}),
}

#: Tokens marking a reserve, B or youth side. "Atalanta U23" and
#: "Oud-Heverlee Leuven II" are not the clubs we model.
_RESERVE_TOKENS = frozenset({"b", "ii", "u", "under", "23", "21", "19", "2"})

#: Decoration a club name may carry on top of the master's shorter form.
#: A candidate may only be treated as the same club when everything it
#: adds comes from this list: "RB Leipzig" is Leipzig, but "BSG Chemie
#: Leipzig" and "Eintracht Braunschweig" are different clubs entirely
#: that merely share a city or a first word with one we model.
_CLUB_DECORATION_TOKENS = frozenset(
    {
        "united", "city", "fc", "cf", "sc", "sk", "rb", "rc", "ac", "as",
        "sad", "vv", "kv", "de", "la", "le", "calcio", "club", "cp", "cd",
    }
)


#: Clubs the two sources name so differently that no general rule links
#: them. Keys are the feed's normalised name, values the master's. Each
#: was verified by listing the master clubs the sweep never matched and
#: finding their counterpart in the feed (13/08/2026); without these,
#: their transfers read as moves out of our leagues entirely.
_CLUB_ALIASES: dict[str, str] = {
    "athletic bilbao": "athletic club",
    "cercle brugge": "cercle brugges",
    "club brugge": "club brugges",
    "gladbach": "monchengladbach",
    "borussia monchengladbach": "monchengladbach",
    "oud heverlee leuven": "leuven",
    "sporting": "sporting lisbon",
    "vitoria guimaraes": "vitoria",
    "wolverhampton wanderers": "wolves",
}


def resolve_club(
    keys: set[str],
    master_keys: set[str],
    country: str | None = None,
    leagues_by_key: dict[str, set[str]] | None = None,
) -> str | None:
    """Finds the master's name for a club, if it is one we model.

    Exact key equality first, then a hand-verified alias table, then
    whole-token subset matching, which absorbs the decoration the two
    sources disagree on ("RB Leipzig" against "Leipzig", "Borussia
    Monchengladbach" against "Monchengladbach"). All three layers are
    confined to clubs in the transfer's own country.

    Deliberately NOT substring matching: that reads "Rangers FC" as
    Angers and a Polish club's "...Sportowa..." as Porto. The fuzzy layer
    therefore requires all of: whole-token subset, a unique answer, no
    lone generic token, the same country, and no reserve-team marker.
    Anything short of that stays unresolved and surfaces as "needs
    checking", which is the cheaper error.

    Args:
        keys: Candidate keys for the club, from :func:`club_keys`.
        master_keys: Every normalised club key in the master.
        country: The club's country code from the feed, e.g. "de". When
            absent, the fuzzy layer is skipped entirely.
        leagues_by_key: Master club key -> the leagues it appears in.

    Returns:
        The matching master key, or None when the club is not modelled
        or the match would be ambiguous.
    """
    # Every club we model sits in one of the nine leagues, so the country
    # gates all three layers, not just the fuzzy one. Without this the
    # feed's ambiguous short names slip through: "Newcastle" is also the
    # Newcastle Jets of Australia, and "Sporting" is also Sporting Gijón.
    if not country or leagues_by_key is None:
        return None
    allowed = _COUNTRY_TO_LEAGUES.get(country)
    if allowed is None:
        return None

    def in_country(master_key: str) -> bool:
        """Whether a master club sits in the transfer's country.

        Args:
            master_key: A normalised master club key.

        Returns:
            True when the club plays in a league of that country.
        """
        return bool(leagues_by_key.get(master_key, set()) & allowed)

    exact = {key for key in keys & master_keys if in_country(key)}
    if exact:
        return next(iter(exact))

    aliased = {
        _CLUB_ALIASES[key]
        for key in keys
        if key in _CLUB_ALIASES and _CLUB_ALIASES[key] in master_keys
    }
    aliased = {key for key in aliased if in_country(key)}
    if aliased:
        return next(iter(aliased))

    matches: set[str] = set()
    for key in keys:
        tokens = set(key.split())
        if tokens & _RESERVE_TOKENS:
            continue
        for master_key in master_keys:
            master_tokens = set(master_key.split())
            smaller = min(tokens, master_tokens, key=len)
            if not smaller:
                continue
            if len(smaller) == 1 and smaller & _GENERIC_CLUB_TOKENS:
                continue
            if not in_country(master_key):
                continue
            if not (tokens <= master_tokens or master_tokens <= tokens):
                continue
            # Whatever the longer name adds must be mere decoration.
            extra = tokens ^ master_tokens
            if extra <= _CLUB_DECORATION_TOKENS:
                matches.add(master_key)
    return next(iter(matches)) if len(matches) == 1 else None


def _forenames_agree(master_name: str, feed_name: str) -> bool:
    """Whether two full names share a compatible forename.

    Sources abbreviate ("J. Gomes"), reorder and drop middle names, so
    the test is deliberately loose: identical first tokens, or one an
    initial of the other. Mononyms carry no forename and always pass.

    Args:
        master_name: The player's name in the master.
        feed_name: The player's name in the feed.

    Returns:
        True when the forenames are compatible or absent.
    """
    master_parts = normalise_name(master_name).split()
    feed_parts = normalise_name(feed_name).split()
    if len(master_parts) < 2 or len(feed_parts) < 2:
        return True
    first, other = master_parts[0], feed_parts[0]
    if first == other:
        return True
    # One side abbreviated to an initial, e.g. "J. Gomes" for "Joao
    # Gomes". The initial must still match the other's first letter.
    if len(first) == 1 or len(other) == 1:
        return first[0] == other[0]
    return False


def _master_club_names(master: pd.DataFrame) -> dict[str, str]:
    """Maps normalised club keys back to the master's own spelling.

    Proposed changes have to be expressed in the master's vocabulary
    ("Wolves", not "Wolverhampton Wanderers"), or applying them by hand
    would introduce a second name for the same club.

    Args:
        master: The player master.

    Returns:
        Normalised club key -> the club's name as the master writes it.
    """
    return {normalise_club(str(club)): str(club) for club in master.club.unique()}


def _code(value: object) -> str | None:
    """Reads a country code from a CSV cell, treating blanks as absent.

    Args:
        value: The cell's value; pandas yields NaN for empty columns.

    Returns:
        The country code, or None when the cell is empty.
    """
    return None if pd.isna(value) else str(value)


@dataclass(frozen=True)
class Finding:
    """One reconciliation result for a single transfer.

    Attributes:
        category: One of stale_club, missing_player, departed, confirmed,
            or fee_gap.
        player: Player display name from the transfer feed.
        detail: Human-readable explanation of the finding.
        db_club: Club currently recorded in the master, if the player is
            in it.
        transfer: The move, as "from -> to".
        transfer_date: ISO date of the move.
        fee_eur_m: Fee in euro millions, when disclosed.
        proposed_club: What the master's club column should become, named
            as the master names it where the club is one we model. Empty
            for findings whose action is removal, None where no club
            change is implied.
        corroborated: Whether the master's club agrees with the club the
            player moved FROM. When it does, the finding is a clean
            before-and-after match and can be trusted. When it does not,
            either the master was already stale before this window or the
            name match found the wrong player, so it needs an eyeball.
            Not meaningful for categories with no master row to compare
            (missing_player) or where the club already agrees with the
            destination (confirmed); both default to True so they are not
            filed under "needs checking".
    """

    category: str
    player: str
    detail: str
    db_club: str | None
    transfer: str
    transfer_date: str
    fee_eur_m: float | None
    corroborated: bool = True
    proposed_club: str | None = None


def build_player_index(
    master: pd.DataFrame,
) -> tuple[dict[str, list[int]], dict[str, list[int]]]:
    """Indexes the master by normalised full name and by surname.

    Two indexes support the two match layers: an exact normalised-name
    lookup, and a surname fallback disambiguated by age.

    Args:
        master: The player master, one row per player.

    Returns:
        A pair of (full-name index, surname index), each mapping a key to
        the master's row positions.
    """
    by_name: dict[str, list[int]] = defaultdict(list)
    by_surname: dict[str, list[int]] = defaultdict(list)
    for position, name in enumerate(master.name):
        by_name[normalise_name(str(name))].append(position)
        by_surname[surname_key(str(name))].append(position)
    return dict(by_name), dict(by_surname)


def match_player(
    transfer: pd.Series,
    master: pd.DataFrame,
    by_name: dict[str, list[int]],
    by_surname: dict[str, list[int]],
) -> int | None:
    """Finds the master row for a transfer's player, if there is one.

    Layered like ``pipeline.matching``: an unambiguous normalised-name
    hit wins; otherwise a surname hit is accepted only when exactly one
    candidate's age is within a year of the feed's age. Ambiguity is
    always resolved as "no match" so the report never invents a link.

    Args:
        transfer: One row of the transfer sweep.
        master: The player master.
        by_name: Normalised-full-name index into the master.
        by_surname: Surname index into the master.

    Returns:
        The master row position, or None when no confident match exists.
    """
    name = str(transfer.player_name)
    candidates = by_name.get(normalise_name(name), [])
    if len(candidates) == 1:
        return candidates[0]

    pool = candidates or by_surname.get(surname_key(name), [])
    if not pool:
        return None

    age = transfer.age
    if pd.isna(age):
        return None
    close = [
        position
        for position in pool
        if abs(float(master.age.iloc[position]) - float(age)) <= 1
    ]
    # Surnames are shared far too widely for age alone to disambiguate:
    # a lower-league namesake of the right age would otherwise be read as
    # one of our squad players moving clubs. Nationality is the cheapest
    # extra discriminator both sources publish.
    country = transfer.country
    if not candidates and not pd.isna(country):
        close = [
            position
            for position in close
            if normalise_name(str(master.country.iloc[position]))
            == normalise_name(str(country))
        ]
        # And the forename has to agree. Víctor Muñoz (22, Spain, Osasuna
        # to Liverpool) and Iker Muñoz (23, Spain, Osasuna) are two real,
        # different players that surname, age and nationality alone
        # cannot separate.
        close = [
            position
            for position in close
            if _forenames_agree(str(master.name.iloc[position]), name)
        ]
    return close[0] if len(close) == 1 else None


def reconcile(master: pd.DataFrame, transfers: pd.DataFrame) -> list[Finding]:
    """Classifies every transfer against the master.

    Only the last move per player is judged: a player transferred twice
    inside the window is at his final club, and flagging the intermediate
    move as a stale-club error would be wrong.

    Args:
        master: The player master.
        transfers: The in-window transfer sweep.

    Returns:
        Every finding, unsorted.
    """
    by_name, by_surname = build_player_index(master)
    modelled_clubs = {normalise_club(str(club)) for club in master.club.unique()}

    # Which leagues each club key appears in, so a fuzzy club match can be
    # confined to the right country.
    leagues_by_key: dict[str, set[str]] = defaultdict(set)
    for club, league in zip(master.club, master.league):
        leagues_by_key[normalise_club(str(club))].add(str(league))
    names_by_key = _master_club_names(master)

    latest = (
        transfers.sort_values("transfer_date")
        .drop_duplicates(subset=["player_name", "age"], keep="last")
    )

    findings: list[Finding] = []
    for _, transfer in latest.iterrows():
        to_keys = club_keys(str(transfer.club_to), str(transfer.club_to_short))
        from_keys = club_keys(
            str(transfer.club_from), str(transfer.club_from_short)
        )
        to_master = resolve_club(
            to_keys, modelled_clubs, _code(transfer.league_to), leagues_by_key
        )
        from_master = resolve_club(
            from_keys, modelled_clubs, _code(transfer.league_from), leagues_by_key
        )
        position = match_player(transfer, master, by_name, by_surname)
        move = f"{transfer.club_from} -> {transfer.club_to}"
        date_str = str(transfer.transfer_date)
        fee = None if pd.isna(transfer.fee_eur_m) else float(transfer.fee_eur_m)

        if position is None:
            # Unknown player arriving at a club we model: a genuine gap
            # in the master, since we hold full squads for these clubs.
            if to_master is not None:
                findings.append(
                    Finding(
                        "missing_player",
                        str(transfer.player_name),
                        f"Signed by {transfer.club_to}, absent from master",
                        None,
                        move,
                        date_str,
                        fee,
                        proposed_club=names_by_key.get(to_master, ""),
                    )
                )
            continue

        row = master.iloc[position]
        db_club = str(row.club)
        db_key = normalise_club(db_club)
        corroborated = db_key == from_master
        if db_club == FREE_AGENT_CLUB:
            # The pool of contractless players is a game feature, so a
            # pool player signing somewhere matters regardless of where
            # he went: he is no longer available to sign. Corroboration
            # cannot apply, as the master gives him no club to compare.
            findings.append(
                Finding(
                    "free_agent_signed",
                    str(row["name"]),
                    f"Free-agent pool, but signed for {transfer.club_to}",
                    db_club,
                    move,
                    date_str,
                    fee,
                    proposed_club=(
                        names_by_key.get(to_master, "") if to_master else ""
                    ),
                )
            )
        elif db_key == to_master:
            findings.append(
                Finding(
                    "confirmed",
                    str(row["name"]),
                    f"Master already has him at {db_club}",
                    db_club,
                    move,
                    date_str,
                    fee,
                )
            )
        elif to_master is not None:
            findings.append(
                Finding(
                    "stale_club",
                    str(row["name"]),
                    f"Master says {db_club}, actually {transfer.club_to}",
                    db_club,
                    move,
                    date_str,
                    fee,
                    corroborated,
                    proposed_club=names_by_key.get(to_master, ""),
                )
            )
        else:
            findings.append(
                Finding(
                    "departed",
                    str(row["name"]),
                    f"Left {db_club} for {transfer.club_to}, outside our leagues",
                    db_club,
                    move,
                    date_str,
                    fee,
                    corroborated,
                    proposed_club="",
                )
            )

        # A disclosed fee far from our valuation suggests the value model
        # is wrong for this player, whichever club he ended up at.
        value = row.true_value_m
        if fee and not pd.isna(value) and fee >= FEE_NOTICE_FLOOR:
            ratio = fee / float(value) if float(value) else float("inf")
            if ratio >= FEE_DISCREPANCY_RATIO or ratio <= 1 / FEE_DISCREPANCY_RATIO:
                findings.append(
                    Finding(
                        "fee_gap",
                        str(row["name"]),
                        f"Fee €{fee:.1f}m vs recorded value €{value:.1f}m",
                        db_club,
                        move,
                        date_str,
                        fee,
                        corroborated,
                    )
                )

    return findings


def reconcile_loans(master: pd.DataFrame, loans: pd.DataFrame) -> list[Finding]:
    """Classifies in-window loans against the master.

    The game does not model loans, but it does model squads, and a loaned
    player spends the season in his host club's squad. So a loan into a
    modelled club means the master should list him there, and a loan out
    of one means it should not.

    Args:
        master: The player master.
        loans: The in-window loan sweep.

    Returns:
        Every loan finding, unsorted.
    """
    by_name, by_surname = build_player_index(master)
    modelled_clubs = {normalise_club(str(club)) for club in master.club.unique()}
    leagues_by_key: dict[str, set[str]] = defaultdict(set)
    for club, league in zip(master.club, master.league):
        leagues_by_key[normalise_club(str(club))].add(str(league))
    names_by_key = _master_club_names(master)

    # Only the last loan per player counts, as with permanent moves.
    latest = loans.sort_values("transfer_date").drop_duplicates(
        subset=["player_name", "age"], keep="last"
    )

    findings: list[Finding] = []
    for _, loan in latest.iterrows():
        to_master = resolve_club(
            club_keys(str(loan.club_to), str(loan.club_to_short)),
            modelled_clubs,
            _code(loan.league_to),
            leagues_by_key,
        )
        from_master = resolve_club(
            club_keys(str(loan.club_from), str(loan.club_from_short)),
            modelled_clubs,
            _code(loan.league_from),
            leagues_by_key,
        )
        position = match_player(loan, master, by_name, by_surname)
        row = None if position is None else master.iloc[position]
        db_club = None if row is None else str(row.club)
        move = f"{loan.club_from} -> {loan.club_to}"
        date_str = str(loan.transfer_date)
        name = str(loan.player_name) if row is None else str(row["name"])

        db_key = None if db_club is None else normalise_club(db_club)
        if to_master is not None and db_key is not None and db_key == to_master:
            # The master already has him at the host club, so the loan is
            # recorded correctly and there is nothing to do.
            findings.append(
                Finding(
                    "confirmed",
                    name,
                    f"On loan to {loan.club_to}, already listed there",
                    db_club,
                    move,
                    date_str,
                    None,
                )
            )
        elif to_master is not None:
            # Arriving on loan: he plays for the host next season.
            known = "already in master" if row is not None else "not in master"
            detail = (
                f"On loan to {loan.club_to} from {loan.club_from} ({known}"
                + (f", listed at {db_club}" if db_club else "")
                + ")"
            )
            findings.append(
                Finding(
                    "loan_in",
                    name,
                    detail,
                    db_club,
                    move,
                    date_str,
                    None,
                    corroborated=row is not None,
                    proposed_club=names_by_key.get(to_master, ""),
                )
            )
        elif from_master is not None and row is not None:
            # Leaving on loan for a club we do not model: he should come
            # out of the squad for the season.
            findings.append(
                Finding(
                    "loan_out",
                    name,
                    f"Loaned out to {loan.club_to}, leaves {db_club}'s squad",
                    db_club,
                    move,
                    date_str,
                    None,
                    corroborated=db_key == from_master,
                    proposed_club="",
                )
            )
    return findings


def _table(rows: list[Finding]) -> list[str]:
    """Renders findings as a Markdown table, biggest fee first.

    Args:
        rows: The findings to tabulate.

    Returns:
        Markdown lines, or a "None." line when there is nothing to show.
    """
    if not rows:
        return ["None.\n"]
    rows = sorted(rows, key=lambda f: (-(f.fee_eur_m or 0), f.player))
    lines = [
        "| Player | Detail | Move | Date | Fee (€m) |",
        "| --- | --- | --- | --- | --- |",
    ]
    for f in rows:
        fee = "-" if f.fee_eur_m is None else f"{f.fee_eur_m:.1f}"
        lines.append(
            f"| {f.player} | {f.detail} | {f.transfer} | {f.transfer_date} | {fee} |"
        )
    return lines


def _section(findings: list[Finding], category: str, title: str) -> list[str]:
    """Renders one category, splitting corroborated rows from the rest.

    Corroborated rows (master's club matches the club moved from) are
    safe to apply as-is; the remainder need a human look, so they are
    kept visually separate rather than mixed in.

    Args:
        findings: All findings.
        category: The category to render.
        title: Section heading.

    Returns:
        Markdown lines for the section.
    """
    rows = [f for f in findings if f.category == category]
    clean = [f for f in rows if f.corroborated]
    unclear = [f for f in rows if not f.corroborated]

    lines = [f"\n## {title} ({len(rows)})\n"]
    lines += _table(clean)
    if unclear:
        lines.append(
            f"\n**Needs checking ({len(unclear)})**: the master's club does not "
            "match the club moved from, so either it was already stale before "
            "this window or the name matched the wrong player.\n"
        )
        lines += _table(unclear)
    return lines


#: What each category asks Sam to do to review.csv, for the CSV's
#: action column. Ordered here as the review is best worked through.
_ACTIONS: dict[str, str] = {
    "stale_club": "Change club",
    "loan_in": "Change club (loan for 26/27)",
    "loan_out": "Remove from squad (loaned out)",
    "free_agent_signed": "Remove from free-agent pool",
    "missing_player": "Add player",
    "departed": "Remove from dataset",
    "fee_gap": "Review valuation",
    "confirmed": "No change",
}

#: Category order in both outputs: things needing an edit come first.
_CATEGORY_ORDER = (
    "stale_club",
    "loan_in",
    "loan_out",
    "free_agent_signed",
    "missing_player",
    "departed",
    "fee_gap",
    "confirmed",
)


def to_frame(findings: list[Finding]) -> pd.DataFrame:
    """Renders findings as the review spreadsheet.

    One row per finding, ordered so the edits needing attention sit at
    the top and the corroborated ones ahead of the doubtful ones.

    Args:
        findings: All findings.

    Returns:
        A frame ready to write as CSV.
    """
    order = {category: rank for rank, category in enumerate(_CATEGORY_ORDER)}
    rows = [
        {
            "category": f.category,
            "action": _ACTIONS.get(f.category, ""),
            "player": f.player,
            "master_club": f.db_club or "",
            "proposed_club": "" if f.proposed_club is None else f.proposed_club,
            "confidence": "ok" if f.corroborated else "needs check",
            "detail": f.detail,
            "move": f.transfer,
            "transfer_date": f.transfer_date,
            "fee_eur_m": f.fee_eur_m,
        }
        for f in findings
    ]
    frame = pd.DataFrame(rows)
    if frame.empty:
        return frame
    frame["_category_rank"] = frame.category.map(order).fillna(len(order))
    frame["_confidence_rank"] = (frame.confidence == "needs check").astype(int)
    frame = frame.sort_values(
        ["_category_rank", "_confidence_rank", "fee_eur_m", "player"],
        ascending=[True, True, False, True],
    )
    return frame.drop(columns=["_category_rank", "_confidence_rank"])


def main() -> int:
    """Runs the reconciliation and writes the report and review CSV.

    Returns:
        Process exit code.
    """
    master = pd.read_csv(REVIEW_CSV)
    transfers = pd.read_csv(TRANSFERS_CSV)
    findings = reconcile(master, transfers)

    loans = pd.DataFrame()
    if LOANS_CSV.exists():
        loans = pd.read_csv(LOANS_CSV)
        findings += reconcile_loans(master, loans)
    else:
        print(f"WARNING: no loan sweep at {LOANS_CSV}; run pipeline.loans first")

    lines = [
        "# Summer 2026 transfer reconciliation",
        "",
        f"Master: `review.csv` ({len(master)} players, snapshot 13/07/2026)  ",
        f"Sweep: {len(transfers)} confirmed transfers and {len(loans)} loans, "
        f"{transfers.transfer_date.min()} to {transfers.transfer_date.max()}  ",
        "Source: footballtransfers.com. Permanent moves come from the "
        "confirmed feed, loans from each club's own transfer history "
        "(the confirmed feed carries none).",
    ]
    lines += _section(findings, "stale_club", "Stale club: master needs updating")
    lines += _section(findings, "loan_in", "Loaned in: add to the host club's squad")
    lines += _section(findings, "loan_out", "Loaned out: remove from the squad")
    lines += _section(
        findings,
        "free_agent_signed",
        "Free-agent pool: signed elsewhere, no longer available",
    )
    lines += _section(findings, "missing_player", "Missing: arrivals not in master")
    lines += _section(findings, "departed", "Departed: left the modelled leagues")
    lines += _section(findings, "fee_gap", "Fee gaps: valuation worth revisiting")
    lines += _section(findings, "confirmed", "Already correct in the master")

    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    to_frame(findings).to_csv(OUT_CSV, index=False)

    counts: dict[str, int] = defaultdict(int)
    for finding in findings:
        counts[finding.category] += 1
    print(f"Wrote {OUT_MD}")
    print(f"Wrote {OUT_CSV}")
    for category in _CATEGORY_ORDER:
        if counts[category]:
            print(f"  {category}: {counts[category]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

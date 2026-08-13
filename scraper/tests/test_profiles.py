"""Tests for reading player profile pages."""

from transfers_scraper.profiles import is_player_index, parse_profile

PROFILE_HTML = """
<html><head><title>Charlie Cresswell</title></head><body>
<script type="application/ld+json">
{"@type": "Person", "birthDate": "2002-08-17", "jobTitle": "Defender (Center)"}
</script>
<div class="col"><strong class="ttl">Age</strong>
  <span class="txt">23 years old (17 Aug 2002)</span></div>
<div class="col"><strong class="ttl">Nationality</strong>
  <span class="txt d-flex"><i class="flag"><img src="x"></i>ENG</span></div>
<div class="col"><strong class="ttl">Contracted Until</strong>
  <span class="txt">30 Jun 28</span></div>
</body></html>
"""

#: What the site serves for a slug that does not exist: HTTP 200 and its
#: player index, not a 404.
INDEX_HTML = """
<html><body><h1 class="h4" id="title">All Football Players
</h1></body></html>
"""


def test_parse_profile_reads_age_position_and_expiry():
    parsed = parse_profile(PROFILE_HTML)
    assert parsed["age"] == 23
    assert parsed["position"] == "CB"
    assert parsed["expiry_year"] == 2028


def test_parse_profile_maps_the_job_title_onto_game_positions():
    assert parse_profile(
        PROFILE_HTML.replace("Defender (Center)", "Goalkeeper")
    )["position"] == "GK"
    assert parse_profile(
        PROFILE_HTML.replace("Defender (Center)", "Striker (Center)")
    )["position"] == "ST"
    assert parse_profile(
        PROFILE_HTML.replace("Defender (Center)", "Attacking midfielder (Center)")
    )["position"] == "AM"


def test_parse_profile_omits_what_the_page_does_not_carry():
    # Real case: Alejandro Moya's page publishes no position at all.
    stripped = PROFILE_HTML.replace('"jobTitle": "Defender (Center)"', '"x": "y"')
    parsed = parse_profile(stripped)
    assert "position" not in parsed
    assert parsed["age"] == 23


def test_parse_profile_survives_an_empty_page():
    assert parse_profile("<html></html>") == {}


def test_is_player_index_spots_the_soft_404():
    # Three of the four slugs tried on 13/08/2026 returned this page with
    # HTTP 200; treating it as a profile would read as a parse failure.
    assert is_player_index(INDEX_HTML) is True
    assert is_player_index(PROFILE_HTML) is False

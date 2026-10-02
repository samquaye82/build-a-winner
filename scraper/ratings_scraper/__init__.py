"""EA SPORTS FC player ratings from ea.com.

Replaces the July 2026 FC 26 file with the ratings EA publishes for FC 27
(database update of 10/09/2026). The public ratings page is server
rendered: each page embeds its hundred players as JSON in the Next.js
``__NEXT_DATA__`` script, so no browser automation is involved.

Provenance: ea.com's robots.txt places no restriction on
``/games/ea-sports-fc/ratings`` for ordinary agents (02/10/2026). Sam
authorised the fetch the same day. It is about two hundred requests, a
second apart, cached permanently.
"""

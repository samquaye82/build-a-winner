"""Capology salary scraper for the Sporting Director Game.

One-off, polite snapshot of first-team salary and contract data for eight
European leagues. Each league's salaries page embeds the complete dataset as
a JavaScript array in the raw HTML, so the pipeline is:

    fetch (8 GETs, rate-limited, cached forever) -> parse -> clean -> CSV

See TUTORIAL.md at the scraper root for the guided learning version.
"""

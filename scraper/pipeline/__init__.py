"""Post-scrape pipeline: joining Capology rows with Transfermarkt data.

Stages live here rather than in capology_scraper because they are source-
agnostic data engineering: matching, comparison, and (later) the value
model and game-data generation.
"""

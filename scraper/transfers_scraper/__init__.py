"""Confirmed-transfer sweep from footballtransfers.com.

A second, independent source alongside the Capology salary snapshot. Its
job is narrow: list every confirmed transfer in a date window so the
hand-edited player master (``scraper/review.csv``) can be checked for
club assignments that have gone stale since the 13/07/2026 snapshot.

The public listing page renders its table client-side, but the table is
fed by a plain JSON endpoint, so no browser automation is involved.
"""

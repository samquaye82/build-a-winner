"""The value model: quality, true value, and wage imputation.

Three deterministic least-squares fits, in dependency order:

1. Quality. FC 26 overall rating where joined; otherwise imputed from a
   fit of rating against log market value and age (and, as a last resort,
   against log salary, then the position median).
2. True value ("performance-based transfer value"). A fit of log market
   value against quality and age over every row where TM publishes a
   value; the model's prediction is then used for EVERY player, so values
   are smooth, deterministic and argue with the market only through the
   inputs. The biggest disagreements with TM are reported for review, not
   silently kept.
3. Wages. A fit of log salary against quality, age and league over the
   ~3,100 rows with published wages, used to impute the rest (Belgian
   paywall plus scattered gaps), flagged as estimates.

No randomness anywhere: same inputs, same numbers, every run.
"""

import numpy as np
import pandas as pd

#: Quality bounds for the game's 0-100 scale.
QUALITY_FLOOR = 45
QUALITY_CEILING = 99


def _lstsq_predict(
    frame: pd.DataFrame,
    target: pd.Series,
    features: pd.DataFrame,
    predict_features: pd.DataFrame,
) -> np.ndarray:
    """Fits ordinary least squares and predicts.

    Args:
        frame: Rows used for the fit (aligned with target/features).
        target: The dependent variable.
        features: Feature columns for fitting (no intercept column).
        predict_features: Feature columns to predict for.

    Returns:
        Predictions for predict_features.
    """
    x = np.column_stack([np.ones(len(frame)), features.to_numpy(dtype=float)])
    coefficients, *_ = np.linalg.lstsq(x, target.to_numpy(dtype=float), rcond=None)
    x_pred = np.column_stack(
        [np.ones(len(predict_features)), predict_features.to_numpy(dtype=float)]
    )
    return x_pred @ coefficients


def add_quality(players: pd.DataFrame) -> pd.DataFrame:
    """Adds the game quality rating (0-100) to every row.

    Args:
        players: Table with fc26_rating, market_value_in_eur, salary_eur_m,
            age and position columns.

    Returns:
        The table with `quality` (int) and `quality_source` columns.
    """
    result = players.copy()
    result["quality"] = result.fc26_rating
    result["quality_source"] = np.where(
        result.fc26_rating.notna(), "fc26", None
    )

    # Fit rating ~ log(value) + age + age^2 on rows with both.
    both = result.dropna(subset=["fc26_rating", "market_value_in_eur"])
    features = pd.DataFrame(
        {
            "logv": np.log1p(both.market_value_in_eur / 1e6),
            "age": both.age,
            "age2": both.age**2,
        }
    )
    need_value_fit = result.quality.isna() & result.market_value_in_eur.notna()
    if need_value_fit.any():
        rows = result[need_value_fit]
        predictions = _lstsq_predict(
            both,
            both.fc26_rating,
            features,
            pd.DataFrame(
                {
                    "logv": np.log1p(rows.market_value_in_eur / 1e6),
                    "age": rows.age,
                    "age2": rows.age**2,
                }
            ),
        )
        result.loc[need_value_fit, "quality"] = predictions
        result.loc[need_value_fit, "quality_source"] = "value-fit"

    # Fit rating ~ log(salary) + age on rows with both, for the value-less.
    both_salary = result.dropna(subset=["fc26_rating", "salary_eur_m"])
    need_salary_fit = result.quality.isna() & result.salary_eur_m.notna()
    if need_salary_fit.any():
        rows = result[need_salary_fit]
        predictions = _lstsq_predict(
            both_salary,
            both_salary.fc26_rating,
            pd.DataFrame(
                {
                    "logs": np.log1p(both_salary.salary_eur_m),
                    "age": both_salary.age,
                }
            ),
            pd.DataFrame({"logs": np.log1p(rows.salary_eur_m), "age": rows.age}),
        )
        result.loc[need_salary_fit, "quality"] = predictions
        result.loc[need_salary_fit, "quality_source"] = "salary-fit"

    # Last resort: position median.
    medians = result.groupby("position").quality.median()
    still = result.quality.isna()
    result.loc[still, "quality"] = result.loc[still, "position"].map(medians)
    result.loc[still, "quality_source"] = "position-median"

    result["quality"] = (
        result.quality.clip(QUALITY_FLOOR, QUALITY_CEILING).round().astype(int)
    )
    return result


#: Blend weight of the model against the market where both exist.
MODEL_BLEND_WEIGHT = 0.5

#: Bounds on how far the final value may argue with a published TM value.
#: The ceiling is age-graded (Sam, 11/07/2026): youth market values move
#: fastest, so the model may argue hardest about teenagers.
BLEND_FLOOR_RATIO = 0.65
CEILING_RATIO_YOUNG = 2.0
CEILING_RATIO_MATURE = 1.5
CEILING_AGE_YOUNG = 18
CEILING_AGE_MATURE = 24

#: Global ceiling (EUR m): no game value exceeds this, model or not.
GLOBAL_VALUE_CEILING_M = 250.0


def ceiling_ratio(age: np.ndarray) -> np.ndarray:
    """The age-graded ceiling ratio: 2.0x at 18 tapering to 1.5x by 24.

    Args:
        age: Player ages.

    Returns:
        Per-player ceiling ratios over the TM market value.
    """
    taper = (CEILING_AGE_MATURE - age) / (CEILING_AGE_MATURE - CEILING_AGE_YOUNG)
    return CEILING_RATIO_MATURE + (
        CEILING_RATIO_YOUNG - CEILING_RATIO_MATURE
    ) * np.clip(taper, 0, 1)


def add_true_value(players: pd.DataFrame) -> pd.DataFrame:
    """Adds the game's true value (EUR m) to every row.

    The model (a least-squares fit of log value against quality and age)
    supplies the performance-based opinion; where TM publishes a value the
    final number is a log-space blend of the two, clamped so the model can
    argue with the market but never rave at it (quadratic extrapolation
    once priced an 18-year-old at EUR 1.1bn; hence the clamps). Where TM
    is silent the raw model prediction is used under a global ceiling.

    Args:
        players: Table with quality, age and market_value_in_eur.

    Returns:
        The table with `model_value_m` (raw model), `tm_value_m` and
        `true_value_m` (final, used by the game) columns.
    """
    result = players.copy()
    result["tm_value_m"] = result.market_value_in_eur / 1e6

    with_value = result.dropna(subset=["tm_value_m"])
    features = pd.DataFrame(
        {
            "q": with_value.quality,
            "q2": with_value.quality**2,
            "age": with_value.age,
            "age2": with_value.age**2,
            "qage": with_value.quality * with_value.age,
        }
    )
    predictions = _lstsq_predict(
        with_value,
        np.log1p(with_value.tm_value_m),
        features,
        pd.DataFrame(
            {
                "q": result.quality,
                "q2": result.quality**2,
                "age": result.age,
                "age2": result.age**2,
                "qage": result.quality * result.age,
            }
        ),
    )
    model = np.maximum(0.1, np.expm1(predictions))
    result["model_value_m"] = np.round(model, 1)

    tm = result.tm_value_m.to_numpy(dtype=float)
    has_tm = ~np.isnan(tm)
    ages = result.age.to_numpy(dtype=float)

    blended = np.expm1(
        MODEL_BLEND_WEIGHT * np.log1p(model)
        + (1 - MODEL_BLEND_WEIGHT) * np.log1p(np.where(has_tm, tm, model))
    )
    clamped = np.where(
        has_tm,
        np.clip(blended, BLEND_FLOOR_RATIO * tm, ceiling_ratio(ages) * tm),
        blended,
    )
    final = np.minimum(np.maximum(0.1, clamped), GLOBAL_VALUE_CEILING_M)
    result["true_value_m"] = round_game_value(final)
    return result


def round_game_value(values: np.ndarray) -> np.ndarray:
    """Rounds values to transfer-fee-like numbers (Sam, 11/07/2026).

    Nearest 10 above EUR 50m, nearest 5 between 10 and 50, nearest 0.5
    below 10 (so cheap squad players keep meaningful prices), with a
    EUR 0.5m floor so nobody is accidentally free.

    Args:
        values: Values in EUR m.

    Returns:
        Rounded values.
    """
    small = np.maximum(0.5, np.round(values * 2) / 2)
    mid = np.round(values / 5) * 5
    big = np.round(values / 10) * 10
    return np.where(values < 10, small, np.where(values < 50, mid, big))


#: Wage-level factors for leagues with NO published wages to fit on.
#: pro-league: assumed a notch below the Eredivisie (tunable with Sam).
#: free-agent: these players came from top clubs, so no league discount;
#: the generator applies the free-agent premium on top.
_LEAGUE_FACTOR_FALLBACKS: dict[str, tuple[str, float]] = {
    "pro-league": ("eredivisie", 0.8),
    "free-agent": ("premier-league", 0.6),
}


def add_wages(players: pd.DataFrame) -> pd.DataFrame:
    """Imputes missing salaries from a global curve and league factors.

    A single fit of log salary against quality and age over every known
    wage gives the shape; each league's factor is the median ratio of its
    actual wages to that curve. League dummies are NOT used: a league with
    zero known wages (the Belgian paywall, the free-agent pool) would get
    a degenerate coefficient and absurd imputations (an early version
    priced Vlahovic at EUR 0.7m a year). Data-less leagues instead borrow
    a neighbouring league's factor, scaled (see _LEAGUE_FACTOR_FALLBACKS).

    Args:
        players: Table with salary_eur_m (nullable), quality, age, league.

    Returns:
        The table with salary filled and a `salary_estimated` flag.
    """
    result = players.copy()
    result["salary_estimated"] = result.salary_eur_m.isna()
    known = result.salary_eur_m.notna()

    features = pd.DataFrame(
        {"q": result.quality, "q2": result.quality**2, "age": result.age}
    )
    predictions = np.expm1(
        _lstsq_predict(
            result[known],
            np.log1p(result.loc[known, "salary_eur_m"]),
            features[known],
            features,
        )
    )
    result["_wage_curve"] = np.maximum(0.05, predictions)

    factors: dict[str, float] = {}
    for league, group in result[known].groupby("league"):
        factors[str(league)] = float(
            (group.salary_eur_m / group._wage_curve).median()
        )
    for league, (source, scale) in _LEAGUE_FACTOR_FALLBACKS.items():
        factors.setdefault(league, factors.get(source, 1.0) * scale)

    league_factor = result.league.map(factors).fillna(1.0)
    imputed = np.round(
        np.maximum(0.1, result._wage_curve * league_factor), 1
    )
    result.loc[~known, "salary_eur_m"] = imputed[~known]
    return result.drop(columns=["_wage_curve"])


def divergence_report(players: pd.DataFrame, top: int = 15) -> pd.DataFrame:
    """The model-vs-market disagreements worth a human look.

    Args:
        players: Table with true_value_m and tm_value_m.
        top: How many rows to return.

    Returns:
        The largest absolute divergences among players TM values at
        EUR 10m+, most divergent first.
    """
    notable = players.dropna(subset=["tm_value_m"])
    notable = notable[notable.tm_value_m >= 10].copy()
    notable["divergence_m"] = notable.true_value_m - notable.tm_value_m
    notable = notable.reindex(
        notable.divergence_m.abs().sort_values(ascending=False).index
    )
    return notable.head(top)[
        ["name", "club", "age", "quality", "tm_value_m", "true_value_m", "divergence_m"]
    ]

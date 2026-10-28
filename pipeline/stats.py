"""Small, dependency-free statistics used by the analysis.

Everything here is standard textbook material: binomial probabilities,
the chi-square goodness-of-fit test, one- and two-proportion z
procedures, and the Benjamini-Hochberg adjustment for testing many
companies at once. Written out by hand so the pipeline needs nothing
beyond the Python standard library.
"""

import math


def binom_logpmf(k, n, p):
    return (
        math.lgamma(n + 1)
        - math.lgamma(k + 1)
        - math.lgamma(n - k + 1)
        + k * math.log(p)
        + (n - k) * math.log1p(-p)
    )


def binom_cdf(k, n, p):
    """P(X <= k) for X ~ Binomial(n, p)."""
    if k < 0:
        return 0.0
    if k >= n:
        return 1.0
    return min(1.0, sum(math.exp(binom_logpmf(i, n, p)) for i in range(k + 1)))


def binom_sf(k, n, p):
    """P(X >= k) for X ~ Binomial(n, p)."""
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    return min(1.0, sum(math.exp(binom_logpmf(i, n, p)) for i in range(k, n + 1)))


def _gammainc_upper_regularized(a, x):
    """Q(a, x), the regularized upper incomplete gamma function."""
    if x <= 0:
        return 1.0
    if x < a + 1:
        # series for P(a, x), then Q = 1 - P
        term = total = 1.0 / a
        ap = a
        for _ in range(10000):
            ap += 1
            term *= x / ap
            total += term
            if abs(term) < abs(total) * 1e-15:
                break
        return max(0.0, 1.0 - total * math.exp(-x + a * math.log(x) - math.lgamma(a)))
    # continued fraction (Lentz's method) for Q(a, x)
    tiny = 1e-300
    b = x + 1 - a
    c = 1 / tiny
    d = 1 / b
    h = d
    for i in range(1, 10000):
        an = -i * (i - a)
        b += 2
        d = an * d + b
        d = tiny if abs(d) < tiny else d
        c = b + an / c
        c = tiny if abs(c) < tiny else c
        d = 1 / d
        delta = d * c
        h *= delta
        if abs(delta - 1) < 1e-15:
            break
    return math.exp(-x + a * math.log(x) - math.lgamma(a)) * h


def chi2_sf(x, df):
    """P(chi-square with df degrees of freedom >= x)."""
    return _gammainc_upper_regularized(df / 2.0, x / 2.0)


def chi2_gof(observed, expected_props):
    """Chi-square goodness-of-fit statistic, df and p-value."""
    n = sum(observed)
    stat = 0.0
    for o, p in zip(observed, expected_props):
        e = n * p
        stat += (o - e) ** 2 / e
    df = len(observed) - 1
    return stat, df, chi2_sf(stat, df)


def norm_sf(z):
    """P(Z >= z) for a standard normal Z."""
    return 0.5 * math.erfc(z / math.sqrt(2))


def one_prop_z(k, n, p0):
    """One-proportion z statistic and two-sided p-value against p0."""
    phat = k / n
    z = (phat - p0) / math.sqrt(p0 * (1 - p0) / n)
    return z, 2 * norm_sf(abs(z))


def prop_interval(k, n, z_star=1.959964):
    """Large-sample confidence interval for a proportion: p-hat +/- z* SE."""
    phat = k / n
    se = math.sqrt(phat * (1 - phat) / n)
    return phat - z_star * se, phat + z_star * se


def two_prop_z(k1, n1, k2, n2):
    """Two-proportion z test using the pooled proportion. Returns z, two-sided p."""
    p1, p2 = k1 / n1, k2 / n2
    pooled = (k1 + k2) / (n1 + n2)
    se = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
    z = (p1 - p2) / se
    return z, 2 * norm_sf(abs(z))


def bh_qvalues(pvalues):
    """Benjamini-Hochberg adjusted p-values (q-values), same order as input."""
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    q = [0.0] * m
    running = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        running = min(running, pvalues[i] * m / rank)
        q[i] = running
    return q

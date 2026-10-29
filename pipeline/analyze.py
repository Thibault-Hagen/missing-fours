"""Step 2: rebuild unrounded EPS, find the hidden digit, compute the statistics.

Reads build/facts.jsonl.gz (written by extract.py) and writes the JSON the
website reads into site/data/.

For every company and quarter:
  1. Take the EPS the company reported (rounded to the cent).
  2. Divide the reported numerator (net income available to common
     shareholders) by the reported weighted-average share count to get the
     unrounded EPS.
  3. Keep the result only if it rounds back to the reported EPS. That check
     throws out cases where the company's real calculation used other
     inputs (for example the two-class method).
  4. Read the digit in the tenth-of-a-cent place. The inputs were
     themselves rounded (most filings report in thousands), so the
     unrounded EPS is really a small range. The digit is used only when
     the whole range agrees on it.

Exact fractions are used throughout so that floating-point error can never
move a value across a rounding line.
"""

import gzip
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from fractions import Fraction

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stats as S  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FACTS = os.path.join(ROOT, "build", "facts.jsonl.gz")
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(ROOT, "site", "data")

# Row layout written by extract.py
START, END, KIND, ACCN, FORM, FILED, FY, FP = range(8)
EPS_B, EPS_D, EPS_BD, NUM_B, NUM_D, NI, SH_B, SH_D, SH_BD = range(8, 17)
NUM_IDX = (NUM_B, NUM_D, NI)
DEN_IDX = (SH_B, SH_D, SH_BD)

MIN_EPS = Fraction(1, 10)  # below $0.10 the tenth-of-a-cent digit is not uniform (Benford)
MIN_QUARTERS = 20  # quarters needed before a company gets a probability
INITIATIVE_DATE = "2020-09-28"  # SEC announced its first EPS Initiative cases

# Companies charged under the SEC's EPS Initiative, from the SEC's own releases.
# "key" lists quarter-end dates the SEC named specifically, where it did.
CASES = [
    {
        "ticker": "TILE",
        "name": "Interface Inc.",
        "from": "2015-01-01",
        "to": "2016-12-31",
        "key": [],
        "what": "Made unsupported manual adjustments, including to bonus accruals and stock-based compensation, in quarters when it was on track to miss consensus EPS.",
        "penalty": "$5 million",
        "date": "2020-09-28",
        "url": "https://www.sec.gov/news/press-release/2020-226",
    },
    {
        "ticker": "FULT",
        "name": "Fulton Financial Corporation",
        "from": "2016-07-01",
        "to": "2017-09-30",
        "key": [],
        "what": "Carried a valuation allowance that conflicted with its own stated method, then reversed it in mid-2017, lifting EPS by one cent in a quarter it would otherwise have missed consensus.",
        "penalty": "$1.5 million",
        "date": "2020-09-28",
        "url": "https://www.sec.gov/news/press-release/2020-226",
    },
    {
        "ticker": "HCSG",
        "name": "Healthcare Services Group",
        "from": "2014-01-01",
        "to": "2015-12-31",
        "key": [],
        "what": "Did not accrue or disclose litigation loss contingencies when GAAP required, while reporting EPS that met or came close to consensus.",
        "penalty": "$6 million",
        "date": "2021-08-24",
        "url": "https://www.sec.gov/news/press-release/2021-162",
    },
    {
        "ticker": "ROL",
        "name": "Rollins, Inc.",
        "from": "2016-01-01",
        "to": "2018-12-31",
        "key": ["2016-03-31", "2017-06-30"],
        "what": "Reduced accounting reserves without support, by enough to round quarterly EPS up to the next cent.",
        "penalty": "$8 million",
        "date": "2022-04-18",
        "url": "https://www.sec.gov/news/press-release/2022-64",
    },
    {
        "ticker": "GNTX",
        "name": "Gentex Corporation",
        "from": "2015-01-01",
        "to": "2018-12-31",
        "key": ["2015-09-30"],
        "what": "Cut a performance bonus accrual without the required GAAP analysis so EPS met analyst estimates, and made similar adjustments through 2018.",
        "penalty": "$4 million",
        "date": "2023-02-07",
        "url": "https://www.sec.gov/enforce/34-96819-s",
    },
]

# SEC office names are the agency's own industry grouping for filers.
OFFICE_LABEL = {
    "Office of Energy & Transportation": "Energy & Transportation",
    "Office of Finance": "Finance",
    "Office of Life Sciences": "Life Sciences",
    "Office of Manufacturing": "Manufacturing",
    "Office of Real Estate & Construction": "Real Estate & Construction",
    "Office of Technology": "Technology",
    "Office of Trade & Services": "Trade & Services",
    "Office of Crypto Assets": "Crypto Assets",
    "Industrial Applications and Services": "Industrial Applications & Services",
}


SMALL_WORDS = {"of", "and", "the", "for", "in", "on", "at", "to", "de", "a", "an", "or"}
KEEP_UPPER = {
    "LLC", "LP", "LLP", "PLC", "NV", "SA", "AG", "SE", "USA", "US", "UK", "II", "III", "IV", "REIT", "ETF",
    "PNC", "CSX", "NRG", "IBM", "AES", "CMS", "DTE", "PPL", "EOG", "NVR", "BOK", "UMB", "KKR", "TPG", "MSCI",
    "MDU", "SPX", "KLA", "LKQ", "NCR", "RPM", "SEI", "SJW", "SLM", "UGI", "WEC", "WEX", "XPO", "ICU", "IDT",
    "AMN", "CNO", "CNX", "EQT", "FMC", "HNI", "MKS", "MSA", "NBT", "OFG", "RLI", "TTM", "UFP", "BRT", "CBL",
}


def display_name(name):
    """SEC names are often in capitals; set them in ordinary title case."""
    if not name:
        return name
    # drop EDGAR's state-of-incorporation suffixes such as "/DE/" or "\\DE\\"
    name = re.sub(r"\s*[/\\][A-Za-z]{2,3}[/\\]?\s*$", "", name).strip()
    if any(ch.islower() for ch in name):
        return name
    out = []
    for i, w in enumerate(name.split()):
        core = w.strip(",.()")
        if (
            core in KEEP_UPPER
            or "&" in core
            or re.fullmatch(r"(?:[A-Z]\.)+[A-Z]?\.?", w.strip(",()"))
            or (len(core) <= 3 and not any(v in core for v in "AEIOUY"))
        ):
            out.append(w)
        elif core.lower() in SMALL_WORDS and i > 0:
            out.append(w.lower())
        else:
            out.append("-".join(part[:1].upper() + part[1:].lower() for part in w.split("-")))
    return " ".join(out)


def frac(v):
    if v is None:
        return None
    if isinstance(v, int):
        return Fraction(v)
    return Fraction(repr(v)) if isinstance(v, float) else Fraction(str(v))


def unit_of(x):
    """Largest rounding unit consistent with a reported value (1e6 down to 1)."""
    if x == 0:
        return None
    if x.denominator != 1:
        d = 1
        while (x * d).denominator != 1 and d < 10**6:
            d *= 10
        return Fraction(1, d)
    n = abs(x.numerator)
    for k in range(6, 0, -1):
        if n % 10**k == 0:
            return Fraction(10**k)
    return Fraction(1)


def round_cent(x):
    """Round half away from zero to the cent, as financial statements do."""
    cents = math.floor(abs(x) * 100 + Fraction(1, 2))
    return Fraction(cents, 100) * (1 if x >= 0 else -1)


def eps_range(n, d, un, ud):
    """Every EPS consistent with n and d, given how they were rounded."""
    if d is None or n is None or d <= 0 or ud is None or un is None:
        return None
    dl, dh = d - ud / 2, d + ud / 2
    if dl <= 0:
        return None
    nl, nh = n - un / 2, n + un / 2
    corners = [nl / dl, nl / dh, nh / dl, nh / dh]
    return min(corners), max(corners)


def digit_info(lo, hi):
    """Tenth-of-a-cent digit and the finer 1/100-cent bin, if the range pins them down."""
    if lo < 0 < hi:
        return None, None
    a, b = sorted((abs(lo), abs(hi)))
    d1, d2 = math.floor(a * 1000), math.floor(b * 1000)
    digit = d1 % 10 if d1 == d2 else None
    f1, f2 = math.floor(a * 10000), math.floor(b * 10000)
    fine = f1 % 100 if f1 == f2 else None
    return digit, fine


def scale_units(rows):
    """Per filing, the finest rounding unit seen among its numerators and denominators.

    A filing reports all of its income statement figures at one scale, so if
    any numerator in a filing is exact to the thousand, all of them are.
    """
    units = defaultdict(lambda: [None, None])
    for r in rows:
        u = units[r[ACCN]]
        for i in NUM_IDX:
            if r[i] is not None and r[i] != 0:
                v = unit_of(frac(r[i]))
                u[0] = v if u[0] is None else min(u[0], v)
        for i in DEN_IDX:
            if r[i] is not None and r[i] != 0:
                v = unit_of(frac(r[i]))
                u[1] = v if u[1] is None else min(u[1], v)
    return units


def observe(r, units, series):
    """Rebuild unrounded EPS for one period. Returns a dict describing the attempt."""
    if series == "diluted":
        if r[EPS_D] is not None:
            reported = r[EPS_D]
            nums = [NUM_D, NUM_B, NI]
            dens = [SH_D, SH_BD] + ([SH_B] if r[EPS_B] is None or r[EPS_B] == r[EPS_D] else [])
        elif r[EPS_BD] is not None:
            reported = r[EPS_BD]
            nums = [NUM_B, NUM_D, NI]
            dens = [SH_BD, SH_B, SH_D]
        else:
            return None
    else:
        if r[EPS_B] is not None:
            reported = r[EPS_B]
        elif r[EPS_BD] is not None:
            reported = r[EPS_BD]
        else:
            return None
        nums = [NUM_B, NI]
        dens = [SH_B, SH_BD]

    rep = frac(reported)
    obs = {"reported": rep}
    if (rep * 100).denominator != 1:
        obs["status"] = "decimals"  # EPS reported to more than two decimals
        return obs
    un, ud = units[r[ACCN]]
    best_imprecise = None
    tried = False
    for ni in nums:
        for di in dens:
            n, d = frac(r[ni]), frac(r[di])
            rng = eps_range(n, d, un, ud)
            if rng is None:
                continue
            tried = True
            lo, hi = rng
            if not (round_cent(lo) <= rep <= round_cent(hi)):
                continue
            digit, fine = digit_info(lo, hi)
            found = {
                "n": n,
                "d": d,
                "mid": n / d,
                "lo": lo,
                "hi": hi,
                "digit": digit,
                "fine": fine,
                "src": "avail" if ni in (NUM_B, NUM_D) else "ni",
            }
            if digit is not None:
                obs.update(found)
                obs["status"] = "ok" if abs(rep) >= MIN_EPS else "small"
                return obs
            if best_imprecise is None:
                best_imprecise = found
    if best_imprecise:
        obs.update(best_imprecise)
        obs["status"] = "imprecise" if abs(rep) >= MIN_EPS else "small"
    else:
        obs["status"] = "mismatch" if tried else "missing"
    return obs


def near_miss(r, units):
    """For a quarter that fails the tie-out: +1 if the rebuilt EPS rounds one cent
    lower than reported, -1 if one cent higher, None otherwise."""
    un, ud = units[r[ACCN]]
    rep = frac(r[EPS_D] if r[EPS_D] is not None else r[EPS_BD])
    for ni in (NUM_D, NUM_B, NI):
        for di in (SH_D, SH_BD, SH_B):
            n, d = frac(r[ni]), frac(r[di])
            if eps_range(n, d, un, ud) is None:
                continue
            diff = (rep - round_cent(n / d)) * 100
            return int(diff) if abs(diff) == 1 else None
    return None


def label(r):
    fp = r[FP] or ""
    if r[KIND] == "Q" and fp == "FY":
        fp = "Q4"
    if r[KIND] == "A":
        fp = "FY"
    return fp


def filer_category(raw):
    raw = (raw or "").replace("<br>", "|").replace("<br/>", "|").lower()
    if "large accelerated" in raw:
        return "Large accelerated"
    if "non-accelerated" in raw:
        return "Non-accelerated"
    if "accelerated" in raw:
        return "Accelerated"
    return "Other or unknown"


def office_name(raw):
    """SEC review office, e.g. '06 Technology' or 'Office of Technology' -> 'Technology'."""
    raw = (raw or "").strip()
    if not raw:
        return "Unknown"
    raw = raw.lstrip("0123456789 ").strip()
    if raw in OFFICE_LABEL:
        return OFFICE_LABEL[raw]
    if raw.startswith("Office of "):
        raw = raw[len("Office of "):]
    return raw.replace(" and ", " & ")


def r6(x):
    return None if x is None else round(float(x), 6)


def tally():
    return {"counts": [0] * 10, "n": 0}


def add(t, digit):
    t["counts"][digit] += 1
    t["n"] += 1


def describe(t, focus=4, mirror=5):
    """Digit shares plus the standard tests, for one group of observations."""
    n = t["n"]
    out = {"n": n, "counts": t["counts"]}
    if n < 30:
        return out
    k4, k5 = t["counts"][focus], t["counts"][mirror]
    stat, df, p = S.chi2_gof(t["counts"], [0.1] * 10)
    lo4, hi4 = S.prop_interval(k4, n)
    z4, p4 = S.one_prop_z(k4, n, 0.1)
    out.update(
        {
            "share4": k4 / n,
            "share5": k5 / n,
            "ci4": [lo4, hi4],
            "z4": z4,
            "p4": p4,
            "chi2": stat,
            "df": df,
            "pchi2": p,
            "fours_missing": 0.1 * n - k4,
        }
    )
    return out


def main():
    with open(os.path.join(CACHE, "tickers.json")) as f:
        tickers = json.load(f)
    profiles = {}
    ppath = os.path.join(CACHE, "profiles.json")
    if os.path.exists(ppath):
        with open(ppath) as f:
            profiles = json.load(f)

    # The SEC assigns each filer to a review office by SIC code. Older or
    # deregistered filers often have the office blank, so fill it from the most
    # common office among current filers with the same SIC code.
    by_sic = defaultdict(Counter)
    for prof in profiles.values():
        if prof.get("office") and prof.get("sic"):
            by_sic[prof["sic"]][prof["office"]] += 1
    sic_office = {sic: c.most_common(1)[0][0] for sic, c in by_sic.items()}
    for prof in profiles.values():
        if not prof.get("office") and prof.get("sic") in sic_office:
            prof["office"] = sic_office[prof["sic"]]

    funnel = {k: Counter() for k in ("Q", "A")}
    near = Counter()  # direction of one-cent tie-out failures
    groups = defaultdict(tally)  # aggregate digit tallies
    fine_pos = [0] * 100
    fine_neg = [0] * 100
    fine_clean = [0] * 100
    by_year = defaultdict(lambda: [0, 0, 0])  # n, fours, fives
    companies = []
    detail = {}
    examples = []

    with gzip.open(FACTS, "rt", encoding="utf-8") as fh:
        for line in fh:
            c = json.loads(line)
            cik = str(c["cik"])
            c["name"] = display_name(c["name"])
            rows = c["rows"]
            units = scale_units(rows)
            prof = profiles.get(cik, {})
            tick = tickers.get(cik, [None, None])
            office = office_name(prof.get("office"))
            cat = filer_category(prof.get("cat"))

            co_rows = []
            co = tally()
            co_loss = tally()
            years = []
            # First pass: does every testable quarter of this company tie out?
            # Companies whose rebuilt EPS runs slightly high or low (two-class
            # method, untagged adjustments) fail the tie-out whenever a value
            # crosses the half-cent line, and those dropped quarters remove
            # digits next to the line. Companies that never fail are the
            # cleanest reconstructions, used as a robustness check.
            tried = mism = 0
            for r in rows:
                if r[KIND] != "Q":
                    continue
                o0 = observe(r, units, "diluted")
                if o0 is None:
                    continue
                if o0["status"] in ("ok", "imprecise", "small", "mismatch"):
                    tried += 1
                if o0["status"] == "mismatch":
                    mism += 1
            clean = mism == 0 and tried >= 8
            for r in rows:
                kind = r[KIND]
                o = observe(r, units, "diluted")
                if o is None:
                    continue
                funnel[kind]["reported"] += 1
                funnel[kind][o["status"]] += 1
                if o["status"] == "mismatch" and kind == "Q" and abs(o["reported"]) >= MIN_EPS:
                    nm = near_miss(r, units)
                    if nm == -1:
                        near["up"] += 1
                    elif nm == 1:
                        near["down"] += 1
                ob = observe(r, units, "basic")

                if o["status"] == "ok":
                    digit = o["digit"]
                    positive = o["reported"] > 0
                    if kind == "Q":
                        g = "q_pos" if positive else "q_neg"
                        add(groups[g], digit)
                        if positive:
                            add(co, digit)
                            add(groups["office:" + office], digit)
                            add(groups["cat:" + cat], digit)
                            when = "after" if r[FILED] >= INITIATIVE_DATE else "before"
                            add(groups["era:" + when], digit)
                            if o["src"] == "avail":
                                add(groups["q_pos_strict"], digit)
                            if clean:
                                add(groups["q_pos_clean"], digit)
                                add(groups["era_clean:" + when], digit)
                                if o["fine"] is not None:
                                    fine_clean[o["fine"]] += 1
                            if o["fine"] is not None:
                                # placebo: nobody manages the hundredth of a cent
                                add(groups["placebo"], o["fine"] % 10)
                            y = by_year[r[END][:4]]
                            y[0] += 1
                            y[1] += digit == 4
                            y[2] += digit == 5
                            years.append(int(r[END][:4]))
                            if o["fine"] is not None:
                                fine_pos[o["fine"]] += 1
                        else:
                            add(co_loss, digit)
                            if o["fine"] is not None:
                                fine_neg[o["fine"]] += 1
                    else:
                        add(groups["a_pos" if positive else "a_neg"], digit)
                if ob and ob.get("status") == "ok" and kind == "Q" and ob["reported"] > 0:
                    add(groups["q_pos_basic"], ob["digit"])

                co_rows.append(
                    [
                        r[END],
                        r[START],
                        kind,
                        label(r),
                        r[FY],
                        r[FORM],
                        r[ACCN],
                        r[FILED],
                        float(o["reported"]),
                        None if o.get("n") is None else int(o["n"]) if o["n"].denominator == 1 else float(o["n"]),
                        None if o.get("d") is None else int(o["d"]) if o["d"].denominator == 1 else float(o["d"]),
                        r6(o.get("lo")),
                        r6(o.get("hi")),
                        o.get("digit"),
                        o["status"],
                        o.get("src"),
                    ]
                )
                if (
                    o["status"] == "ok"
                    and kind == "Q"
                    and o.get("fine") is not None
                    and o["src"] == "avail"
                    and o["reported"] > Fraction(1, 2)
                    and o["n"].denominator == 1
                    and o["d"].denominator == 1
                    and tick[0]
                ):
                    examples.append((cik, tick[0], c["name"], r[END], label(r), r[FY], float(o["reported"]), r6(o["lo"]), r6(o["hi"]), o["digit"], o["fine"], int(o["n"]), int(o["d"]), r[FORM]))

            if not co_rows:
                continue
            n = co["n"]
            k4, k5 = co["counts"][4], co["counts"][5]
            entry = {
                "cik": int(cik),
                "ticker": tick[0],
                "exch": tick[1],
                "name": c["name"],
                "office": office,
                "cat": cat,
                "sicd": prof.get("sicd", ""),
                "n": n,
                "k4": k4,
                "k5": k5,
                "counts": co["counts"],
                "nloss": co_loss["n"],
                "nmis": mism,
                "clean": clean,
                "loss_counts": co_loss["counts"],
                "first": min(years) if years else None,
                "last": max(years) if years else None,
                # two one-sided tests: too few 4s, and too many 5s
                "p4": S.binom_cdf(k4, n, 0.1) if n >= MIN_QUARTERS else None,
                "p5": S.binom_sf(k5, n, 0.1) if n >= MIN_QUARTERS else None,
            }
            entry["p"] = None if entry["p4"] is None else min(entry["p4"], entry["p5"])
            companies.append(entry)
            detail[cik] = co_rows

    # Many companies are tested at once (two tests each), so adjust for false
    # alarms across every test with Benjamini-Hochberg.
    tested = [e for e in companies if e["p"] is not None]
    qs = S.bh_qvalues([e["p4"] for e in tested] + [e["p5"] for e in tested])
    m = len(tested)
    for i, e in enumerate(tested):
        e["q4"], e["q5"] = qs[i], qs[m + i]
        e["q"] = min(e["q4"], e["q5"])
        e["signal"] = "5s" if e["p5"] < e["p4"] else "4s"
    ranked = sorted(tested, key=lambda e: (e["p"], -e["n"]))
    for i, e in enumerate(ranked, 1):
        e["rank"] = i

    # ---- aggregate results ----
    summary = {
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "min_eps": float(MIN_EPS),
        "min_quarters": MIN_QUARTERS,
        "initiative_date": INITIATIVE_DATE,
        "companies_total": len(companies),
        "companies_tested": m,
        "funnel": {k: dict(v) for k, v in funnel.items()},
        "near_miss": dict(near),
        "groups": {k: describe(v) for k, v in groups.items()},
        "fine_pos": fine_pos,
        "fine_neg": fine_neg,
        "fine_clean": fine_clean,
        "by_year": {y: {"n": v[0], "k4": v[1], "k5": v[2]} for y, v in sorted(by_year.items())},
    }
    g = summary["groups"]
    if "era:before" in groups and "era:after" in groups:
        b, a = groups["era:before"], groups["era:after"]
        z, p = S.two_prop_z(a["counts"][4], a["n"], b["counts"][4], b["n"])
        summary["era_test"] = {"z": z, "p": p}
    if "era_clean:before" in groups and "era_clean:after" in groups:
        b, a = groups["era_clean:before"], groups["era_clean:after"]
        z, p = S.two_prop_z(a["counts"][4], a["n"], b["counts"][4], b["n"])
        summary["era_test_clean"] = {"z": z, "p": p}
    # share of quarters in the round-up half (digits 5-9) vs 50%
    for key in ("q_pos", "q_pos_clean", "placebo"):
        t = groups.get(key)
        if t and t["n"]:
            up = sum(t["counts"][5:])
            z, p = S.one_prop_z(up, t["n"], 0.5)
            summary["groups"][key]["roundup"] = up / t["n"]
            summary["groups"][key]["roundup_z"] = z
            summary["groups"][key]["roundup_p"] = p
    qpos = groups["q_pos"]
    summary["headline"] = {
        "observations": qpos["n"],
        "companies": sum(1 for e in companies if e["n"] > 0),
        "share4": qpos["counts"][4] / qpos["n"] if qpos["n"] else None,
        "share5": qpos["counts"][5] / qpos["n"] if qpos["n"] else None,
    }
    # How many companies would look this unusual by luck alone?
    summary["luck"] = {
        "tested": m,
        "p01": sum(1 for e in tested if e["p4"] <= 0.01),
        "p01_expected": round(0.01 * m, 1),
        "p001": sum(1 for e in tested if e["p4"] <= 0.001),
        "p001_expected": round(0.001 * m, 1),
        "p5_01": sum(1 for e in tested if e["p5"] <= 0.01),
        "p5_001": sum(1 for e in tested if e["p5"] <= 0.001),
        "q05": sum(1 for e in tested if e["q"] <= 0.05),
        "q10": sum(1 for e in tested if e["q"] <= 0.10),
    }
    # Distribution of fours across companies vs. what pure chance would give.
    zp = [0.9 ** e["n"] for e in tested]
    zobs = sum(1 for e in tested if e["k4"] == 0)
    zexp = sum(zp)
    zsd = math.sqrt(sum(p * (1 - p) for p in zp)) or 1
    summary["zero_fours"] = {"observed": zobs, "expected": zexp, "z": (zobs - zexp) / zsd}
    summary["clean_companies"] = sum(1 for e in companies if e["clean"] and e["n"] > 0)

    summary["board"] = [
        {k: e.get(k) for k in ("cik", "ticker", "name", "n", "k4", "k5", "p4", "p5", "q4", "q5", "p", "q", "signal", "rank", "office")}
        for e in ranked[:15]
    ]

    def margin(r):
        """Cents by which a profitable quarter's rebuilt EPS cleared (or missed) the
        half-cent line, using the conservative end of its range."""
        lo, hi, status = r[11], r[12], r[14]
        if status != "ok" or lo is None or lo <= 0:
            return None
        x = Fraction(str(lo)) if r[13] == 5 else Fraction(str(hi))
        line = Fraction(math.floor(x * 100), 100) + Fraction(1, 200)
        return round(float((x - line) * 100), 4)

    by_tick = {e["ticker"]: e for e in companies if e["ticker"]}
    cases = []
    for case in CASES:
        e = by_tick.get(case["ticker"])
        item = dict(case)
        if e:
            rows = detail[str(e["cik"])]
            inside = [r for r in rows if r[2] == "Q" and case["from"] <= r[0] <= case["to"]]
            item.update({"cik": e["cik"], "n": e["n"], "k4": e["k4"], "k5": e["k5"], "p4": e.get("p4"), "p5": e.get("p5"),
                         "q": e.get("q"), "rank": e.get("rank"),
                         "window": [[r[0], r[3], r[4], r[8], r[13], r[14], r[0] in case["key"], margin(r)] for r in inside]})
        cases.append(item)
    summary["cases"] = cases

    # A few clean real examples for the explainer: a 4 and a 5 next to each other.
    examples.sort(key=lambda x: x[3], reverse=True)
    pick = {}
    for ex in examples:
        if ex[9] == 4 and 42 <= ex[10] <= 46 and "four" not in pick:
            pick["four"] = ex
        if ex[9] == 5 and 53 <= ex[10] <= 57 and "five" not in pick:
            pick["five"] = ex
        if len(pick) == 2:
            break
    summary["examples"] = {
        k: dict(zip(["cik", "ticker", "name", "end", "fp", "fy", "reported", "lo", "hi", "digit", "fine", "num", "den", "form"], v))
        for k, v in pick.items()
    }

    # ---- write ----
    os.makedirs(os.path.join(OUT, "co"), exist_ok=True)
    with open(os.path.join(OUT, "summary.json"), "w") as f:
        json.dump(summary, f, separators=(",", ":"))

    cols = ["cik", "ticker", "name", "office", "cat", "n", "k4", "k5", "p4", "p5", "q", "rank", "first", "last", "nloss", "clean"]
    table = []
    for e in sorted(companies, key=lambda e: (e["name"] or "").lower()):
        if e["n"] == 0:
            continue
        table.append([e.get(k) if not isinstance(e.get(k), float) else float(f"{e[k]:.6g}") for k in cols])
    with open(os.path.join(OUT, "companies.json"), "w") as f:
        json.dump({"cols": cols, "rows": table, "tested": m}, f, separators=(",", ":"))

    # small lookup for the search box: ticker, CIK, name
    index = sorted(
        ([e["ticker"], e["cik"], e["name"]] for e in companies if e["n"] > 0 or e["nloss"] > 0),
        key=lambda r: (r[0] is None, (r[0] or ""), r[2].lower()),
    )
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump({"rows": index}, f, separators=(",", ":"))

    case_by_ticker = {c["ticker"]: c for c in CASES}
    keep = set()
    rcols = ["end", "start", "kind", "fp", "fy", "form", "accn", "filed", "eps", "num", "den", "lo", "hi", "digit", "status", "src"]
    for e in companies:
        cik = str(e["cik"])
        if e["n"] == 0 and e["nloss"] == 0:
            continue
        keep.add(cik + ".json")
        body = {k: e.get(k) for k in ("cik", "ticker", "exch", "name", "office", "cat", "sicd", "n", "k4", "k5", "counts",
                                       "nloss", "loss_counts", "p4", "p5", "q4", "q5", "p", "q", "signal", "rank", "first", "last",
                                       "nmis", "clean")}
        body["tested"] = m
        case = case_by_ticker.get(e["ticker"])
        if case:
            body["case"] = {k: case[k] for k in ("date", "penalty", "what", "url", "from", "to", "key")}
        body["cols"] = rcols
        body["rows"] = detail[cik]
        with open(os.path.join(OUT, "co", cik + ".json"), "w") as f:
            json.dump(body, f, separators=(",", ":"))
    # remove pages for companies that dropped out
    for name in os.listdir(os.path.join(OUT, "co")):
        if name.endswith(".json") and name not in keep:
            os.remove(os.path.join(OUT, "co", name))

    h = summary["headline"]
    print(f"{h['observations']:,} quarterly observations from {h['companies']:,} companies")
    if h["share4"] is not None:
        print(f"share of 4s: {h['share4']:.4f}   share of 5s: {h['share5']:.4f}")
    print("funnel:", summary["funnel"])
    print("luck:", summary["luck"], "zero fours:", summary["zero_fours"])


if __name__ == "__main__":
    main()

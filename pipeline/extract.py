"""Step 1: pull the raw facts we need from the SEC.

Downloads the SEC's nightly companyfacts.zip (every XBRL number every
company has filed), keeps only the handful of facts needed to rebuild
earnings per share, and writes one compact line per company to
build/facts.jsonl.gz.

For each company and each fiscal period we keep the numbers from the
*first* 10-Q or 10-K that reported that period as its current period.
Later filings repeat old periods as comparatives, sometimes restated or
split-adjusted; those are ignored, because the rounding question is
about what the company published at the time.

Also refreshes two small lookup files the analysis uses:
  pipeline/cache/tickers.json  ticker and exchange for each CIK
  pipeline/cache/profiles.json industry and filer status for each CIK

Only the Python standard library is required. orjson is used if present.
"""

import gzip
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile
from datetime import date

try:
    import orjson

    loads = orjson.loads
except ImportError:  # works without it, just slower
    loads = json.loads

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BUILD = os.path.join(ROOT, "build")
CACHE = os.path.join(HERE, "cache")

# The SEC asks every automated client to identify itself with a contact email.
USER_AGENT = os.environ.get(
    "SEC_USER_AGENT", "The Missing Fours research project HagenThibault@gmail.com"
)
ZIP_URL = "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip"
TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
PROFILE_URL = "https://data.sec.gov/submissions/CIK{:010d}.json"

# Reported EPS, the numerators and the denominators, in the order they are stored.
EPS = [
    "EarningsPerShareBasic",
    "EarningsPerShareDiluted",
    "EarningsPerShareBasicAndDiluted",
]
NUM = [
    "NetIncomeLossAvailableToCommonStockholdersBasic",
    "NetIncomeLossAvailableToCommonStockholdersDiluted",
    "NetIncomeLoss",
]
DEN = [
    "WeightedAverageNumberOfSharesOutstandingBasic",
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
]
CONCEPTS = EPS + NUM + DEN
UNIT = {c: "USD/shares" for c in EPS}
UNIT.update({c: "USD" for c in NUM})
UNIT.update({c: "shares" for c in DEN})

FORMS = {"10-Q", "10-K", "10-Q/A", "10-K/A", "10-KT", "10-QT", "10-KT/A", "10-QT/A"}


def get(url, accept_gzip=True, tries=5):
    """GET a URL politely, retrying on rate limits and server errors."""
    headers = {"User-Agent": USER_AGENT}
    if accept_gzip:
        headers["Accept-Encoding"] = "gzip"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (403, 429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(2 ** attempt * 3)
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt < tries - 1:
                time.sleep(2 ** attempt * 3)
                continue
            raise


def download(url, path):
    """Stream a large file to disk."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as out:
        total = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
            total += len(chunk)
    print(f"downloaded {total / 1e6:,.0f} MB from {url}", flush=True)


def duration_kind(start, end):
    """'Q' for a single quarter, 'A' for a full year, None otherwise.

    The quarter window runs to 120 days because some retailers and grocers
    report a 16-week first quarter (112 days)."""
    days = (date.fromisoformat(end) - date.fromisoformat(start)).days
    if 80 <= days <= 120:
        return "Q"
    if 350 <= days <= 380:
        return "A"
    return None


def compact(company):
    """Reduce one companyfacts JSON document to the rows we analyse."""
    gaap = company.get("facts", {}).get("us-gaap", {})
    facts = []  # (concept, start, end, kind, val, accn, form, filed, fy, fp)
    for i, concept in enumerate(CONCEPTS):
        units = gaap.get(concept, {}).get("units", {}).get(UNIT[concept], [])
        for f in units:
            start, end = f.get("start"), f.get("end")
            if not start or not end or f.get("form") not in FORMS:
                continue
            kind = duration_kind(start, end)
            if kind is None:
                continue
            facts.append((i, start, end, kind, f["val"], f["accn"], f["form"], f["filed"],
                          f.get("fy"), f.get("fp")))
    if not any(f[0] < len(EPS) for f in facts):
        return None

    # The latest period end inside a filing is that filing's own period.
    # Anything ending earlier is a comparative repeated from an older report.
    period_end = {}
    for f in facts:
        if f[2] > period_end.get(f[5], ""):
            period_end[f[5]] = f[2]
    facts = [f for f in facts if f[2] == period_end[f[5]]]

    # For each period, the first filing that reported EPS for it is the original.
    first = {}
    for f in facts:
        if f[0] >= len(EPS):
            continue
        key = (f[1], f[2], f[3])
        rank = (f[7], f[6].endswith("/A"), f[5])  # filed date, prefer originals
        if key not in first or rank < first[key][0]:
            first[key] = (rank, f[5], f[6], f[7], f[8], f[9])

    rows = {}
    conflicts = 0
    for f in facts:
        key = (f[1], f[2], f[3])
        if key not in first or f[5] != first[key][1]:
            continue
        row = rows.setdefault(key, [None] * len(CONCEPTS))
        if row[f[0]] is not None and row[f[0]] != f[4]:
            conflicts += 1  # same filing tagged two different values
            row[f[0]] = "conflict"
        elif row[f[0]] is None:
            row[f[0]] = f[4]

    out = []
    for key in sorted(rows):
        _, accn, form, filed, fy, fp = first[key]
        vals = [None if v == "conflict" else v for v in rows[key]]
        out.append([key[0], key[1], key[2], accn, form, filed, fy, fp] + vals)

    pf = company.get("facts", {}).get("dei", {}).get("EntityPublicFloat", {})
    floats = pf.get("units", {}).get("USD", [])
    latest_float = None
    if floats:
        best = max(floats, key=lambda f: (f.get("end", ""), f.get("filed", "")))
        latest_float = [best.get("end"), best.get("val")]

    return {
        "cik": int(company.get("cik", 0)),
        "name": company.get("entityName", ""),
        "float": latest_float,
        "conflicts": conflicts,
        "rows": out,
    }


def extract(zip_path, out_path):
    kept = scanned = 0
    t0 = time.time()
    with zipfile.ZipFile(zip_path) as z, gzip.open(out_path, "wt", encoding="utf-8") as out:
        names = [n for n in z.namelist() if n.endswith(".json")]
        print(f"{len(names):,} company files in archive", flush=True)
        for name in names:
            scanned += 1
            try:
                company = loads(z.read(name))
            except Exception as e:  # a corrupt member should not stop the run
                print(f"skip {name}: {e}", flush=True)
                continue
            c = compact(company)
            if c and c["rows"]:
                if not c["cik"]:
                    c["cik"] = int(name[3:13])
                out.write(json.dumps(c, separators=(",", ":")) + "\n")
                kept += 1
            if scanned % 2000 == 0:
                print(f"  {scanned:,} scanned, {kept:,} kept, {time.time() - t0:,.0f}s", flush=True)
    print(f"kept {kept:,} of {scanned:,} companies in {time.time() - t0:,.0f}s", flush=True)
    return kept


def refresh_tickers():
    body = get(TICKERS_URL)
    data = json.loads(body)
    fields = data["fields"]
    tickers = {}
    for rec in data["data"]:
        r = dict(zip(fields, rec))
        cik = str(r["cik"])
        # keep the first listing per CIK, which is the SEC's primary one
        tickers.setdefault(cik, [r.get("ticker"), r.get("exchange")])
    with open(os.path.join(CACHE, "tickers.json"), "w") as f:
        json.dump(tickers, f, separators=(",", ":"), sort_keys=True)
    print(f"tickers for {len(tickers):,} companies", flush=True)


def refresh_profiles(facts_path, min_rows=8, budget_s=45 * 60):
    """Industry and filer status for each company, fetched once and cached."""
    path = os.path.join(CACHE, "profiles.json")
    profiles = {}
    if os.path.exists(path):
        with open(path) as f:
            profiles = json.load(f)
    wanted = []
    with gzip.open(facts_path, "rt", encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            if len(c["rows"]) >= min_rows and str(c["cik"]) not in profiles:
                wanted.append(c["cik"])
    print(f"fetching {len(wanted):,} new company profiles", flush=True)
    t0 = time.time()
    for n, cik in enumerate(wanted, 1):
        if time.time() - t0 > budget_s:
            print("profile time budget used up; the rest will be fetched next run", flush=True)
            break
        try:
            body = get(PROFILE_URL.format(cik))
        except Exception as e:
            print(f"profile {cik}: {e}", flush=True)
            continue
        if body:
            s = json.loads(body)
            profiles[str(cik)] = {
                "sic": s.get("sic") or "",
                "sicd": s.get("sicDescription") or "",
                "office": s.get("ownerOrg") or "",
                "cat": s.get("category") or "",
                "state": s.get("stateOfIncorporation") or "",
                "fye": s.get("fiscalYearEnd") or "",
            }
        time.sleep(0.12)  # stays under the SEC's limit of 10 requests per second
        if n % 500 == 0:
            print(f"  {n:,} profiles, {time.time() - t0:,.0f}s", flush=True)
            with open(path, "w") as f:
                json.dump(profiles, f, separators=(",", ":"), sort_keys=True)
    with open(path, "w") as f:
        json.dump(profiles, f, separators=(",", ":"), sort_keys=True)
    print(f"profiles cached for {len(profiles):,} companies", flush=True)


def main():
    os.makedirs(BUILD, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    zip_path = os.path.join(BUILD, "companyfacts.zip")
    out_path = os.path.join(BUILD, "facts.jsonl.gz")
    if "--keep-zip" not in sys.argv or not os.path.exists(zip_path):
        download(ZIP_URL, zip_path)
    extract(zip_path, out_path)
    if "--keep-zip" not in sys.argv:
        os.remove(zip_path)
    refresh_tickers()
    refresh_profiles(out_path)


if __name__ == "__main__":
    main()

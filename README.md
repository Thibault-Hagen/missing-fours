# The Missing Fours

Public companies report earnings per share (EPS) rounded to the cent. This project rebuilds the
unrounded EPS of every quarterly report it can from the SEC's XBRL data and looks at the digit that
rounding throws away: the tenth of a cent. With honest numbers that digit should be 4 about 10% of the
time. A shortage of 4s, with extra digits just past the half-cent line, is the signature of companies
nudging results up to the next cent, the same pattern the SEC's EPS Initiative uses to look for
earnings management.

**Live site: https://thibault-hagen.github.io/missing-fours/**

- **Story**: the market-wide digit distribution and the checks on it, the slices of a cent on either
  side of the half-cent line, losses (where the incentive reverses), the trend before and after the
  SEC's first EPS Initiative cases, results by filer size and industry, and the five companies the
  SEC has charged.
- **Companies**: every company with at least one tested quarter, with two tests for those with 20 or
  more, adjusted for testing over a thousand companies at once.
- **Company pages**: each quarter's reported EPS, numerator, share count, rebuilt EPS and digit, with
  a link to the filing it came from.

## How it works

Everything runs on free GitHub services. Each Saturday a GitHub Actions job:

1. **Downloads** the SEC's `companyfacts.zip` (every XBRL fact every company has filed) and keeps the
   EPS facts, EPS numerators and weighted-average share counts for single quarters and full years
   (`pipeline/extract.py`).
2. **Keeps the first-reported version** of each period, ignoring later comparatives that may be
   restated or split-adjusted.
3. **Recalculates EPS** as net income available to common shareholders divided by weighted-average
   diluted shares, and keeps it only if it rounds back to the EPS the company reported
   (`pipeline/analyze.py`).
4. **Accounts for rounded inputs.** Filings report in thousands or millions, so each EPS is a range.
   The digit is used only when the whole range agrees on it. All arithmetic uses exact fractions.
5. **Tests the digits** (`pipeline/stats.py`, no third-party libraries):
   - chi-square goodness of fit for the market as a whole, with a one-proportion interval for 4s;
   - two one-sided binomial tests per company (too few 4s, too many 5s), with Benjamini-Hochberg
     q-values across every test;
   - a two-proportion z-test before and after the SEC's first EPS Initiative cases (September 2020).
6. **Checks itself**:
   - a placebo test on the next digit (the hundredth of a cent), which nobody has a reason to manage;
   - the same test restricted to companies whose every quarter ties out, because the tie-out filter
     is not neutral: a rebuild that runs slightly high fails exactly when a value sits next to the
     half-cent line, which removes 5s (most one-cent failures run high, and the share is reported);
   - basic EPS, and only quarters with the exact EPS numerator tagged.
7. **Publishes** the results to the `data` branch and redeploys GitHub Pages.

The site is plain HTML, CSS and JavaScript with hand-drawn SVG charts (`site/`).

## Repository layout

```
pipeline/extract.py      download companyfacts.zip, keep first-reported EPS facts
pipeline/analyze.py      rebuild unrounded EPS, read the digit, run the tests and checks, write JSON
pipeline/stats.py        binomial, chi-square, z procedures, Benjamini-Hochberg
pipeline/cache/          ticker list and company profiles (industry office, filer status)
site/                    the website (GitHub Pages); its data/ folder comes from the data branch
.github/workflows/       weekly rebuild (update.yml) and site deploy (deploy.yml)
```

## Run it yourself

Requires Python 3.10 or later; nothing else is needed (`pip install orjson` makes it faster).

```
export SEC_USER_AGENT="Your Name your.email@example.com"   # the SEC requires a contact email
python pipeline/extract.py      # about 1.3 GB download; writes build/facts.jsonl.gz
python pipeline/analyze.py      # writes site/data/
cd site && python -m http.server 8000
```

Then open http://localhost:8000. To run the GitHub workflow by hand, open the Actions tab, choose
*Rebuild data and publish*, and press **Run workflow**.

## Limits

The strong result is about the market as a whole. A shortage of 4s at one company is a statistical
oddity, not evidence of wrongdoing: most companies have 20 to 60 testable quarters, and with this many
companies some will look unusual by luck, which is why every company page reports a false-alarm rate.
Large companies that report both net income and shares in millions often cannot be tested, because the
rounding in their inputs is too coarse to pin down the digit. The site tests GAAP diluted EPS; analysts'
consensus usually targets adjusted EPS, which is not in XBRL. Loss quarters do not show the reversed
pattern that deliberate rounding would predict, and the before-and-after comparison is observational.

## References

- Malenko, N., Grundfest, J. A., and Shen, Y. (2023). Quadrophobia: Strategic rounding of EPS data.
  *Journal of Financial and Quantitative Analysis*, 58(8), 3231-3273.
- Das, S., and Zhang, H. (2003). Rounding-up in reported EPS, behavioral thresholds, and earnings
  management. *Journal of Accounting and Economics*, 35(1), 31-50.
- Degeorge, F., Patel, J., and Zeckhauser, R. (1999). Earnings management to exceed thresholds.
  *Journal of Business*, 72(1), 1-33.
- SEC press releases [2020-226](https://www.sec.gov/news/press-release/2020-226),
  [2021-162](https://www.sec.gov/news/press-release/2021-162),
  [2022-64](https://www.sec.gov/news/press-release/2022-64) and
  [Release 34-96819](https://www.sec.gov/enforce/34-96819-s).
- SEC [Staff Accounting Bulletin No. 99](https://www.sec.gov/interps/account/sab99.htm), Materiality.
- SEC [EDGAR application programming interfaces](https://www.sec.gov/edgar/sec-api-documentation).

Built by Thibault Hagen.

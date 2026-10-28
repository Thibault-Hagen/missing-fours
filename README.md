# The Missing Fours

Public companies report earnings per share (EPS) rounded to the cent. This project rebuilds the
unrounded EPS for every quarterly report in the SEC's XBRL data and looks at the digit that rounding
throws away: the tenth of a cent. With honest numbers that digit should be 4 about 10% of the time.
A shortage of 4s, matched by extra 5s, is the signature of companies nudging results up to the next
cent, the same pattern the SEC's EPS Initiative uses to look for earnings management.

**Live site: https://thibault-hagen.github.io/missing-fours/**

- **Story**: the market-wide digit distribution, the pile-up just past half a cent, losses (where
  the incentive reverses), the trend before and after the SEC's first EPS Initiative cases, results
  by filer size and industry, and the five companies the SEC has charged.
- **Companies**: every company with a probability for its count of 4s, adjusted for testing
  thousands of companies at once.
- **Company pages**: each quarter's reported EPS, numerator, share count, rebuilt EPS and digit,
  with a link to the filing it came from.

## How it works

Everything runs on free GitHub services. Each Saturday a GitHub Actions job:

1. **Downloads** the SEC's `companyfacts.zip` (every XBRL fact every company has filed) and keeps
   the EPS facts, EPS numerators and weighted-average share counts for single quarters and full
   years (`pipeline/extract.py`).
2. **Keeps the first-reported version** of each period, ignoring later comparatives that may be
   restated or split-adjusted.
3. **Recalculates EPS** as net income available to common shareholders divided by weighted-average
   diluted shares, and keeps it only if it rounds back to the EPS the company reported
   (`pipeline/analyze.py`).
4. **Accounts for rounded inputs.** Filings report in thousands or millions, so each EPS is a range.
   The digit is used only when the whole range agrees on it. All arithmetic uses exact fractions.
5. **Tests the digits**: chi-square goodness of fit for the market, a binomial probability for each
   company, Benjamini-Hochberg q-values for the multiple-testing problem, and a two-proportion z-test
   around the SEC's September 2020 cases (`pipeline/stats.py`, no third-party libraries).
6. **Publishes** the results to the `data` branch and redeploys GitHub Pages.

The site itself is plain HTML, CSS and JavaScript with hand-drawn SVG charts (`site/`).

## Repository layout

```
pipeline/extract.py      download companyfacts.zip, keep first-reported EPS facts
pipeline/analyze.py      rebuild unrounded EPS, read the digit, compute statistics, write JSON
pipeline/stats.py        binomial, chi-square, z procedures, Benjamini-Hochberg
pipeline/cache/          ticker list and company profiles (industry office, filer status)
site/                    the website (GitHub Pages)
.github/workflows/       weekly rebuild and site deploy
```

## Run it yourself

Requires Python 3.10 or later; nothing else is needed (`pip install orjson` makes it faster).

```
export SEC_USER_AGENT="Your Name your.email@example.com"   # the SEC requires a contact email
python pipeline/extract.py      # about 1.3 GB download; writes build/facts.jsonl.gz
python pipeline/analyze.py      # writes site/data/
cd site && python -m http.server 8000
```

Then open http://localhost:8000.

## Limits

A shortage of 4s at one company is a statistical oddity, not evidence of wrongdoing. Per-company tests
have little power with the 20 to 60 quarters most companies have, and some companies will look unusual
by luck alone, which is why every company page reports a false-alarm rate. Large companies that report
both net income and shares in millions often cannot be tested, because the rounding in their inputs is
too coarse to pin down the digit. The site tests GAAP diluted EPS; analysts' consensus usually targets
adjusted EPS, which is not in XBRL.

## References

- Malenko, N., Grundfest, J. A., and Shen, Y. (2023). Quadrophobia: Strategic rounding of EPS data.
  *Journal of Financial and Quantitative Analysis*, 58(8), 3231-3273.
- Das, S., and Zhang, H. (2003). Rounding-up in reported EPS, behavioral thresholds, and earnings
  management. *Journal of Accounting and Economics*, 35(1), 31-50.
- SEC press releases [2020-226](https://www.sec.gov/news/press-release/2020-226),
  [2021-162](https://www.sec.gov/news/press-release/2021-162),
  [2022-64](https://www.sec.gov/news/press-release/2022-64) and
  [Release 34-96819](https://www.sec.gov/enforce/34-96819-s).
- SEC [EDGAR application programming interfaces](https://www.sec.gov/edgar/sec-api-documentation).

Built by Thibault Hagen.

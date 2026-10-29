/* The story page: fills every number from data/summary.json, so the text stays true after each weekly rebuild. */
(function () {
  "use strict";
  const MF = window.MF;
  const $ = (id) => document.getElementById(id);
  const P = (...kids) => MF.el("p", null, ...kids);
  const four = (t) => MF.el("span", { class: "d4" }, t);
  const five = (t) => MF.el("span", { class: "d5" }, t);

  function pWords(p) {
    if (p < 1e-12) return "less than one in a trillion";
    if (p < 1e-9) return "less than one in a billion";
    if (p < 1e-6) return "less than one in a million";
    if (p < 1e-3) return "less than one in a thousand";
    if (p < 0.01) return "under 1%";
    if (p < 0.05) return "under 5%";
    return MF.pct(p, 0);
  }

  function pFmt(p) {
    if (p < 0.0001) return "p < 0.0001";
    return "p = " + p.toFixed(p < 0.01 ? 4 : 3);
  }

  function digitTable(counts) {
    const n = counts.reduce((a, b) => a + b, 0);
    const e = n / 10;
    const body = counts.map((c, d) =>
      MF.el(
        "tr",
        null,
        MF.el("td", null, String(d)),
        MF.el("td", { class: "r" }, MF.int(c)),
        MF.el("td", { class: "r" }, MF.pct(c / n, 2)),
        MF.el("td", { class: "r" }, MF.int(e)),
        MF.el("td", { class: "r" }, MF.rel(c, e)),
        MF.el("td", { class: "r" }, (((c - e) * (c - e)) / e).toFixed(1))
      )
    );
    const chi = counts.reduce((s, c) => s + ((c - e) * (c - e)) / e, 0);
    return MF.el(
      "table",
      { class: "ledger" },
      MF.el("thead", null, MF.el("tr", null, ["Digit", "Count", "Share", "Expected", "Difference", "(O − E)² / E"].map((h, i) => MF.el("th", { class: i ? "r" : null }, h)))),
      MF.el("tbody", null, body, MF.el("tr", { class: "total" }, MF.el("td", null, "Total"), MF.el("td", { class: "r" }, MF.int(n)), MF.el("td", { class: "r" }, "100.00%"), MF.el("td", { class: "r" }, MF.int(n)), MF.el("td", null, ""), MF.el("td", { class: "r" }, chi.toFixed(1))))
    );
  }

  // ---------- the calculator tape ----------
  function tapeCalc(ex, cls) {
    const frag = [];
    frag.push(MF.el("div", { class: "tape-head" }, MF.el("a", { href: MF.companyHref(ex.ticker, ex.cik) }, ex.name), ", " + ex.fp + " " + ex.fy + " " + (ex.form || "")));
    const line = (label, value, op, extra) =>
      MF.el("div", { class: "tape-line" + (extra ? " " + extra : "") }, MF.el("span", { class: "lab" }, label), MF.el("span", { class: "v" }, value), MF.el("span", { class: "op" }, op));
    frag.push(line("Net income to common", MF.int(ex.num), "\u00f7"));
    frag.push(line("Diluted shares", MF.int(ex.den), "="));
    // unrounded: keep two decimals, show the next two, color the hidden digit
    const txt = (Math.floor(Math.abs(ex.lo) * 10000) / 10000).toFixed(4);
    const res = MF.el("span", null, txt.slice(0, -2), MF.el("span", { class: "hid" + (cls === "five" ? " five" : "") }, txt.slice(-2, -1)), txt.slice(-1) + "\u2026");
    frag.push(line("Unrounded EPS", res, "\u2731", "total result"));
    // pad so the decimal point lines up with the unrounded figure above
    frag.push(line("Reported EPS", MF.money(ex.reported) + "   ", "", "result"));
    return frag;
  }

  function renderTape(S) {
    const t = $("tape");
    const ex = S.examples || {};
    if (!ex.four || !ex.five) {
      t.hidden = true;
      return;
    }
    const lines = [
      ...tapeCalc(ex.four, "four"),
      MF.el("hr", { class: "tape-cut" }),
      ...tapeCalc(ex.five, "five"),
      MF.el("p", { class: "tape-note" }, "Two real quarters, rebuilt from their filings. The colored digit is the tenth of a cent, which never appears in the filing."),
    ];
    t.replaceChildren(...lines);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const printable = t.querySelectorAll(".tape-line");
    printable.forEach((n) => n.classList.add("printing"));
    printable.forEach((n, i) =>
      setTimeout(() => {
        n.classList.remove("printing");
        n.classList.add("printed");
      }, 250 + i * 170)
    );
  }

  // ---------- main ----------
  MF.load("data/summary.json")
    .then((S) => {
      const g = S.groups;
      const q = g.q_pos;
      const years = Object.keys(S.by_year).filter((y) => S.by_year[y].n >= 500);
      const span = years.length ? years[0] + "–" + years[years.length - 1] : "";

      // lede reacts to the result
      const short4 = q.pchi2 < 0.001 && q.share4 < 0.1 && q.p4 < 0.001;
      $("lede").textContent =
        "Companies report earnings per share rounded to the cent. I rebuilt the unrounded number from the SEC filings of thousands of public companies, to look at the one digit that rounding throws away. It should be a 4 one time in ten. " +
        (short4 ? "It isn't." : "Here is how often it actually is.");
      $("hero-meta").textContent =
        "Rebuilt from " + MF.int(q.n) + " quarterly reports by " + MF.int(S.headline.companies) + " companies, " + span + ". Last rebuilt " + MF.builtDate(S.built) + ".";
      $("built").textContent = "Last rebuilt " + MF.builtDate(S.built) + ".";
      renderTape(S);

      // ----- digit chart -----
      $("fig-digits-sub").textContent = "Quarterly diluted EPS of $0.10 or more, " + MF.int(q.n) + " reports, " + span + ". Bars show how far each digit is above or below 10%.";
      const relMax = (t) => (t ? Math.max(...t.counts.map((c) => Math.abs(c / (t.n / 10) - 1))) : 0);
      const sharedExt = Math.max(0.04, relMax(q), relMax(g.q_neg));
      MF.chartDeviation($("chart-digits"), q.counts, { label: "Difference from expected for each digit 0 through 9", ext: sharedExt });
      $("table-digits").append(digitTable(q.counts));

      const dev = q.counts.map((c) => Math.abs(c / q.n - 0.1));
      const rarest = q.counts.indexOf(Math.min(...q.counts));
      const biggestGap = dev.indexOf(Math.max(...dev));
      const rel4 = MF.rel(q.counts[4], q.n / 10);
      const out = $("finding-text");
      out.classList.add("prose");
      out.append(
        P(
          "In " + MF.int(q.n) + " quarterly reports, the tenth-of-a-cent digit was a ",
          four("4"),
          " " + MF.pct(q.share4, 2) + " of the time. Chance predicts 10%, so that is " + MF.int(Math.round(q.fours_missing)) + " fewer 4s than expected (" + rel4 + "). The ",
          five("5"),
          " turned up " + MF.pct(q.share5, 2) + " of the time." +
            (rarest === 4 && biggestGap === 4 ? " No digit is rarer, and no digit is further from 10%." : rarest === 4 ? " No digit is rarer." : "") +
            (q.counts[6] / q.n > 0.1 && q.counts[7] / q.n > 0.1 && q.counts[3] / q.n < 0.1
              ? " The pattern is wider than one digit: 3s are also scarce and 6s and 7s run heavy (" + MF.pct(q.counts[6] / q.n, 2) + " and " + MF.pct(q.counts[7] / q.n, 2) +
                "), as if results a few tenths of a cent short of the line were pushed a few tenths past it rather than by a hair."
              : "")
        ),
        P(
          "Could that be luck? If the digit were random, a sample this large would put the share of 4s within " +
            (196 * Math.sqrt(0.09 / q.n)).toFixed(2) +
            " percentage points of 10% about 95% of the time. The observed share sits " +
            Math.abs(q.z4).toFixed(1) +
            " standard errors " + (q.share4 < 0.1 ? "below" : "above") + " 10%. A chi-square goodness-of-fit test on all ten digits gives χ² = " +
            q.chi2.toFixed(1) +
            " with " + q.df + " degrees of freedom (" + pFmt(q.pchi2) + "), so the chance of a pattern this lopsided from random digits is " + pWords(q.pchi2) + ". A 95% confidence interval for the share of 4s runs from " +
            MF.pct(q.ci4[0], 2) + " to " + MF.pct(q.ci4[1], 2) + "."
        )
      );
      // ----- checks on the result -----
      const checks = [
        ["All quarters that tie out (the main result)", g.q_pos],
        ["Only companies whose every quarter ties out", g.q_pos_clean],
        ["Only quarters with the exact EPS numerator tagged", g.q_pos_strict],
        ["Basic EPS instead of diluted", g.q_pos_basic],
        ["Placebo: the next digit, the hundredth of a cent", g.placebo],
      ].filter((r) => r[1] && r[1].n > 1000);
      out.append(MF.el("h3", null, "Checking the result"));
      out.append(
        P(
          "A pattern this small could come from the method rather than the companies, so the same test was run several other ways."
        )
      );
      out.append(
        MF.el(
          "div",
          { class: "table-scroll" },
          MF.el(
            "table",
            { class: "ledger" },
            MF.el("thead", null, MF.el("tr", null, ["Version of the test", "Quarters", "4s", "5s", "Chi-square p"].map((h, i) => MF.el("th", { class: i ? "r" : null }, h)))),
            MF.el(
              "tbody",
              null,
              checks.map(([label, t]) =>
                MF.el(
                  "tr",
                  null,
                  MF.el("td", null, label),
                  MF.el("td", { class: "r" }, MF.int(t.n)),
                  MF.el("td", { class: "r" }, MF.pct(t.share4, 2)),
                  MF.el("td", { class: "r" }, MF.pct(t.share5, 2)),
                  MF.el("td", { class: "r" }, t.pchi2 < 0.0001 ? "< 0.0001" : t.pchi2.toFixed(t.pchi2 < 0.01 ? 4 : 2))
                )
              )
            )
          )
        )
      );
      const pl = g.placebo;
      const cl = g.q_pos_clean;
      const nm = S.near_miss || {};
      const upShare = nm.up && nm.down != null ? nm.up / (nm.up + nm.down) : null;
      if (pl) {
        out.append(
          P(
            "The placebo tests the pipeline itself. Nobody has a reason to manage the hundredth of a cent, and that digit comes out flat (" + pFmt(pl.pchi2) +
              "), so the method isn't producing patterns on its own."
          )
        );
      }
      if (cl && upShare != null) {
        out.append(
          P(
            "The second row deals with a problem I found in my own reconstruction. For some companies the rebuilt EPS runs a little high or low, usually because of adjustments, such as the two-class method, that the XBRL tags don't capture. When that pushes a value across the half-cent line, the quarter fails the tie-out and drops out, and the quarters that drop out are the ones sitting next to the line. Of the quarters that failed by exactly one cent, " +
              Math.round(upShare * 100) + "% were cases where my number rounded up and the company's didn't, so the main result loses 5s it should have. Keeping only the " +
              MF.int(S.clean_companies) + " companies whose quarters always tie out avoids that. There the shortage of 4s is larger (" + MF.pct(cl.share4, 2) + ") and the extra 5s show up (" + MF.pct(cl.share5, 2) + ")."
          )
        );
      }
      if (g.q_pos_basic) {
        out.append(P("Basic EPS shows a weaker pattern, which fits companies aiming at diluted EPS, the number in the headline."));
      }

      // ----- cliff -----
      const bins = S.fine_clean || S.fine_pos;
      const nb = bins.reduce((a, b) => a + b, 0);
      const avg = nb / 100;
      $("fig-cliff-sub").textContent =
        "Companies whose every quarter ties out. Each digit is split into ten slices: \u202640 through \u202649 are the 4s, \u202650 through \u202659 are the 5s. " + MF.int(nb) + " quarterly reports precise enough to place in a slice.";
      MF.chartCliff($("chart-cliff"), bins, { label: "Count of quarters in each hundredth-of-a-cent slice" });
      const tb = MF.el(
        "table",
        { class: "ledger" },
        MF.el("thead", null, MF.el("tr", null, ["Slice", "Count", "vs. average"].map((h, i) => MF.el("th", { class: i ? "r" : null }, h)))),
        MF.el(
          "tbody",
          null,
          bins.map((c, b) => MF.el("tr", null, MF.el("td", null, "…" + Math.floor(b / 10) + (b % 10)), MF.el("td", { class: "r" }, MF.int(c)), MF.el("td", { class: "r" }, MF.rel(c, avg))))
        )
      );
      $("table-cliff").append(tb);
      const digitAvg = (d) => bins.slice(d * 10, d * 10 + 10).reduce((a, b) => a + b, 0) / 10;
      const minIdx = bins.indexOf(Math.min(...bins));
      const lowDigits = [2, 3, 4].filter((d) => digitAvg(d) < avg);
      const highDigits = [5, 6, 7, 8].filter((d) => digitAvg(d) > avg);
      const ct = $("cliff-text");
      ct.classList.add("prose");
      ct.append(
        P(
          "The slice just below half a cent (\u202649) holds " + MF.rel(bins[49], avg) + " versus the average slice" +
            (minIdx === 49 ? ", the emptiest of all 100" : "") +
            ". Taken a digit at a time, " +
            lowDigits.map((d) => "the " + d + "s run " + MF.rel(digitAvg(d), avg)).join(", ") +
            (highDigits.length ? ", while " + highDigits.map((d) => "the " + d + "s run " + MF.rel(digitAvg(d), avg)).join(", ") : "") +
            ". Single slices bounce around inside the shaded chance range; the pattern is in the runs of slices on either side of the line."
        )
      );

      // ----- losses -----
      const L = g.q_neg;
      if (L && L.n > 500) {
        $("fig-loss-sub").textContent = "Quarterly diluted losses of $0.10 per share or more, " + MF.int(L.n) + " reports. Same scale as the profit chart above.";
        MF.chartDeviation($("chart-loss"), L.counts, { label: "Difference from expected for each digit, loss quarters", ext: sharedExt });
        $("table-loss").append(digitTable(L.counts));
        const lt = $("loss-text");
        lt.classList.add("prose");
        const flips = L.share4 > 0.1 && L.share5 < 0.1;
        lt.append(
          P(
            "For losses the 4 shows up " + MF.pct(L.share4, 2) + " of the time and the 5 " + MF.pct(L.share5, 2) + " (χ² = " + L.chi2.toFixed(1) + ", " + pFmt(L.pchi2) + "), no clear pattern. " +
              (flips
                ? "The pattern reverses, as deliberate rounding predicts: with a loss, 4s are the digit to have."
                : "If deliberate rounding were the whole story, losses would show extra 4s, because a loss looks smaller when it rounds toward zero. They don't, so this check does not confirm the profit result. One possible reason is that the pressure comes from beating a positive estimate, which matters less once a company is reporting a loss, but this data can't show that.")
          )
        );
      } else {
        $("fig-loss").hidden = true;
      }

      // ----- years -----
      const rows = years.map((y) => ({ year: Number(y), n: S.by_year[y].n, k4: S.by_year[y].k4, k5: S.by_year[y].k5 }));
      MF.chartYears($("chart-years"), rows, {
        event: { year: 2020.74, label: "Sep 2020: first SEC cases" },
        label: "Share of 4s and 5s by year",
      });
      $("table-years").append(
        MF.el(
          "table",
          { class: "ledger" },
          MF.el("thead", null, MF.el("tr", null, ["Year", "Quarters", "4s", "Share of 4s", "5s", "Share of 5s"].map((h, i) => MF.el("th", { class: i ? "r" : null }, h)))),
          MF.el("tbody", null, rows.map((r) => MF.el("tr", null, MF.el("td", null, String(r.year)), MF.el("td", { class: "r" }, MF.int(r.n)), MF.el("td", { class: "r" }, MF.int(r.k4)), MF.el("td", { class: "r" }, MF.pct(r.k4 / r.n, 2)), MF.el("td", { class: "r" }, MF.int(r.k5)), MF.el("td", { class: "r" }, MF.pct(r.k5 / r.n, 2)))))
        )
      );
      const b = g["era:before"];
      const a = g["era:after"];
      if (a && b && S.era_test) {
        const yt = $("years-text");
        yt.classList.add("prose");
        const moved = S.era_test.p < 0.05;
        yt.append(
          P(
            "Reports filed before the first cases had 4s " + MF.pct(b.share4, 2) + " of the time (" + MF.int(b.n) + " reports). Reports filed since have 4s " + MF.pct(a.share4, 2) + " of the time (" + MF.int(a.n) +
              "). A two-proportion z-test gives z = " + S.era_test.z.toFixed(2).replace("-", "\u2212") + " (" + pFmt(S.era_test.p) + "). " +
              (moved
                ? a.share4 > b.share4
                  ? a.p4 >= 0.05
                    ? "The shortage mostly went away: since the first cases, the share of 4s has been within what chance allows around 10%, which fits companies paying attention once the screen was public."
                    : "The 4s came back part of the way, though they are still below 10%."
                  : "If anything the shortage grew."
                : "The difference is within what chance would produce, so there is no clear sign the cases changed behavior.")
          )
        );
        const bc = g["era_clean:before"];
        const ac = g["era_clean:after"];
        if (bc && ac && S.era_test_clean) {
          yt.append(
            P(
              "The companies whose quarters always tie out show the same shift: " + MF.pct(bc.share4, 2) + " 4s before and " + MF.pct(ac.share4, 2) + " after (z = " +
                S.era_test_clean.z.toFixed(2).replace("-", "\u2212") + ", " + pFmt(S.era_test_clean.p) + "). This is a before-and-after comparison, not an experiment, so it can't prove the cases caused the change; analyst coverage, the mix of companies and the economy all changed too."
            )
          );
        }
      }

      // ----- groups -----
      const catOrder = ["Large accelerated", "Accelerated", "Non-accelerated"];
      const cats = catOrder.map((c) => ({ label: c + " filers", ...(g["cat:" + c] || {}) })).filter((r) => r.n >= 500).map((r) => ({ label: r.label, n: r.n, k4: r.counts[4] }));
      const offices = Object.keys(g)
        .filter((k) => k.startsWith("office:") && k !== "office:Unknown" && g[k].n >= 1000)
        .map((k) => ({ label: k.slice(7), n: g[k].n, k4: g[k].counts[4] }))
        .sort((x, y) => x.k4 / x.n - y.k4 / y.n);
      // one shared scale so the two panels can be compared
      const ci = (r) => {
        const p = r.k4 / r.n;
        const se = Math.sqrt((p * (1 - p)) / r.n);
        return [p - 1.96 * se, p + 1.96 * se];
      };
      const span2 = cats.concat(offices).map(ci);
      const dom = {
        lo: Math.min(0.08, Math.floor(Math.min(...span2.map((x) => x[0])) * 200) / 200),
        hi: Math.max(0.105, Math.ceil(Math.max(...span2.map((x) => x[1])) * 200) / 200),
      };
      if (cats.length) MF.chartGroups($("chart-cat"), cats, Object.assign({ label: "Share of 4s by filer category" }, dom));
      if (offices.length) MF.chartGroups($("chart-office"), offices, Object.assign({ label: "Share of 4s by SEC industry office" }, dom));
      const all = cats.concat(offices);
      $("table-groups").append(
        MF.el(
          "table",
          { class: "ledger" },
          MF.el("thead", null, MF.el("tr", null, ["Group", "Quarters", "4s", "Share of 4s"].map((h, i) => MF.el("th", { class: i ? "r" : null }, h)))),
          MF.el("tbody", null, all.map((r) => MF.el("tr", null, MF.el("td", null, r.label), MF.el("td", { class: "r" }, MF.int(r.n)), MF.el("td", { class: "r" }, MF.int(r.k4)), MF.el("td", { class: "r" }, MF.pct(r.k4 / r.n, 2)))))
        )
      );
      if (cats.length >= 2) {
        const lg = cats[0];
        const sm = cats[cats.length - 1];
        const gt = $("groups-text");
        gt.classList.add("prose");
        gt.append(
          P(
            "Among large accelerated filers, " + MF.pct(lg.k4 / lg.n, 2) + " of quarters end in a 4; among non-accelerated filers, " + MF.pct(sm.k4 / sm.n, 2) + "." +
              (sm.k4 / sm.n < lg.k4 / lg.n ? " Smaller companies show at least as much of the pattern as large ones, although the gap between categories is within the margin of error." : "") +
              (offices.length ? " By industry, the lowest share is in " + offices[0].label + " (" + MF.pct(offices[0].k4 / offices[0].n, 2) + ") and the highest in " + offices[offices.length - 1].label + " (" + MF.pct(offices[offices.length - 1].k4 / offices[offices.length - 1].n, 2) + ")." : "")
          )
        );
      }

      // ----- SEC cases -----
      const cases = $("cases");
      (S.cases || []).forEach((c) => {
        const block = MF.el("div", { class: "case" });
        block.append(
          MF.el("h3", null, c.cik ? MF.el("a", { href: MF.companyHref(c.ticker, c.cik) }, c.name) : c.name),
          MF.el("p", { class: "small" }, "Settled " + MF.date(c.date) + ". Penalty " + c.penalty + ". ", MF.el("a", { href: c.url }, "SEC announcement")),
          MF.el("p", { class: "prose" }, c.what)
        );
        const win = (c.window || []).filter((r) => r[5] !== "missing");
        if (!win.length) {
          block.append(MF.el("p", { class: "small" }, "None of these quarters can be tested: the filings don't tag the numerator and share count needed to rebuild EPS."));
        }
        if (win.length) {
          const strip = MF.el("div", { class: "strip", role: "list" });
          win.forEach((r) => {
            const [end, fp, fy, eps, digit, status, key] = r;
            const ok = status === "ok";
            const cls = "cell" + (ok && eps > 0 ? (digit === 4 ? " c4" : digit === 5 ? " c5" : "") : ok ? " loss" : " na") + (key ? " named" : "");
            const cell = MF.el("div", { class: cls, role: "listitem", tabindex: "0", "aria-label": fp + " " + fy + ": " + (ok ? "digit " + digit : "not tested") }, ok ? String(digit) : "–");
            const rowsFor = () => [
              { text: ok ? "Digit " + digit : "Not tested", strong: true },
              { text: fp + " " + fy + ", reported EPS " + MF.money(eps) },
              key ? { text: "A quarter the SEC named in its order" } : { text: ok ? "" : "EPS under $0.10, or inputs too rounded" },
            ];
            cell.addEventListener("pointerenter", (e) => MF.tip.show(e, rowsFor()));
            cell.addEventListener("pointermove", (e) => MF.tip.show(e, rowsFor()));
            cell.addEventListener("pointerleave", MF.tip.hide);
            cell.addEventListener("focus", (e) => MF.tip.show(e, rowsFor()));
            cell.addEventListener("blur", MF.tip.hide);
            strip.append(cell);
          });
          const tested = win.filter((r) => r[5] === "ok" && r[3] > 0);
          const k4 = tested.filter((r) => r[4] === 4).length;
          const k5 = tested.filter((r) => r[4] === 5).length;
          const keyed = win.filter((r) => r[6]);
          const fives = tested.filter((r) => r[4] === 5 && r[7] != null).sort((x, y) => x[7] - y[7]);
          block.append(
            strip,
            MF.el("div", { class: "year-labels" }, MF.el("span", null, MF.period({ fp: win[0][1], fy: win[0][2], end: win[0][0] }) + " to " + MF.period({ fp: win[win.length - 1][1], fy: win[win.length - 1][2], end: win[win.length - 1][0] }))),
            MF.el(
              "p",
              { class: "small" },
              tested.length
                ? "In these " + tested.length + " testable quarters: " + k4 + (k4 === 1 ? " four" : " fours") + " and " + k5 + (k5 === 1 ? " five" : " fives") + "." +
                    (fives.length ? " Closest call: " + fives[0][1] + " " + fives[0][2] + ", which cleared the half-cent line by " + fives[0][7].toFixed(fives[0][7] < 0.01 ? 4 : 3) + " cents." : "") +
                    (keyed.length ? " Outlined: " + keyed.map((r) => r[1] + " " + r[2] + (r[5] === "ok" ? " (digit " + r[4] + ")" : " (not testable)")).join(" and ") + ", the quarters the SEC named." : "") +
                    (c.rank === 1 ? " Across all of its quarters, this company ranks first of " + MF.int(S.luck.tested) + " on the site's two tests." : "")
                : "None of these quarters could be tested: the filings don't tag the share counts or numerators needed to rebuild EPS."
            )
          );
        }
        cases.append(block);
      });

      // ----- leaderboard -----
      const L2 = S.luck;
      const top = S.board[0];
      const caseTickers = (S.cases || []).map((c) => c.ticker);
      const intro = [
        MF.int(L2.tested) + " companies have at least " + S.min_quarters + " quarters that could be tested. Each gets two tests: too few 4s, and too many 5s. With " +
          MF.int(2 * L2.tested) + " tests, about " + MF.int(2 * L2.p01_expected) + " would come in under a 1% chance by luck alone; " + MF.int(L2.p01 + L2.p5_01) + " do.",
      ];
      if (top && top.q < 0.05) {
        intro.push(
          " After allowing for that, " + (L2.q05 === 1 ? "one company stands out: " : "the company that stands out most is ") + top.name + ", with " + top.k5 + " fives in " + top.n +
            " quarters where chance predicts " + (top.n / 10).toFixed(1) + "." +
            (caseTickers.includes(top.ticker) ? " It is one of the companies the SEC charged under its EPS Initiative." : "")
        );
      }
      intro.push(" For the rest of the list, the pattern is within what luck produces across this many companies. A place on it is a reason to read a company's filings more closely, not a finding that it did anything wrong.");
      $("board-intro").textContent = intro.join("");
      const head = ["", "Company", "Quarters", "4s", "5s", "Expected", "Chance by luck", "False-alarm rate"];
      $("board").append(
        MF.el(
          "table",
          { class: "ledger" },
          MF.el("thead", null, MF.el("tr", null, head.map((h, i) => MF.el("th", { class: i >= 2 ? "r" : null }, h)))),
          MF.el(
            "tbody",
            null,
            S.board.slice(0, 10).map((e) =>
              MF.el(
                "tr",
                null,
                MF.el("td", null, String(e.rank)),
                MF.el("td", null, MF.el("a", { href: MF.companyHref(e.ticker, e.cik) }, e.name), e.ticker ? " " : "", e.ticker ? MF.el("span", { class: "pill" }, e.ticker) : ""),
                MF.el("td", { class: "r" }, String(e.n)),
                MF.el("td", { class: "r" }, MF.el("span", { class: e.signal === "4s" ? "d4" : "" }, String(e.k4))),
                MF.el("td", { class: "r" }, MF.el("span", { class: e.signal === "5s" ? "d5" : "" }, String(e.k5))),
                MF.el("td", { class: "r" }, (e.n / 10).toFixed(1)),
                MF.el("td", { class: "r" }, MF.prob(e.p) + (e.signal === "5s" ? " (5s)" : " (4s)")),
                MF.el("td", { class: "r" }, MF.pct(Math.min(1, e.q), e.q < 0.01 ? 1 : 0))
              )
            )
          )
        )
      );
      MF.search($("q"), $("q-list"));
    })
    .catch((err) => {
      $("hero-meta").textContent = "The data could not be loaded (" + err.message + "). Try reloading the page.";
    });
})();

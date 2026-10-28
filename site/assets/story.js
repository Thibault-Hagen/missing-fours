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
        "Companies report earnings per share rounded to the cent. I rebuilt the unrounded number from SEC filings for every public company, to look at the one digit that rounding throws away. It should be a 4 one time in ten. " +
        (short4 ? "It isn't." : "Here is how often it actually is.");
      $("hero-meta").textContent =
        "Rebuilt from " + MF.int(q.n) + " quarterly reports by " + MF.int(S.headline.companies) + " companies, " + span + ". Last rebuilt " + MF.date(S.built.slice(0, 10)) + ".";
      $("built").textContent = "Last rebuilt " + MF.date(S.built.slice(0, 10)) + ".";
      renderTape(S);

      // ----- digit chart -----
      $("fig-digits-sub").textContent = "Quarterly diluted EPS of $0.10 or more, " + MF.int(q.n) + " reports, " + span + ". Bars show how far each digit is above or below 10%.";
      MF.chartDeviation($("chart-digits"), q.counts, { label: "Difference from expected for each digit 0 through 9" });
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
            (rarest === 4 && biggestGap === 4 ? " No digit is rarer, and no digit is further from 10%." : rarest === 4 ? " No digit is rarer." : "")
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
      const basic = g.q_pos_basic;
      const strict = g.q_pos_strict;
      if (basic && basic.n > 1000 && strict && strict.n > 1000) {
        out.append(
          P(
            "The result does not depend on one choice of EPS. Using basic EPS instead, the share of 4s is " +
              MF.pct(basic.share4, 2) + " across " + MF.int(basic.n) + " reports. Keeping only quarters where the company tagged its exact EPS numerator, it is " +
              MF.pct(strict.share4, 2) + " across " + MF.int(strict.n) + "."
          )
        );
      }

      // ----- cliff -----
      const bins = S.fine_pos;
      const nb = bins.reduce((a, b) => a + b, 0);
      const avg = nb / 100;
      $("fig-cliff-sub").textContent =
        "Each digit split into ten slices: …40 through …49 are the 4s, …50 through …59 are the 5s. " + MF.int(nb) + " quarterly reports precise enough to place in a slice.";
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
      const just4 = bins.slice(45, 50).reduce((a, b) => a + b, 0) / 5;
      const just5 = bins.slice(50, 55).reduce((a, b) => a + b, 0) / 5;
      const ct = $("cliff-text");
      ct.classList.add("prose");
      ct.append(
        P(
          "The slice just below half a cent (…49) holds " + MF.rel(bins[49], avg) + " versus the average slice, and the slice just above it (…50) holds " +
            MF.rel(bins[50], avg) + ". Across the top half of the 4s (…45 to …49) the average slice is " +
            MF.rel(just4, avg) + "; across the bottom half of the 5s (…50 to …54) it is " + MF.rel(just5, avg) + "."
        )
      );

      // ----- losses -----
      const L = g.q_neg;
      if (L && L.n > 500) {
        $("fig-loss-sub").textContent = "Quarterly diluted losses of $0.10 per share or more, " + MF.int(L.n) + " reports.";
        MF.chartDeviation($("chart-loss"), L.counts, { label: "Difference from expected for each digit, loss quarters" });
        $("table-loss").append(digitTable(L.counts));
        const lt = $("loss-text");
        lt.classList.add("prose");
        const flips = L.share4 > 0.1 && L.share5 < 0.1;
        lt.append(
          P(
            "For losses the 4 shows up " + MF.pct(L.share4, 2) + " of the time and the 5 " + MF.pct(L.share5, 2) + " (χ² = " + L.chi2.toFixed(1) + ", " + pFmt(L.pchi2) + "). " +
              (flips
                ? "The pattern reverses, as deliberate rounding predicts: with a loss, 4s are the digit to have."
                : "The pattern does not simply reverse, which is a reason to be careful about reading intent into the profit result.")
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
                  ? "The 4s came back part of the way, which fits companies paying attention once the screen was public."
                  : "If anything the shortage grew."
                : "The difference is within what chance would produce, so there is no clear sign the cases changed behavior.") +
              (a.share4 < 0.1 && a.p4 < 0.01 ? " The 4s are still below 10% today." : "")
          )
        );
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
        if (win.length) {
          const strip = MF.el("div", { class: "strip", role: "list" });
          win.forEach((r) => {
            const [end, fp, fy, eps, digit, status, key] = r;
            const ok = status === "ok";
            const cls = "cell" + (ok && eps > 0 ? (digit === 4 ? " c4" : digit === 5 ? " c5" : "") : ok ? " loss" : " na") + (key ? " key" : "");
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
          block.append(
            strip,
            MF.el("div", { class: "year-labels" }, MF.el("span", null, MF.period({ fp: win[0][1], fy: win[0][2], end: win[0][0] }) + " to " + MF.period({ fp: win[win.length - 1][1], fy: win[win.length - 1][2], end: win[win.length - 1][0] }))),
            MF.el(
              "p",
              { class: "small" },
              tested.length
                ? "In these " + tested.length + " testable quarters: " + k4 + (k4 === 1 ? " four" : " fours") + " and " + k5 + (k5 === 1 ? " five" : " fives") + "." +
                    (keyed.length ? " Outlined: " + keyed.map((r) => r[1] + " " + r[2] + (r[5] === "ok" ? " (digit " + r[4] + ")" : "")).join(" and ") + ", the quarters the SEC named." : "")
                : "None of these quarters could be tested."
            )
          );
        }
        cases.append(block);
      });

      // ----- leaderboard -----
      const L2 = S.luck;
      $("board-intro").textContent =
        MF.int(L2.tested) + " companies have at least " + S.min_quarters + " quarters that could be tested. Below are the ones whose count of 4s would be least likely by chance. With that many companies, about " +
        MF.int(L2.p01_expected) + " would fall under a 1% chance by luck alone; " + MF.int(L2.p01) + " actually do. Being on this list is a reason to look more closely at a company's filings. It does not show that the company did anything wrong.";
      const head = ["", "Company", "Quarters", "4s found", "4s expected", "Chance by luck", "False-alarm rate"];
      $("board").append(
        MF.el(
          "table",
          { class: "ledger" },
          MF.el("thead", null, MF.el("tr", null, head.map((h, i) => MF.el("th", { class: i >= 2 ? "r" : null }, h)))),
          MF.el(
            "tbody",
            null,
            S.board.map((e) =>
              MF.el(
                "tr",
                null,
                MF.el("td", null, String(e.rank)),
                MF.el("td", null, MF.el("a", { href: MF.companyHref(e.ticker, e.cik) }, e.name), e.ticker ? " " : "", e.ticker ? MF.el("span", { class: "pill" }, e.ticker) : ""),
                MF.el("td", { class: "r" }, String(e.n)),
                MF.el("td", { class: "r" }, String(e.k4)),
                MF.el("td", { class: "r" }, (e.n / 10).toFixed(1)),
                MF.el("td", { class: "r" }, MF.prob(e.p)),
                MF.el("td", { class: "r" }, MF.pct(Math.min(1, e.q), 0))
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

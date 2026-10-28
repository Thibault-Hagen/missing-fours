/* One company's page: verdict, digit chart, quarter strip and the full working for every period. */
(function () {
  "use strict";
  const MF = window.MF;
  const $ = (id) => document.getElementById(id);

  const WHY = {
    small: "EPS under $0.10, not tested",
    imprecise: "Inputs too rounded to pin down the digit",
    mismatch: "Inputs don't divide to the reported EPS",
    missing: "No numerator or share count tagged",
    decimals: "EPS reported to more than two decimals",
  };

  function shown(lo, hi) {
    // Digits of the unrounded EPS that every allowed value agrees on.
    const a = Math.min(Math.abs(lo), Math.abs(hi));
    const b = Math.max(Math.abs(lo), Math.abs(hi));
    const sa = (Math.floor(a * 1e6) / 1e6).toFixed(6);
    const sb = (Math.floor(b * 1e6) / 1e6).toFixed(6);
    let i = 0;
    while (i < sa.length && sa[i] === sb[i]) i++;
    return { text: sa.slice(0, i), more: i < sa.length };
  }

  function epsCell(r, idx) {
    const lo = r[idx.lo];
    const hi = r[idx.hi];
    if (lo == null || hi == null) return MF.el("td", { class: "r" }, "");
    const sh = shown(lo, hi);
    const neg = r[idx.eps] < 0;
    const dot = sh.text.indexOf(".");
    const kept = sh.text.slice(0, dot + 3);
    const rest = sh.text.slice(dot + 3);
    const digit = r[idx.digit];
    const cls = digit === 4 ? "h4" : digit === 5 ? "h5" : "";
    const gone = MF.el("span", { class: "gone" });
    if (rest.length) {
      gone.append(MF.el("span", { class: r[idx.status] === "ok" && r[idx.eps] > 0 ? cls : "" }, rest[0]), rest.slice(1) + (sh.more ? "…" : ""));
    } else if (sh.more) gone.append("…");
    return MF.el("td", { class: "r" }, MF.el("span", { class: "eps-split" }, neg ? "(" : "", MF.el("span", { class: "kept" }, kept), gone, neg ? ")" : ""));
  }

  function fours(k, n) {
    if (k === 0) return "the tenth-of-a-cent digit was never a 4";
    if (k === 1) return "the tenth-of-a-cent digit was a 4 just once";
    return "the tenth-of-a-cent digit was a 4 in " + k + " of them";
  }

  function render(C) {
    const idx = {};
    C.cols.forEach((c, i) => (idx[c] = i));
    document.title = C.name + " | The Missing Fours";
    $("co-name").textContent = C.name;
    const facts = $("co-facts");
    facts.append(
      ...[
        C.ticker ? MF.el("span", null, MF.el("span", { class: "pill" }, C.ticker), C.exch ? " " + C.exch : "") : null,
        C.office && C.office !== "Unknown" ? MF.el("span", null, C.office + " (SEC industry office)") : null,
        C.cat && C.cat !== "Other or unknown" ? MF.el("span", null, C.cat + " filer") : null,
        C.sicd ? MF.el("span", null, C.sicd) : null,
        MF.el("span", null, MF.el("a", { href: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + String(C.cik).padStart(10, "0") + "&type=10-Q" }, "SEC filings")),
      ].filter(Boolean)
    );

    if (C.case) {
      const c = C.case;
      $("verdict").before(
        MF.el(
          "p",
          { class: "note-sec" },
          "The SEC charged this company under its EPS Initiative (settled " + MF.date(c.date) + ", penalty " + c.penalty + "). " + c.what + " ",
          MF.el("a", { href: c.url }, "SEC announcement")
        )
      );
    }
    const n = C.n;
    const exp = n / 10;
    const v = $("verdict");
    if (n === 0) {
      v.textContent = "None of this company's quarters could be tested: profitable quarters under $0.10 a share, losses, or inputs too rounded to pin down the digit. Its periods are listed below with the reason for each.";
    } else if (C.p == null) {
      v.textContent =
        "Across " + n + " tested " + (n === 1 ? "quarter" : "quarters") + ", " + fours(C.k4, n) + ", where chance predicts about " + exp.toFixed(1) +
        ". That is too few quarters to say anything with confidence; a probability is given once a company has " + C.min_quarters_needed + ".";
    } else {
      const parts = [
        "Across " + n + " tested quarters, " + fours(C.k4, n) + ", and a 5 in " + C.k5 + ". Chance predicts about " + exp.toFixed(1) + " of each. ",
        "If the digit were random, the chance of " + C.k4 + " or fewer 4s would be " + MF.prob(C.p4) + ", and the chance of " + C.k5 + " or more 5s would be " + MF.prob(C.p5) + ". ",
      ];
      if (C.q < 0.05) {
        parts.push(
          "Even after allowing for " + MF.int(2 * C.tested) + " tests across " + MF.int(C.tested) + " companies, the false-alarm rate is " + MF.pct(C.q, C.q < 0.01 ? 1 : 0) +
            ". This is one of the most unusual patterns in the data."
        );
      } else if (C.p < 0.01) {
        parts.push(
          "That is unusual for one company, but with " + MF.int(2 * C.tested) + " tests across " + MF.int(C.tested) + " companies, results this extreme turn up by luck alone. The false-alarm rate is " +
            MF.pct(Math.min(1, C.q), 0) + "."
        );
      } else {
        parts.push("Both are within the range chance produces.");
      }
      v.textContent = parts.join("");
    }
    if (C.nmis > 0) {
      v.after(
        MF.el(
          "p",
          { class: "small prose" },
          C.nmis + (C.nmis === 1 ? " quarter" : " quarters") +
            " of this company's EPS didn't tie out to the numbers in its filings, which usually means its EPS calculation includes adjustments the XBRL tags don't capture. Its rebuilt digits are less reliable than those of companies whose quarters always tie out."
        )
      );
    }

    const fr = $("facts");
    const fact = (val, key, cls) => MF.el("div", { class: "fact" }, MF.el("div", { class: "v" + (cls ? " " + cls : "") }, val), MF.el("div", { class: "k" }, key));
    fr.append(
      fact(String(n), "Quarters tested"),
      fact(String(C.k4), "Fours found, " + exp.toFixed(1) + " expected", "d4"),
      fact(String(C.k5), "Fives found, " + exp.toFixed(1) + " expected", "d5"),
      fact(
        C.q == null ? "\u2014" : MF.pct(Math.min(1, C.q), C.q < 0.01 ? 1 : 0),
        C.q == null ? "Needs " + C.min_quarters_needed + " quarters for a probability" : "False-alarm rate, after testing every company"
      )
    );

    if (n > 0) {
      MF.chartSmallDigits($("chart-co"), C.counts, { label: "Count of quarters by tenth-of-a-cent digit" });
    } else {
      $("digits-sec").hidden = true;
    }

    // quarter strip
    const qs = C.rows.filter((r) => r[idx.kind] === "Q");
    const strip = $("strip");
    qs.forEach((r) => {
      const ok = r[idx.status] === "ok";
      const pos = r[idx.eps] > 0;
      const d = r[idx.digit];
      const cls = "cell" + (ok ? (pos ? (d === 4 ? " c4" : d === 5 ? " c5" : "") : " loss") : " na");
      const label = MF.period({ fp: r[idx.fp], fy: r[idx.fy], end: r[idx.end] });
      const cell = MF.el("div", { class: cls, role: "listitem", tabindex: "0", "aria-label": label + ": " + (ok ? "digit " + d : "not tested") }, ok ? String(d) : "–");
      const rows = () => [
        { text: ok ? "Digit " + d + (pos ? "" : " (loss)") : "Not tested", strong: true },
        { text: label + ", reported EPS " + MF.money(r[idx.eps]) },
        { text: ok ? "Filed " + MF.date(r[idx.filed]) : WHY[r[idx.status]] || "" },
      ];
      cell.addEventListener("pointerenter", (e) => MF.tip.show(e, rows()));
      cell.addEventListener("pointermove", (e) => MF.tip.show(e, rows()));
      cell.addEventListener("pointerleave", MF.tip.hide);
      cell.addEventListener("focus", (e) => MF.tip.show(e, rows()));
      cell.addEventListener("blur", MF.tip.hide);
      strip.append(cell);
    });
    if (qs.length) {
      $("strip-years").append(MF.el("span", null, qs[0][idx.end].slice(0, 4)), MF.el("span", null, qs[qs.length - 1][idx.end].slice(0, 4)));
    }

    // table
    const table = $("rows");
    const draw = (kind) => {
      const list = C.rows.filter((r) => r[idx.kind] === kind).slice().reverse();
      const head = MF.el(
        "thead",
        null,
        MF.el("tr", null, ["Period", "Filed", "Reported EPS", "Numerator ($)", "Diluted shares", "Unrounded EPS", "Digit", "Filing"].map((h, i) => MF.el("th", { class: i >= 2 && i <= 6 ? "r" : null }, h)))
      );
      const body = MF.el(
        "tbody",
        null,
        list.map((r) => {
          const ok = r[idx.status] === "ok";
          const d = r[idx.digit];
          return MF.el(
            "tr",
            null,
            MF.el("td", null, MF.period({ fp: r[idx.fp], fy: r[idx.fy], end: r[idx.end] })),
            MF.el("td", null, MF.date(r[idx.filed])),
            MF.el("td", { class: "r" }, MF.money(r[idx.eps])),
            MF.el("td", { class: "r" }, r[idx.num] == null ? "" : MF.money(r[idx.num], 0)),
            MF.el("td", { class: "r" }, r[idx.den] == null ? "" : MF.int(r[idx.den])),
            epsCell(r, idx),
            MF.el("td", { class: "r" }, ok ? MF.el("span", { class: r[idx.eps] > 0 && d === 4 ? "d4" : r[idx.eps] > 0 && d === 5 ? "d5" : "" }, String(d)) : MF.el("span", { class: "why" }, WHY[r[idx.status]] || "")),
            MF.el("td", null, MF.el("a", { href: MF.edgar(C.cik, r[idx.accn]) }, r[idx.form]))
          );
        })
      );
      table.replaceChildren(head, body);
    };
    const bq = $("show-q");
    const ba = $("show-a");
    bq.addEventListener("click", () => {
      bq.setAttribute("aria-pressed", "true");
      ba.setAttribute("aria-pressed", "false");
      draw("Q");
    });
    ba.addEventListener("click", () => {
      ba.setAttribute("aria-pressed", "true");
      bq.setAttribute("aria-pressed", "false");
      draw("A");
    });
    draw("Q");
    $("co-foot").textContent =
      "Full-year rows are shown for reference; the test above uses quarters only. A digit is colored only for profitable quarters, where rounding up helps; for a loss, rounding toward zero helps instead.";
  }

  const params = new URLSearchParams(location.search);
  const t = (params.get("t") || "").toUpperCase();
  const cikParam = params.get("cik");
  const fail = (msg) => {
    $("co-name").textContent = "Company not found";
    $("verdict").textContent = msg;
  };
  const go = (cik) =>
    MF.load("data/co/" + Number(cik) + ".json")
      .then((C) => {
        C.min_quarters_needed = 20;
        render(C);
      })
      .catch(() => fail("There is no EPS data here for that company. It may file without XBRL EPS figures, or report in a currency other than US dollars."));
  if (cikParam) go(cikParam);
  else if (t)
    MF.load("data/index.json")
      .then((d) => {
        const row = d.rows.find((r) => (r[0] || "").toUpperCase() === t);
        if (row) go(row[1]);
        else fail("No company with the ticker " + t + " has EPS data here. Try searching from the Companies page.");
      })
      .catch(() => fail("The company list could not be loaded. Try reloading the page."));
  else fail("Pick a company from the Companies page.");
})();

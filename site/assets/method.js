/* Method page: fills the data funnel from the latest rebuild. */
(function () {
  "use strict";
  const MF = window.MF;
  MF.load("data/summary.json").then((S) => {
    const q = S.funnel.Q || {};
    const a = S.funnel.A || {};
    const lines = [
      ["No numerator or share count tagged", "missing"],
      ["Inputs don't tie out to the reported EPS", "mismatch"],
      ["EPS reported to more than two decimals", "decimals"],
      ["Ties out, but EPS is under $0.10", "small"],
      ["Ties out, but inputs too rounded to pin down the digit", "imprecise"],
      ["Tested", "ok"],
    ];
    const t = document.getElementById("funnel");
    t.append(
      MF.el("thead", null, MF.el("tr", null, MF.el("th", null, "Periods with reported diluted EPS"), MF.el("th", { class: "r" }, "Quarters"), MF.el("th", { class: "r" }, "Full years"))),
      MF.el(
        "tbody",
        null,
        lines.map(([label, k]) => MF.el("tr", null, MF.el("td", null, label), MF.el("td", { class: "r" }, MF.int(q[k] || 0)), MF.el("td", { class: "r" }, MF.int(a[k] || 0)))),
        MF.el("tr", { class: "total" }, MF.el("td", null, "All periods"), MF.el("td", { class: "r" }, MF.int(q.reported || 0)), MF.el("td", { class: "r" }, MF.int(a.reported || 0)))
      )
    );
    const L = S.luck;
    document.getElementById("luck-line").textContent =
      "false-alarm rate (at the latest rebuild, " + MF.int(L.tested) + " companies were tested twice each; about " + MF.int(2 * L.p01_expected) + " tests would fall under 1% by luck alone, and " + MF.int(L.p01 + L.p5_01) + " did)";
    const pl = S.groups.placebo;
    if (pl) document.getElementById("placebo-line").textContent = "chi-square p = " + pl.pchi2.toFixed(2) + " across " + MF.int(pl.n) + " quarters";
    const nm = S.near_miss;
    if (nm && nm.up + nm.down > 0)
      document.getElementById("near-line").textContent =
        "In this data, " + Math.round((nm.up / (nm.up + nm.down)) * 100) + "% of the quarters that failed by exactly one cent ran high (" + MF.int(nm.up) + " of " + MF.int(nm.up + nm.down) + ")";
    document.getElementById("built").textContent = "Last rebuilt " + MF.date(S.built.slice(0, 10)) + ".";
  });
})();

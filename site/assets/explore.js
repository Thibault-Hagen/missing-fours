/* The companies table: filter, sort, page through. */
(function () {
  "use strict";
  const MF = window.MF;
  const $ = (id) => document.getElementById(id);
  const PAGE = 100;

  MF.load("data/companies.json")
    .then((D) => {
      const idx = {};
      D.cols.forEach((c, i) => (idx[c] = i));
      const rows = D.rows.map((r) => {
        const o = {};
        D.cols.forEach((c, i) => (o[c] = r[i]));
        o.search = ((o.ticker || "") + " " + o.name).toLowerCase();
        return o;
      });
      const offices = [...new Set(rows.map((r) => r.office).filter((o) => o && o !== "Unknown"))].sort();
      const cats = ["Large accelerated", "Accelerated", "Non-accelerated", "Other or unknown"].filter((c) => rows.some((r) => r.cat === c));
      offices.forEach((o) => $("f-office").append(MF.el("option", { value: o }, o)));
      cats.forEach((c) => $("f-cat").append(MF.el("option", { value: c }, c)));

      const params = new URLSearchParams(location.search);
      if (params.get("q")) $("f-q").value = params.get("q");

      let sortKey = "rank";
      let dir = 1;
      let shown = PAGE;

      const filtered = () => {
        const q = $("f-q").value.trim().toLowerCase();
        const office = $("f-office").value;
        const cat = $("f-cat").value;
        const min = Number($("f-min").value);
        const listed = $("f-listed").checked;
        return rows.filter(
          (r) => r.n >= min && (!q || r.search.includes(q)) && (!office || r.office === office) && (!cat || r.cat === cat) && (!listed || r.ticker)
        );
      };

      const cmp = (a, b) => {
        let x = a[sortKey];
        let y = b[sortKey];
        if (sortKey === "name" || sortKey === "office" || sortKey === "ticker") {
          x = (x || "").toLowerCase();
          y = (y || "").toLowerCase();
          return x < y ? -dir : x > y ? dir : 0;
        }
        // missing values (no probability yet) always sink to the bottom
        if (x == null && y == null) return a.name < b.name ? -1 : 1;
        if (x == null) return 1;
        if (y == null) return -1;
        return (x - y) * dir || (a.name < b.name ? -1 : 1);
      };

      const draw = () => {
        const list = filtered().sort(cmp);
        const body = $("list").querySelector("tbody");
        body.replaceChildren(
          ...list.slice(0, shown).map((r) =>
            MF.el(
              "tr",
              null,
              MF.el("td", null, r.rank == null ? "" : String(r.rank)),
              MF.el("td", null, MF.el("a", { href: MF.companyHref(r.ticker, r.cik) }, r.name)),
              MF.el("td", null, r.ticker || ""),
              MF.el("td", { class: "r" }, String(r.n)),
              MF.el("td", { class: "r" }, MF.el("span", { class: r.k4 < r.n / 10 ? "d4" : "" }, String(r.k4))),
              MF.el("td", { class: "r" }, (r.n / 10).toFixed(1)),
              MF.el("td", { class: "r" }, String(r.k5)),
              MF.el("td", { class: "r" }, r.p == null ? "—" : MF.prob(r.p)),
              MF.el("td", { class: "r" }, r.q == null ? "—" : MF.pct(Math.min(1, r.q), 0)),
              MF.el("td", null, r.office && r.office !== "Unknown" ? r.office : "")
            )
          )
        );
        $("count").textContent = "Showing " + MF.int(Math.min(shown, list.length)) + " of " + MF.int(list.length) + " companies" + (list.length !== rows.length ? " (" + MF.int(rows.length) + " in total)" : "") + ".";
        $("more").hidden = shown >= list.length;
      };

      document.querySelectorAll("#list th[data-k] button").forEach((btn) => {
        btn.addEventListener("click", () => {
          const th = btn.parentElement;
          const k = th.dataset.k;
          if (k === sortKey) dir = -dir;
          else {
            sortKey = k;
            dir = k === "n" || k === "k5" ? -1 : 1;
          }
          document.querySelectorAll("#list th").forEach((h) => h.removeAttribute("aria-sort"));
          th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
          shown = PAGE;
          draw();
        });
      });
      ["f-q", "f-office", "f-cat", "f-min", "f-listed"].forEach((id) =>
        $(id).addEventListener(id === "f-q" ? "input" : "change", () => {
          shown = PAGE;
          draw();
        })
      );
      $("more").addEventListener("click", () => {
        shown += PAGE;
        draw();
      });
      $("intro").textContent =
        MF.int(rows.length) + " companies have at least one quarter tested. " + MF.int(D.tested) + " have the 20 or more quarters needed for a probability, and are ranked by how unlikely their count of 4s would be if the digit were random.";
      draw();
    })
    .catch((err) => {
      $("count").textContent = "The company list could not be loaded (" + err.message + ").";
    });
})();

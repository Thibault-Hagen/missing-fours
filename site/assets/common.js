/* Shared helpers: formatting, data loading, DOM building, tooltip, company search. */
(function () {
  "use strict";

  const MF = (window.MF = window.MF || {});

  MF.int = (n) => (n == null ? "" : Math.round(n).toLocaleString("en-US"));

  MF.pct = (x, d = 1) => (x == null ? "" : (x * 100).toFixed(d) + "%");

  // Percent change relative to an expected value, signed.
  MF.rel = (obs, exp, d = 1) => {
    const v = ((obs - exp) / exp) * 100;
    const s = v.toFixed(d);
    return (v > 0 ? "+" : v < 0 ? "−" : "") + s.replace("-", "") + "%";
  };

  // Accounting style: negatives in parentheses.
  MF.money = (x, d = 2) => {
    if (x == null) return "";
    const s = Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
    return x < 0 ? "(" + s + ")" : s;
  };

  MF.big = (x) => {
    if (x == null) return "";
    const a = Math.abs(x);
    let s;
    if (a >= 1e9) s = (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + "B";
    else if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
    else if (a >= 1e3) s = (a / 1e3).toFixed(1) + "K";
    else s = String(a);
    return x < 0 ? "(" + s + ")" : s;
  };

  // A probability in plain words, e.g. "0.4%" or "less than 0.01%".
  MF.prob = (p) => {
    if (p == null) return "not enough quarters";
    if (p < 0.0001) return "less than 0.01%";
    if (p < 0.01) return (p * 100).toFixed(2) + "%";
    if (p < 0.1) return (p * 100).toFixed(1) + "%";
    return Math.round(p * 100) + "%";
  };

  // "1 in 250" style odds for small probabilities.
  MF.odds = (p) => {
    if (p == null || p <= 0) return "";
    const n = 1 / p;
    if (n < 2) return "";
    const r = n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
    return "about 1 in " + r.toLocaleString("en-US");
  };

  MF.date = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  };

  // The rebuild time is stored in UTC ("2026-10-31T11:41Z"); show it as the viewer's local date.
  MF.builtDate = (stamp) => {
    const t = new Date(stamp);
    if (isNaN(t)) return MF.date(String(stamp).slice(0, 10));
    return t.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  MF.period = (row) => {
    // row: {fp, fy, end}
    const fp = row.fp || "";
    if (fp && row.fy) return fp + " " + row.fy;
    return MF.date(row.end);
  };

  MF.edgar = (cik, accn) =>
    "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/" + accn.replace(/-/g, "") + "/" + accn + "-index.htm";

  MF.companyHref = (ticker, cik) => (ticker ? "company.html?t=" + encodeURIComponent(ticker) : "company.html?cik=" + cik);

  const cache = {};
  MF.load = (path) => {
    if (!cache[path]) {
      cache[path] = fetch(path, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(path + " returned " + r.status);
        return r.json();
      });
    }
    return cache[path];
  };

  // el("p", {class: "x"}, "text", child, ...) - text is always set as text, never HTML.
  MF.el = (tag, attrs, ...kids) => {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === "class") node.className = v;
        else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  };

  // Fill <span data-k="path.to.value" data-f="int|pct|..."> placeholders from an object.
  MF.fill = (root, data) => {
    root.querySelectorAll("[data-k]").forEach((node) => {
      const v = node.dataset.k.split(".").reduce((o, k) => (o == null ? o : o[k]), data);
      const f = node.dataset.f || "raw";
      const d = node.dataset.d == null ? undefined : Number(node.dataset.d);
      let out;
      if (v == null) out = "—";
      else if (f === "int") out = MF.int(v);
      else if (f === "pct") out = MF.pct(v, d == null ? 1 : d);
      else if (f === "prob") out = MF.prob(v);
      else if (f === "date") out = MF.date(v);
      else if (f === "fixed") out = Number(v).toFixed(d == null ? 1 : d);
      else out = String(v);
      node.textContent = out;
    });
  };

  // ---- tooltip (one per page) ----
  let tip;
  MF.tip = {
    show(evt, rows) {
      if (!tip) {
        tip = MF.el("div", { class: "tooltip", role: "status", "aria-live": "polite" });
        document.body.append(tip);
      }
      tip.replaceChildren(
        ...rows.map((r) => MF.el("div", { class: r.strong ? "tv" : "tl" }, r.text))
      );
      let x, y;
      if (evt && evt.clientX != null && evt.type !== "focus") {
        x = evt.clientX;
        y = evt.clientY;
      } else {
        const b = (evt.currentTarget || evt.target).getBoundingClientRect();
        x = b.left + b.width / 2;
        y = b.top;
      }
      tip.classList.add("on");
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      let left = x + 14;
      if (left + w > window.innerWidth - 8) left = x - w - 14;
      let top = y - h - 12;
      if (top < 8) top = y + 18;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = top + "px";
    },
    hide() {
      if (tip) tip.classList.remove("on");
    },
  };

  // ---- company search box with suggestions ----
  MF.search = (input, list) => {
    let index = null;
    let active = -1;
    const ensure = () => (index ? Promise.resolve(index) : MF.load("data/index.json").then((d) => (index = d.rows)));
    const close = () => {
      list.hidden = true;
      list.replaceChildren();
      input.setAttribute("aria-expanded", "false");
      active = -1;
    };
    const go = (row) => {
      window.location.href = MF.companyHref(row[0], row[1]);
    };
    const render = (q) => {
      q = q.trim().toLowerCase();
      if (!q) return close();
      const exact = [];
      const starts = [];
      const has = [];
      for (const row of index) {
        const t = (row[0] || "").toLowerCase();
        const n = row[2].toLowerCase();
        if (t === q) exact.push(row);
        else if (t.startsWith(q) || n.startsWith(q)) starts.push(row);
        else if (n.includes(q)) has.push(row);
        if (exact.length + starts.length > 12) break;
      }
      const hits = exact.concat(starts, has).slice(0, 8);
      if (!hits.length) {
        list.replaceChildren(MF.el("li", null, MF.el("a", { "aria-disabled": "true" }, "No company with that name or ticker has EPS data here.")));
        list.hidden = false;
        return;
      }
      list.replaceChildren(
        ...hits.map((row, i) =>
          MF.el(
            "li",
            { role: "option", id: "opt-" + i },
            MF.el("a", { href: MF.companyHref(row[0], row[1]), tabindex: "-1" }, MF.el("span", null, row[2]), MF.el("span", { class: "tk" }, row[0] || "CIK " + row[1]))
          )
        )
      );
      list._hits = hits;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
    };
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);
    input.addEventListener("focus", ensure, { once: true });
    input.addEventListener("input", () => ensure().then(() => render(input.value)));
    input.addEventListener("keydown", (e) => {
      const items = list.querySelectorAll("li a[href]");
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!items.length) return;
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((a, i) => a.setAttribute("aria-selected", i === active ? "true" : "false"));
        input.setAttribute("aria-activedescendant", "opt-" + active);
      } else if (e.key === "Enter") {
        e.preventDefault();
        ensure().then(() => {
          render(input.value);
          const hits = list._hits || [];
          if (hits.length) go(hits[Math.max(0, active)]);
        });
      } else if (e.key === "Escape") {
        close();
      }
    });
    document.addEventListener("click", (e) => {
      if (!list.contains(e.target) && e.target !== input) close();
    });
  };

  // Mark the current page in the nav.
  document.addEventListener("DOMContentLoaded", () => {
    const here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav a").forEach((a) => {
      const target = a.getAttribute("href");
      if (target === here || (here === "company.html" && target === "companies.html")) a.setAttribute("aria-current", "page");
    });
  });
})();

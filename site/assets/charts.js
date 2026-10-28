/* Hand-built SVG charts. No libraries: every mark is placed here. */
(function () {
  "use strict";

  const MF = (window.MF = window.MF || {});
  const NS = "http://www.w3.org/2000/svg";

  function s(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
    if (parent) parent.append(n);
    return n;
  }

  function text(parent, x, y, str, attrs) {
    const t = s("text", Object.assign({ x, y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }

  // Nice round tick values between lo and hi.
  function ticks(lo, hi, count) {
    const span = hi - lo;
    const raw = span / Math.max(1, count);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => span / st <= count) || 10 * mag;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  // A bar from its baseline to its data end, rounded only at the data end.
  function barPath(x, y0, y1, w) {
    const h = Math.abs(y1 - y0);
    const r = Math.min(4, w / 2, h);
    if (h < 0.5) return `M${x},${y0}h${w}`;
    if (y1 < y0) {
      return `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`;
    }
    return `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }

  function digitClass(d) {
    return d === 4 ? "mark-4" : d === 5 ? "mark-5" : "mark-other";
  }

  // Re-render a chart whenever its container changes width.
  function responsive(el, draw) {
    let last = 0;
    const run = () => {
      const w = Math.round(el.clientWidth);
      if (w && w !== last) {
        last = w;
        el.replaceChildren();
        draw(w);
      }
    };
    run();
    if ("ResizeObserver" in window) new ResizeObserver(run).observe(el);
    else window.addEventListener("resize", run);
  }

  function hover(node, rows) {
    node.setAttribute("tabindex", "0");
    node.classList.add("focusable");
    const show = (e) => MF.tip.show(e, rows());
    node.addEventListener("pointermove", show);
    node.addEventListener("pointerenter", show);
    node.addEventListener("pointerleave", MF.tip.hide);
    node.addEventListener("focus", show);
    node.addEventListener("blur", MF.tip.hide);
  }

  // ---------------------------------------------------------------
  // How far each tenth-of-a-cent digit lands from its expected 10%.
  MF.chartDeviation = function (el, counts, opts = {}) {
    const n = counts.reduce((a, b) => a + b, 0);
    const exp = n / 10;
    const rel = counts.map((c) => (c - exp) / exp);
    const ext = Math.max(0.04, ...rel.map(Math.abs));
    // leave room past the longest bar for its value label
    const want = ext * 1.32;
    const tk0 = ticks(0, want, 3);
    const lim = tk0[tk0.length - 1] >= want ? tk0[tk0.length - 1] : tk0[tk0.length - 1] + (tk0[1] - tk0[0]);
    responsive(el, (W) => {
      const H = opts.height || (W < 480 ? 250 : 300);
      const m = { t: 22, r: 6, b: 40, l: 46 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "" }, el);
      const y = (v) => m.t + ih / 2 - (v / lim) * (ih / 2);
      const band = iw / 10;
      const bw = Math.min(28, band * 0.56);
      const g = s("g", { class: "grid" }, svg);
      const tk = ticks(-lim, lim, 4);
      const tg = s("g", { class: "tick" }, svg);
      tk.forEach((v) => {
        if (Math.abs(v) > 1e-9) s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        text(tg, m.l - 8, y(v) + 4, (v > 0 ? "+" : v < 0 ? "−" : "") + Math.round(Math.abs(v) * 100) + "%", { "text-anchor": "end" });
      });
      for (let d = 0; d < 10; d++) {
        const x = m.l + band * d + (band - bw) / 2;
        const grp = s("g", null, svg);
        if (Math.abs(y(rel[d]) - y(0)) < 2) s("rect", { x, y: y(0) - 1, width: bw, height: 2, rx: 1, class: digitClass(d) + " vis" }, grp);
        else s("path", { d: barPath(x, y(0), y(rel[d]), bw), class: digitClass(d) + " vis" }, grp);
        s("rect", { x: m.l + band * d, y: m.t, width: band, height: ih, class: "hit" }, grp);
        const lab = text(svg, m.l + band * d + band / 2, H - m.b + 22, String(d), {
          "text-anchor": "middle",
          class: d === 4 || d === 5 ? "label-strong" : "",
          style: "font-size:15px",
        });
        lab.setAttribute("aria-hidden", "true");
        if (d === 4 || d === 5 || opts.labelAll) {
          const up = rel[d] >= 0;
          text(svg, m.l + band * d + band / 2, y(rel[d]) + (up ? -7 : 16), MF.rel(counts[d], exp), {
            "text-anchor": "middle",
            class: "lbl-" + d,
          });
        }
        hover(grp, () => [
          { text: MF.rel(counts[d], exp) + " vs. expected", strong: true },
          { text: "Digit " + d + ": " + MF.int(counts[d]) + " quarters (" + MF.pct(counts[d] / n, 2) + ")" },
          { text: "Expected if random: " + MF.int(exp) + " (10.00%)" },
        ]);
      }
      s("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: "baseline" }, svg);
      text(svg, m.l + iw / 2, H - 3, opts.xTitle || "Digit in the tenth-of-a-cent place", { "text-anchor": "middle", style: "font-size:12px" });
    });
  };

  // ---------------------------------------------------------------
  // The fine histogram: 100 slices of a cent, to show the half-cent line.
  MF.chartCliff = function (el, bins, opts = {}) {
    const max = Math.max(...bins);
    const mean = bins.reduce((a, b) => a + b, 0) / bins.length;
    responsive(el, (W) => {
      const H = opts.height || (W < 480 ? 240 : 290);
      const m = { t: 30, r: W < 480 ? 6 : 62, b: 40, l: 46 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "" }, el);
      const top = ticks(0, max * 1.08, 4).slice(-1)[0] >= max ? ticks(0, max * 1.08, 4).slice(-1)[0] : max * 1.1;
      const y = (v) => m.t + ih - (v / top) * ih;
      const band = iw / 100;
      const gap = band > 5 ? 2 : band > 3 ? 1 : 0.5;
      const bw = Math.max(1, band - gap);
      const g = s("g", { class: "grid" }, svg);
      const tg = s("g", { class: "tick" }, svg);
      ticks(0, top, 4).forEach((v) => {
        if (v > 0) s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        text(tg, m.l - 8, y(v) + 4, v >= 1000 ? MF.int(v / 1000) + "K" : MF.int(v), { "text-anchor": "end" });
      });
      for (let b = 0; b < 100; b++) {
        const d = Math.floor(b / 10);
        const x = m.l + band * b + gap / 2;
        const grp = s("g", null, svg);
        s("path", { d: barPath(x, y(0), y(bins[b]), bw), class: digitClass(d) + " vis" }, grp);
        s("rect", { x: m.l + band * b, y: m.t, width: band, height: ih, class: "hit" }, grp);
        hover(grp, () => [
          { text: MF.int(bins[b]) + " quarters", strong: true },
          { text: "Unrounded EPS ending in …" + d + (b % 10) + "…" },
          { text: d === 4 && b % 10 >= 5 ? "Just under half a cent: rounds down" : d === 5 && b % 10 <= 4 ? "Just over half a cent: rounds up" : (b < 50 ? "Rounds down" : "Rounds up") },
        ]);
      }
      // average line
      s("line", { x1: m.l, x2: W - m.r, y1: y(mean), y2: y(mean), class: "ref" }, svg);
      if (W >= 480) text(svg, W - m.r + 6, y(mean) + 4, "Average", {});
      // the half-cent line
      const hx = m.l + band * 50;
      s("line", { x1: hx, x2: hx, y1: m.t - 18, y2: y(0), class: "event" }, svg);
      text(svg, hx + 6, m.t - 8, W < 480 ? "Half a cent" : "Half a cent: from here, EPS rounds up", { class: "label-strong" });
      s("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: "baseline" }, svg);
      for (let d = 0; d < 10; d++) {
        text(svg, m.l + band * (d * 10 + 5), H - m.b + 20, String(d), {
          "text-anchor": "middle",
          class: d === 4 || d === 5 ? "label-strong" : "",
          style: "font-size:14px",
        });
      }
      text(svg, m.l + iw / 2, H - 3, opts.xTitle || "Tenth-of-a-cent digit, split into ten slices each", { "text-anchor": "middle" });
    });
  };

  // ---------------------------------------------------------------
  // Share of 4s and 5s by year, with the expected 10% and an event marker.
  MF.chartYears = function (el, rows, opts = {}) {
    // rows: [{year, n, k4, k5}]
    const pts = rows.map((r) => {
      const p4 = r.k4 / r.n;
      const se = Math.sqrt((p4 * (1 - p4)) / r.n);
      return { year: r.year, n: r.n, p4, p5: r.k5 / r.n, lo: p4 - 1.96 * se, hi: p4 + 1.96 * se };
    });
    const vals = pts.flatMap((p) => [p.lo, p.hi, p.p5, 0.1]);
    const lo = Math.max(0, Math.floor(Math.min(...vals) * 100 - 0.5) / 100);
    const hi = Math.ceil(Math.max(...vals) * 100 + 0.5) / 100;
    responsive(el, (W) => {
      const H = opts.height || (W < 480 ? 250 : 300);
      const m = { t: 26, r: 16, b: 34, l: 46 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "" }, el);
      const y0 = pts[0].year;
      const y1 = pts[pts.length - 1].year;
      const x = (yr) => m.l + ((yr - y0) / Math.max(1, y1 - y0)) * iw;
      const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
      const g = s("g", { class: "grid" }, svg);
      const tg = s("g", { class: "tick" }, svg);
      ticks(lo, hi, 4).forEach((v) => {
        s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        text(tg, m.l - 8, y(v) + 4, Math.round(v * 1000) / 10 + "%", { "text-anchor": "end" });
      });
      const every = W < 480 ? 4 : W < 760 ? 2 : 1;
      pts.forEach((p, i) => {
        if (i % every === 0 || i === pts.length - 1)
          text(tg, x(p.year), H - m.b + 20, String(p.year), { "text-anchor": "middle" });
      });
      // expected line
      s("line", { x1: m.l, x2: W - m.r, y1: y(0.1), y2: y(0.1), class: "ref" }, svg);
      text(svg, m.l + 4, y(0.1) - 6, "Expected: 10%", {});
      // event
      if (opts.event && opts.event.year >= y0 && opts.event.year <= y1 + 1) {
        const ex = x(Math.min(opts.event.year, y1));
        s("line", { x1: ex, x2: ex, y1: m.t - 14, y2: m.t + ih, class: "event" }, svg);
        text(svg, ex + (ex > W * 0.7 ? -6 : 6), m.t - 4, opts.event.label, { "text-anchor": ex > W * 0.7 ? "end" : "start", class: "label-strong" });
      }
      // confidence band for 4s
      const band = pts.map((p) => `${x(p.year)},${y(p.hi)}`).join(" ") + " " + pts.slice().reverse().map((p) => `${x(p.year)},${y(p.lo)}`).join(" ");
      s("polygon", { points: band, class: "band-4" }, svg);
      s("polyline", { points: pts.map((p) => `${x(p.year)},${y(p.p5)}`).join(" "), class: "line-5" }, svg);
      s("polyline", { points: pts.map((p) => `${x(p.year)},${y(p.p4)}`).join(" "), class: "line-4" }, svg);
      pts.forEach((p) => {
        s("circle", { cx: x(p.year), cy: y(p.p5), r: 4, class: "dot-5" }, svg);
        s("circle", { cx: x(p.year), cy: y(p.p4), r: 4, class: "dot-4" }, svg);
      });
      // crosshair + tooltip
      const cross = s("line", { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: "ref", style: "opacity:0" }, svg);
      const hit = s("rect", { x: m.l - 10, y: m.t, width: iw + 20, height: ih, class: "hit", tabindex: "0" }, svg);
      let idx = pts.length - 1;
      const show = (e) => {
        if (e.type !== "focus" && e.type !== "keydown") {
          const r = svg.getBoundingClientRect();
          const px = e.clientX - r.left;
          idx = Math.round(((px - m.l) / iw) * (y1 - y0));
          idx = Math.max(0, Math.min(pts.length - 1, idx));
        }
        const p = pts[idx];
        cross.setAttribute("x1", x(p.year));
        cross.setAttribute("x2", x(p.year));
        cross.style.opacity = 1;
        const fake = e.clientX != null && e.type !== "focus" && e.type !== "keydown" ? e : { currentTarget: hit, type: "focus" };
        MF.tip.show(fake, [
          { text: String(p.year), strong: true },
          { text: "4s: " + MF.pct(p.p4, 2) + "  (95% CI " + MF.pct(p.lo, 1) + "–" + MF.pct(p.hi, 1) + ")" },
          { text: "5s: " + MF.pct(p.p5, 2) },
          { text: MF.int(p.n) + " quarters checked" },
        ]);
      };
      hit.addEventListener("pointermove", show);
      hit.addEventListener("focus", show);
      hit.addEventListener("keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          idx = Math.max(0, Math.min(pts.length - 1, idx + (e.key === "ArrowRight" ? 1 : -1)));
          show(e);
          e.preventDefault();
        }
      });
      const off = () => {
        cross.style.opacity = 0;
        MF.tip.hide();
      };
      hit.addEventListener("pointerleave", off);
      hit.addEventListener("blur", off);
      s("line", { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, class: "baseline" }, svg);
    });
  };

  // ---------------------------------------------------------------
  // Share of 4s for several groups, each with a 95% confidence interval.
  MF.chartGroups = function (el, groups, opts = {}) {
    // groups: [{label, n, k4}]
    const rows = groups.map((g) => {
      const p = g.k4 / g.n;
      const se = Math.sqrt((p * (1 - p)) / g.n);
      return Object.assign({}, g, { p, lo: p - 1.96 * se, hi: p + 1.96 * se });
    });
    const lo = opts.lo != null ? opts.lo : Math.min(0.08, Math.floor(Math.min(...rows.map((r) => r.lo)) * 200) / 200);
    const hi = opts.hi != null ? opts.hi : Math.max(0.105, Math.ceil(Math.max(...rows.map((r) => r.hi)) * 200) / 200);
    responsive(el, (W) => {
      const rowH = 34;
      const labW = W < 520 ? Math.min(150, W * 0.42) : 230;
      const m = { t: 26, r: 18, b: 30, l: labW };
      const H = m.t + m.b + rowH * rows.length;
      const iw = W - m.l - m.r;
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "" }, el);
      const x = (v) => m.l + ((v - lo) / (hi - lo)) * iw;
      const g = s("g", { class: "grid" }, svg);
      const tg = s("g", { class: "tick" }, svg);
      ticks(lo, hi, W < 520 ? 3 : 5).forEach((v) => {
        s("line", { x1: x(v), x2: x(v), y1: m.t - 6, y2: H - m.b }, g);
        text(tg, x(v), H - m.b + 18, Math.round(v * 1000) / 10 + "%", { "text-anchor": "middle" });
      });
      s("line", { x1: x(0.1), x2: x(0.1), y1: m.t - 14, y2: H - m.b, class: "ref" }, svg);
      text(svg, x(0.1), m.t - 18, "Expected 10%", { "text-anchor": "middle" });
      rows.forEach((r, i) => {
        const cy = m.t + rowH * i + rowH / 2;
        const grp = s("g", null, svg);
        const lab = text(grp, 0, cy + 4, r.label, { class: "" });
        lab.style.fontSize = W < 520 ? "12px" : "13px";
        lab.style.fill = "var(--ink)";
        s("line", { x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy, class: "whisker" }, grp);
        s("circle", { cx: x(r.p), cy, r: 5, class: "dot-4" }, grp);
        s("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: "hit" }, grp);
        hover(grp, () => [
          { text: MF.pct(r.p, 2) + " were 4s", strong: true },
          { text: r.label },
          { text: "95% CI " + MF.pct(r.lo, 1) + "–" + MF.pct(r.hi, 1) },
          { text: MF.int(r.n) + " quarters checked" },
        ]);
      });
    });
  };

  // ---------------------------------------------------------------
  // A company's own digit counts against the expected count.
  MF.chartSmallDigits = function (el, counts, opts = {}) {
    const n = counts.reduce((a, b) => a + b, 0);
    const exp = n / 10;
    const max = Math.max(exp * 1.6, ...counts);
    responsive(el, (W) => {
      const H = opts.height || 200;
      const m = { t: 20, r: W >= 480 ? 84 : 8, b: 30, l: 30 };
      const iw = W - m.l - m.r;
      const ih = H - m.t - m.b;
      const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "" }, el);
      const top = Math.max(2, ticks(0, max, 3).slice(-1)[0] >= max ? ticks(0, max, 3).slice(-1)[0] : Math.ceil(max));
      const y = (v) => m.t + ih - (v / top) * ih;
      const band = iw / 10;
      const bw = Math.min(24, band * 0.6);
      const g = s("g", { class: "grid" }, svg);
      const tg = s("g", { class: "tick" }, svg);
      ticks(0, top, 3).forEach((v) => {
        if (v > 0) s("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        if (Number.isInteger(v)) text(tg, m.l - 8, y(v) + 4, String(v), { "text-anchor": "end" });
      });
      for (let d = 0; d < 10; d++) {
        const xx = m.l + band * d + (band - bw) / 2;
        const grp = s("g", null, svg);
        s("path", { d: barPath(xx, y(0), y(counts[d]), bw), class: digitClass(d) + " vis" }, grp);
        s("rect", { x: m.l + band * d, y: m.t, width: band, height: ih, class: "hit" }, grp);
        text(svg, m.l + band * d + band / 2, H - m.b + 19, String(d), { "text-anchor": "middle", class: d === 4 || d === 5 ? "label-strong" : "", style: "font-size:13px" });
        if (d === 4 || d === 5) text(svg, m.l + band * d + band / 2, y(counts[d]) - 6, String(counts[d]), { "text-anchor": "middle", class: "lbl-" + d });
        hover(grp, () => [
          { text: counts[d] + (counts[d] === 1 ? " quarter" : " quarters"), strong: true },
          { text: "Digit " + d },
          { text: "Expected about " + exp.toFixed(1) },
        ]);
      }
      s("line", { x1: m.l, x2: W - m.r, y1: y(exp), y2: y(exp), class: "ref" }, svg);
      if (W >= 480) text(svg, W - m.r + 8, y(exp) + 4, "Expected " + exp.toFixed(1), {});
      s("line", { x1: m.l, x2: W - m.r, y1: y(0), y2: y(0), class: "baseline" }, svg);
    });
  };
})();

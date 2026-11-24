// Kosterina gifts: small chart renderer. Each chart's data sits in a JSON block on the page,
// so the same numbers drive the web page, the PDF and any later video frames.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const txt = (parent, x, y, s, attrs) => { const t = el("text", Object.assign({ x, y }, attrs || {}), parent); t.textContent = s; return t; };
  const fmtK = (v) => v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M" : v >= 1e3 ? Math.round(v / 1e3) + "K" : String(v);

  // ---------- tooltip ----------
  function attachTips(plot) {
    let tip = plot.querySelector(".tip");
    if (!tip) { tip = document.createElement("div"); tip.className = "tip"; tip.setAttribute("role", "status"); plot.appendChild(tip); }
    const show = (e) => {
      const t = e.target.closest("[data-tip]");
      if (!t) { tip.classList.remove("on"); return; }
      tip.textContent = t.getAttribute("data-tip");
      const r = plot.getBoundingClientRect();
      let x = e.clientX - r.left + 12, y = e.clientY - r.top - 36;
      tip.classList.add("on");
      const w = tip.offsetWidth;
      if (x + w > r.width) x = Math.max(0, e.clientX - r.left - w - 12);
      if (y < 0) y = e.clientY - r.top + 16;
      tip.style.left = x + "px"; tip.style.top = y + "px";
    };
    plot.onpointermove = show; plot.onpointerdown = show;
    plot.onpointerleave = () => tip.classList.remove("on");
  }

  // ---------- dot strip (log x), one row per group, beeswarm within row ----------
  function dotstrip(plot, d, W) {
    const r = W < 480 ? 3.6 : 4.5, gap = 1.2;
    const padL = 6, padR = 10, x0 = padL, x1 = W - padR;
    const lo = Math.log10(d.domain[0]), hi = Math.log10(d.domain[1]);
    const X = (v) => x0 + (Math.log10(v) - lo) / (hi - lo) * (x1 - x0);
    const rows = d.groups.map((g) => {
      const pts = d.points.filter((p) => p.g === g.key).map((p) => ({ p, x: X(p.v) })).sort((a, b) => a.x - b.x);
      const placed = [];
      for (const q of pts) {
        let best = 0;
        for (let k = 0; k < 400; k++) {
          const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
          const ok = placed.every((o) => (o.x - q.x) ** 2 + (o.y - off) ** 2 >= (2 * r + gap) ** 2);
          if (ok) { best = off; break; }
        }
        q.y = best; placed.push(q);
      }
      const ext = Math.max(r, ...placed.map((q) => Math.abs(q.y))) + r;
      return { g, pts: placed, ext };
    });
    const labelH = 22, rowGap = 30, axisH = 26;
    let H = 0; rows.forEach((rw) => { rw.top = H + labelH; rw.cy = rw.top + rw.ext; H = rw.cy + rw.ext + rowGap; });
    H += axisH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": d.alt });
    // grid + axis
    for (const t of d.ticks) {
      const x = X(t);
      el("line", { x1: x, x2: x, y1: 0, y2: H - axisH + 4, stroke: css("--grid"), "stroke-width": 1 }, svg);
      txt(svg, x, H - 8, fmtK(t), { "text-anchor": "middle", "font-size": 12, class: "t-muted" });
    }
    rows.forEach((rw) => {
      txt(svg, x0, rw.top - 8, rw.g.label, { "font-size": 14, class: "t-strong" });
      const col = rw.g.accent ? css("--accent") : css("--context");
      for (const q of rw.pts) {
        el("circle", { cx: q.x, cy: rw.cy + q.y, r, fill: col, stroke: css("--surface"), "stroke-width": 1.2, "data-tip": q.p.tip }, svg);
      }
      const m = rw.g.median, mx = X(m);
      el("line", { x1: mx, x2: mx, y1: rw.cy - rw.ext - 2, y2: rw.cy + rw.ext + 6, stroke: css("--ink"), "stroke-width": 2, "stroke-linecap": "round" }, svg);
      const lab = "Median " + fmtK(m);
      const anchor = mx > W * 0.72 ? "end" : "start";
      txt(svg, anchor === "end" ? mx - 6 : mx + 6, rw.cy + rw.ext + 16, lab, { "font-size": 13, "text-anchor": anchor, class: "t-strong" });
    });
    plot.appendChild(svg);
  }

  // ---------- range rows (linear x) ----------
  function ranges(plot, d, W) {
    const x0 = 4, x1 = W - 12, X = (v) => x0 + v / d.max * (x1 - x0);
    const rowH = 74, axisH = 24, H = d.rows.length * rowH + axisH;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": d.alt });
    for (const t of d.ticks) {
      const x = X(t);
      el("line", { x1: x, x2: x, y1: 0, y2: H - axisH + 4, stroke: css("--grid"), "stroke-width": 1 }, svg);
      txt(svg, x, H - 6, t === 0 ? "$0" : "$" + fmtK(t), { "text-anchor": t === 0 ? "start" : "middle", "font-size": 12, class: "t-muted" });
    }
    d.rows.forEach((rw, i) => {
      const y = i * rowH + 22;
      txt(svg, x0, y - 6, rw.label, { "font-size": 14, class: "t-strong" });
      const a = X(rw.lo), b = X(rw.hi);
      if (rw.style === "dashed") {
        el("rect", { x: a, y, width: b - a, height: 20, rx: 4, fill: "transparent", stroke: css("--context"), "stroke-width": 2, "stroke-dasharray": "5 4", "data-tip": rw.tip }, svg);
      } else {
        el("rect", { x: a, y, width: Math.max(b - a, 6), height: 20, rx: 4, fill: css("--accent"), "data-tip": rw.tip }, svg);
      }
      const nx = rw.style === "dashed" ? x0 : x0;
      txt(svg, nx, y + 38, rw.note, { "font-size": 13 });
    });
    plot.appendChild(svg);
  }

  // ---------- horizontal bars (supports negatives) ----------
  function hbars(plot, d, W) {
    const narrow = W < 480;
    const labW = d.labelsAbove || narrow ? 0 : (d.labelW || 150);
    const valW = d.valueW || 64;
    const minV = Math.min(0, ...d.rows.map((r) => r.v)), maxV = Math.max(0, ...d.rows.map((r) => r.v));
    const negPad = minV < 0 ? valW : 0;
    const x0 = labW + negPad, x1 = W - valW;
    const X = (v) => x0 + (v - minV) / (maxV - minV) * (x1 - x0);
    const bar = 20, above = labW === 0 ? 20 : 0, rowH = bar + above + (d.rowGap || 14);
    const H = d.rows.length * rowH + 4;
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": d.alt });
    const zx = X(0);
    d.rows.forEach((rw, i) => {
      const y = i * rowH + above;
      if (labW) txt(svg, labW - 10, y + bar / 2 + 5, rw.label, { "font-size": 14, "text-anchor": "end", class: rw.strong ? "t-strong" : "" });
      else txt(svg, minV < 0 ? x0 - negPad : 0, y - 6, rw.label, { "font-size": 14, class: rw.strong ? "t-strong" : "" });
      const a = Math.min(X(rw.v), zx), b = Math.max(X(rw.v), zx), w = Math.max(b - a, 3);
      const fill = rw.style === "outline" ? "transparent" : rw.style === "context" ? css("--context") : css("--accent");
      // 4px rounded data-end, square at the baseline
      const neg = rw.v < 0, rr = Math.min(4, w);
      const path = neg
        ? `M${b},${y} L${a + rr},${y} Q${a},${y} ${a},${y + rr} L${a},${y + bar - rr} Q${a},${y + bar} ${a + rr},${y + bar} L${b},${y + bar} Z`
        : `M${a},${y} L${a + w - rr},${y} Q${a + w},${y} ${a + w},${y + rr} L${a + w},${y + bar - rr} Q${a + w},${y + bar} ${a + w - rr},${y + bar} L${a},${y + bar} Z`;
      el("path", { d: path, fill, stroke: rw.style === "outline" ? css("--accent") : "none", "stroke-width": rw.style === "outline" ? 2 : 0, "stroke-dasharray": rw.style === "outline" ? "5 3" : undefined, "data-tip": rw.tip || rw.label + ": " + rw.text }, svg);
      const tx = neg ? a - 6 : a + w + 6;
      txt(svg, tx, y + bar / 2 + 5, rw.text, { "font-size": 14, "text-anchor": neg ? "end" : "start", class: "t-strong" });
    });
    if (minV < 0) d.rows.forEach((rw, i) => { const y = i * rowH + above; el("line", { x1: zx, x2: zx, y1: y - 3, y2: y + bar + 3, stroke: css("--ink-2"), "stroke-width": 1 }, svg); });
    plot.appendChild(svg);
  }

  // ---------- flavor x oil grid (HTML table, real text for screen readers) ----------
  function grid(plot, d) {
    const t = document.createElement("table");
    t.className = "fgrid";
    const head = t.createTHead().insertRow();
    const th0 = document.createElement("th"); th0.textContent = "Flavor"; head.appendChild(th0);
    for (const c of d.cols) { const th = document.createElement("th"); th.textContent = c; th.scope = "col"; head.appendChild(th); }
    const tb = t.createTBody();
    for (const row of d.rows) {
      const tr = tb.insertRow();
      const th = document.createElement("th"); th.scope = "row"; th.textContent = row.flavor; if (row.strong) th.className = "strong"; tr.appendChild(th);
      row.cells.forEach((cell, j) => {
        const td = tr.insertCell();
        if (cell.open) td.className = "open";
        const clean = cell.clean || [], gray = cell.gray || [];
        const dots = document.createElement("div"); dots.className = "dots";
        clean.forEach((n) => { const s = document.createElement("span"); s.className = "dot"; s.setAttribute("data-tip", "Clean: " + n); dots.appendChild(s); });
        gray.forEach((n) => { const s = document.createElement("span"); s.className = "dot gray"; s.setAttribute("data-tip", "Unconfirmed: " + n); dots.appendChild(s); });
        td.appendChild(dots);
        const sr = document.createElement("span"); sr.className = "sr";
        sr.textContent = `${d.cols[j]}: ${clean.length} clean${clean.length ? " (" + clean.join("; ") + ")" : ""}${gray.length ? ", " + gray.length + " unconfirmed (" + gray.join("; ") + ")" : ""}.`;
        td.appendChild(sr);
        if (cell.note) { const n = document.createElement("div"); n.className = "note"; n.textContent = cell.note; td.appendChild(n); }
      });
    }
    plot.appendChild(t);
  }

  const R = { dotstrip, ranges, hbars, grid };
  function renderAll() {
    document.querySelectorAll("script[type='application/json'][data-chart]").forEach((s) => {
      const fig = s.closest("figure"); const plot = fig.querySelector(".plot");
      const d = JSON.parse(s.textContent);
      plot.querySelectorAll("svg, table").forEach((n) => n.remove());
      const W = Math.max(280, Math.round(plot.clientWidth));
      R[d.type](plot, d, W);
      attachTips(plot);
    });
  }
  function openDetailsForPrint() { document.querySelectorAll("details").forEach((x) => x.open = true); }
  if (/[?&]print\b/.test(location.search)) document.documentElement.classList.add("printing");
  window.addEventListener("beforeprint", () => { openDetailsForPrint(); renderAll(); });
  window.addEventListener("afterprint", renderAll);
  let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(renderAll, 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  document.addEventListener("DOMContentLoaded", () => {
    if (document.documentElement.classList.contains("printing")) openDetailsForPrint();
    renderAll();
  });
})();

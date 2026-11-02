/* RP Labs core: sandboxed experiment runner, chart renderer, safe markdown, CSV.
 * Shared by the Labs page and the scientist workbench. Experiment scripts are untrusted code from employees:
 * they run only inside a sandboxed iframe with no network, no storage and no access to the page. */
window.RPLabs = (() => {
  "use strict";
  const COLORS = ["#2ee6e6", "#fbbf24", "#f472b6", "#34d399", "#a78bfa", "#fb923c", "#60a5fa", "#f87171"];
  const LIMITS = { charts: 6, series: 12, points: 5000, total: 40000, rows: 500, cols: 12, timeoutMs: 5000 };

  const HELPERS = `
const Lab = (() => {
  const sum = a => a.reduce((s, v) => s + v, 0), mean = a => a.length ? sum(a) / a.length : NaN;
  const std = a => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map(v => (v - m) * (v - m))) / (a.length - 1)); };
  const rng = seed => { let s = (seed >>> 0) || 1; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const normal = (r, mu = 0, sd = 1) => { let u = 0; while (!u) u = r(); const v = r(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return {
    constants: { g: 9.80665, c: 299792458, G: 6.6743e-11, kB: 1.380649e-23, NA: 6.02214076e23, R: 8.314462618, h: 6.62607015e-34, e: 1.602176634e-19 },
    sum, mean, std, rng, normal,
    min: a => Math.min.apply(null, a), max: a => Math.max.apply(null, a),
    round: (v, d = 3) => { const k = Math.pow(10, d); return Math.round(v * k) / k; },
    linspace: (a, b, n) => { n = Math.max(2, Math.floor(n)); const o = []; for (let i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1)); return o; },
    range: (a, b, s) => { const o = []; if (!(s > 0)) return o; for (let x = a; x <= b + 1e-12 * Math.abs(b) && o.length < 100000; x += s) o.push(x); return o; },
    column: (rows, k) => rows.map(r => r[k]),
    binomial: (r, n, p) => { n = Math.floor(n); if (n <= 0 || p <= 0) return 0; if (p >= 1) return n; if (n > 400) return Math.max(0, Math.min(n, Math.round(normal(r, n * p, Math.sqrt(n * p * (1 - p)))))); let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; },
    linreg: (x, y) => { const n = x.length, mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); } const slope = sxy / sxx; return { slope, intercept: my - slope * mx, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) }; },
    rk4: (f, y0, t0, t1, dt, every = 1) => {
      const steps = Math.min(Math.ceil((t1 - t0) / dt), 400000), t = [t0], y = [y0.slice()]; let yc = y0.slice(), tc = t0;
      const add = (a, b, k) => a.map((v, i) => v + b[i] * k);
      for (let i = 1; i <= steps; i++) {
        const k1 = f(tc, yc), k2 = f(tc + dt / 2, add(yc, k1, dt / 2)), k3 = f(tc + dt / 2, add(yc, k2, dt / 2)), k4 = f(tc + dt, add(yc, k3, dt));
        yc = yc.map((v, j) => v + dt / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])); tc += dt;
        if (i % every === 0 || i === steps) { t.push(tc); y.push(yc.slice()); }
      }
      return { t, y };
    }
  };
})();`;

  // The script runs in a Web Worker created inside a sandboxed, network-less iframe. A runaway loop only stalls the worker;
  // the page stays responsive and the whole iframe (and worker) is thrown away on timeout.
  function sandboxDoc(script, params) {
    const safe = s => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
    const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
    const workerSrc = HELPERS + "\nonmessage=function(e){try{var fn=new Function('params','Lab',e.data.script);var out=fn(e.data.params,Lab);postMessage({ok:true,payload:JSON.parse(JSON.stringify(out===undefined?null:out))});}catch(err){postMessage({ok:false,payload:String(err&&err.message||err)});}};";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"></head><body><script>
(function(){
  var token = ${JSON.stringify(String(Math.random()).slice(2))};
  function done(ok, payload){ parent.postMessage({ rpLabs: token, ok: ok, payload: payload }, "*"); }
  try {
    var w = new Worker(URL.createObjectURL(new Blob([${safe(JSON.stringify(workerSrc))}], { type: "text/javascript" })));
    w.onmessage = function(e){ done(e.data.ok, e.data.payload); };
    w.onerror = function(e){ done(false, String((e && e.message) || "The script crashed.")); };
    w.postMessage({ params: JSON.parse(${JSON.stringify(JSON.stringify(params))}), script: ${JSON.stringify(script)} });
  } catch (e) { done(false, "Could not start the sandbox: " + String(e && e.message || e)); }
})();
<\/script></body></html>`;
  }
  const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
  const num = v => typeof v === "number" && isFinite(v) ? v : null;

  function clean(raw) {
    if (!raw || typeof raw !== "object") throw new Error("The script must return an object like { charts: [...], metrics: {...} }.");
    let total = 0; const out = { charts: [], metrics: [], table: null, notes: clip(raw.notes, 2000) };
    (Array.isArray(raw.charts) ? raw.charts : []).slice(0, LIMITS.charts).forEach(c => {
      const series = (Array.isArray(c.series) ? c.series : []).slice(0, LIMITS.series).map(s => {
        const xs = Array.isArray(s.x) ? s.x : [], ys = Array.isArray(s.y) ? s.y : [], n = Math.min(xs.length, ys.length, LIMITS.points), x = [], y = [];
        for (let i = 0; i < n; i++) { const a = num(xs[i]), b = num(ys[i]); if (a !== null && b !== null) { x.push(a); y.push(b); } }
        total += x.length; if (total > LIMITS.total) throw new Error("Too many data points (limit " + LIMITS.total + ").");
        return { name: clip(s.name, 40), x, y, style: ["line", "points", "bars"].includes(s.style) ? s.style : "line" };
      }).filter(s => s.x.length);
      out.charts.push({ title: clip(c.title, 80), xLabel: clip(c.xLabel, 40), yLabel: clip(c.yLabel, 40), logY: !!c.logY, series });
    });
    const m = raw.metrics && typeof raw.metrics === "object" ? raw.metrics : {};
    Object.keys(m).slice(0, 20).forEach(k => { const v = m[k]; if (v && typeof v === "object" && !Array.isArray(v)) out.metrics.push({ key: clip(k, 40), label: clip(v.label || k, 60), value: typeof v.value === "number" ? (isFinite(v.value) ? v.value : null) : clip(v.value, 60), unit: clip(v.unit, 20) }); else out.metrics.push({ key: clip(k, 40), label: clip(k, 60), value: typeof v === "number" ? (isFinite(v) ? v : null) : clip(v, 60), unit: "" }); });
    if (raw.table && Array.isArray(raw.table.columns) && Array.isArray(raw.table.rows)) out.table = { columns: raw.table.columns.slice(0, LIMITS.cols).map(c => clip(c, 40)), rows: raw.table.rows.slice(0, LIMITS.rows).map(r => (Array.isArray(r) ? r : []).slice(0, LIMITS.cols).map(v => typeof v === "number" ? (isFinite(v) ? v : null) : clip(v, 60))) };
    if (!out.charts.length && !out.metrics.length && !out.table) throw new Error("The script returned no charts, metrics or table.");
    return out;
  }

  function run(script, params, opts) {
    return new Promise(resolve => {
      const timeoutMs = (opts && opts.timeoutMs) || LIMITS.timeoutMs; const frame = document.createElement("iframe"); let finished = false;
      frame.setAttribute("sandbox", "allow-scripts"); frame.setAttribute("aria-hidden", "true"); frame.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden";
      const doc = sandboxDoc(String(script || ""), params || {}), match = doc.match(/var token = "(\d+)"/), token = match ? match[1] : "";
      const finish = r => { if (finished) return; finished = true; clearTimeout(timer); window.removeEventListener("message", onMsg); frame.remove(); resolve(r); };
      const onMsg = e => { if (e.source !== frame.contentWindow || !e.data || e.data.rpLabs !== token) return; if (!e.data.ok) return finish({ ok: false, error: clip(e.data.payload, 400) }); try { finish({ ok: true, result: clean(e.data.payload) }); } catch (err) { finish({ ok: false, error: err.message }); } };
      const timer = setTimeout(() => finish({ ok: false, error: "The script ran longer than " + Math.round(timeoutMs / 1000) + " seconds and was stopped." }), timeoutMs);
      window.addEventListener("message", onMsg); frame.srcdoc = doc; document.body.append(frame);
    });
  }

  /* ---------- charts ---------- */
  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) { lo -= 1; hi += 1; } const span = hi - lo, raw = span / Math.max(2, count), mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag, step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag, out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(+v.toPrecision(12)); return { ticks: out, step };
  }
  const fmt = v => { const a = Math.abs(v); if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(1); return String(+v.toPrecision(4)); };
  function drawChart(canvas, chart, opts) {
    opts = opts || {}; const dpr = Math.min(window.devicePixelRatio || 1, 2), W = canvas.clientWidth || 600, H = canvas.clientHeight || 320;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); const g = canvas.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const all = (chart.series || []).concat(opts.overlay || []); const pad = { l: 58, r: 14, t: 28, b: 44 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    g.font = "12px Segoe UI, Arial, sans-serif"; g.fillStyle = "#d7e6ff"; g.textBaseline = "alphabetic";
    if (chart.title) { g.font = "bold 13px Segoe UI, Arial, sans-serif"; g.textAlign = "left"; g.fillText(chart.title, pad.l, 17); g.font = "12px Segoe UI, Arial, sans-serif"; }
    if (!all.length) { g.fillStyle = "#7d93b8"; g.textAlign = "center"; g.fillText("No data", W / 2, H / 2); return; }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; all.forEach(s => { s.x.forEach(v => { if (v < x0) x0 = v; if (v > x1) x1 = v; }); s.y.forEach(v => { if (chart.logY && v <= 0) return; const w = chart.logY ? Math.log10(v) : v; if (w < y0) y0 = w; if (w > y1) y1 = w; }); });
    if (all.some(s => s.style === "bars")) { if (!chart.logY) y0 = Math.min(0, y0); }
    if (!isFinite(y0)) { y0 = 0; y1 = 1; } if (x0 === x1) { x0 -= 1; x1 += 1; } if (y0 === y1) { y0 -= 1; y1 += 1; } const ypad = (y1 - y0) * 0.06; y1 += ypad; if (!all.some(s => s.style === "bars")) y0 -= ypad;
    const X = v => pad.l + (v - x0) / (x1 - x0) * pw, Y = v => { const w = chart.logY ? Math.log10(Math.max(v, 1e-300)) : v; return pad.t + ph - (w - y0) / (y1 - y0) * ph; };
    g.strokeStyle = "rgba(125,147,184,.18)"; g.lineWidth = 1; g.fillStyle = "#7d93b8"; g.textAlign = "right";
    niceTicks(y0, y1, 5).ticks.forEach(v => { const y = pad.t + ph - (v - y0) / (y1 - y0) * ph; if (y < pad.t - 1 || y > pad.t + ph + 1) return; g.beginPath(); g.moveTo(pad.l, y); g.lineTo(pad.l + pw, y); g.stroke(); g.fillText(fmt(chart.logY ? Math.pow(10, v) : v), pad.l - 6, y + 4); });
    g.textAlign = "center"; niceTicks(x0, x1, Math.max(3, Math.floor(pw / 90))).ticks.forEach(v => { const x = X(v); if (x < pad.l - 1 || x > pad.l + pw + 1) return; g.beginPath(); g.moveTo(x, pad.t); g.lineTo(x, pad.t + ph); g.stroke(); g.fillText(fmt(v), x, pad.t + ph + 16); });
    g.strokeStyle = "#1e3a63"; g.strokeRect(pad.l, pad.t, pw, ph); g.fillStyle = "#a9bad1"; g.textAlign = "center"; if (chart.xLabel) g.fillText(chart.xLabel, pad.l + pw / 2, H - 8); if (chart.yLabel) { g.save(); g.translate(13, pad.t + ph / 2); g.rotate(-Math.PI / 2); g.fillText(chart.yLabel, 0, 0); g.restore(); }
    const progress = opts.progress == null ? 1 : opts.progress; g.save(); g.beginPath(); g.rect(pad.l, pad.t - 2, pw, ph + 4); g.clip();
    const drawSeries = (s, color, alpha, prog) => { g.globalAlpha = alpha; g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 2; const n = Math.max(1, Math.floor(s.x.length * prog));
      if (s.style === "bars") { const bw = Math.max(2, pw / Math.max(1, s.x.length) * 0.7); for (let i = 0; i < n; i++) { const y = Y(s.y[i]), yb = Y(0 > y0 ? 0 : y0); g.fillRect(X(s.x[i]) - bw / 2, Math.min(y, yb), bw, Math.abs(yb - y)); } }
      else if (s.style === "points") { for (let i = 0; i < n; i++) { g.beginPath(); g.arc(X(s.x[i]), Y(s.y[i]), 3, 0, 6.2832); g.fill(); } }
      else { g.beginPath(); for (let i = 0; i < n; i++) { const x = X(s.x[i]), y = Y(s.y[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); } g.globalAlpha = 1; };
    (opts.overlay || []).forEach((s, i) => drawSeries(s, "#7d93b8", 0.45, 1)); chart.series.forEach((s, i) => drawSeries(s, COLORS[i % COLORS.length], 1, progress)); g.restore();
    if (chart.series.length > 1 || (opts.overlay || []).length) { let lx = pad.l + 8; g.textAlign = "left"; chart.series.forEach((s, i) => { g.fillStyle = COLORS[i % COLORS.length]; g.fillRect(lx, pad.t + 8, 12, 3); g.fillStyle = "#d7e6ff"; g.fillText(s.name || "Series " + (i + 1), lx + 16, pad.t + 13); lx += 28 + g.measureText(s.name || "Series " + (i + 1)).width; }); if ((opts.overlay || []).length) { g.fillStyle = "#7d93b8"; g.fillText("grey = earlier runs", lx, pad.t + 13); } }
  }

  /* ---------- safe markdown ---------- */
  function inline(text) {
    const frag = document.createDocumentFragment(), re = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^)\s]+\))/g; let last = 0, m;
    while ((m = re.exec(text))) { if (m.index > last) frag.append(text.slice(last, m.index)); const t = m[0]; if (t.startsWith("**")) { const b = document.createElement("strong"); b.textContent = t.slice(2, -2); frag.append(b); } else { const mm = t.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/), a = document.createElement("a"); let h = ""; try { h = new URL(mm[2]).href; } catch { /* bad */ } if (h) { a.href = h; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = mm[1]; frag.append(a); } else frag.append(t); } last = m.index + t.length; }
    if (last < text.length) frag.append(text.slice(last)); return frag;
  }
  function markdown(text) {
    const root = document.createElement("div"); let list = null, para = [];
    const flush = () => { if (para.length) { const p = document.createElement("p"); p.append(inline(para.join(" "))); root.append(p); para = []; } list = null; };
    String(text || "").slice(0, 30000).split(/\r?\n/).forEach(line => {
      const h = line.match(/^(#{1,3})\s+(.*)$/), li = line.match(/^\s*[-*]\s+(.*)$/);
      if (h) { flush(); const e = document.createElement("h" + (h[1].length + 2)); e.textContent = h[2]; root.append(e); }
      else if (li) { if (para.length) { const p = para; flush(); para = p; flush(); } if (!list) { list = document.createElement("ul"); root.append(list); } const l = document.createElement("li"); l.append(inline(li[1])); list.append(l); }
      else if (!line.trim()) flush(); else { list = null; para.push(line.trim()); }
    }); flush(); return root;
  }

  function csv(result) {
    const esc = v => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }; const lines = [];
    if (result.table) { lines.push(result.table.columns.map(esc).join(",")); result.table.rows.forEach(r => lines.push(r.map(esc).join(","))); }
    else result.charts.forEach(c => c.series.forEach(s => { lines.push(esc(c.title + " — " + s.name)); lines.push(esc(c.xLabel || "x") + "," + esc(c.yLabel || "y")); s.x.forEach((x, i) => lines.push(x + "," + s.y[i])); lines.push(""); }));
    result.metrics.forEach(m => lines.push(esc(m.label) + "," + esc(m.value) + "," + esc(m.unit))); return lines.join("\n");
  }
  function download(name, text, type) { const u = URL.createObjectURL(new Blob([text], { type: type || "text/plain" })), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
  const formatValue = m => m.value === null ? "—" : typeof m.value === "number" ? fmt(m.value) + (m.unit ? " " + m.unit : "") : m.value + (m.unit ? " " + m.unit : "");
  function goalMet(goal, result) {
    if (!goal || !goal.metric) return false; const m = result.metrics.find(x => x.key === goal.metric); if (!m || typeof m.value !== "number") return false; const v = m.value, a = Number(goal.value), b = Number(goal.value2);
    return goal.op === ">=" ? v >= a : goal.op === "<=" ? v <= a : goal.op === "between" ? v >= Math.min(a, b) && v <= Math.max(a, b) : false;
  }
  return { run, drawChart, markdown, csv, download, formatValue, goalMet, COLORS, LIMITS, fmt, helpersSource: HELPERS };
})();

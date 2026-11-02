/* RP Labs: "Science Labs" tab. Published labs, experiments and papers made by Labs employees.
   Experiment scripts run in the sandbox from labs-core.js. Progress and the lab notebook stay on this device. */
(() => {
  "use strict";
  const L = window.RPLabs; if (!L) return;
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const CACHE_KEY = "rpLabsPublicCache.v1", SESSION_KEY = "sb-nesxcgymsgegkqjhfydx-auth-token", NB_KEY = "rpLabsNotebook.v1", POLL_MS = 60000;
  const EDITOR_ROLES = ["Creator", "Lab Studio Director", "Lab Scientist", "Labs Employee"];
  const PREVIEW = new URLSearchParams(location.search).get("preview") === "local";
  const state = { snapshot: null, version: 0, offline: false, loaded: false, view: "hub", lab: "", exp: "", paper: "", labTab: "exp" };
  const arr = v => Array.isArray(v) ? v : [];
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch { return f; } };
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  function el(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = el("button", { type: "button", text: label }); b.className = cls || "btn"; b.addEventListener("click", fn); return b; };
  const httpsUrl = v => { try { const u = new URL(String(v)); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
  const toast = t => { if (typeof window.showToast === "function") window.showToast(t); };

  /* ---------- notebook (this device only) ---------- */
  const nb = () => { const v = read(NB_KEY, {}); return { runs: arr(v.runs), done: v.done && typeof v.done === "object" ? v.done : {}, tried: v.tried && typeof v.tried === "object" ? v.tried : {} }; };
  function saveNb(v) { try { localStorage.setItem(NB_KEY, JSON.stringify({ runs: v.runs.slice(-200), done: v.done, tried: v.tried })); } catch { /* full */ } }

  /* ---------- styles ---------- */
  document.head.append(el("style", { text: `
#scilabs .sl-wrap{display:grid;gap:16px}
#scilabs h2,#scilabs h3,#scilabs h4{margin:0}
.sl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.sl-card{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:16px;cursor:pointer;display:flex;flex-direction:column;gap:6px;text-align:left;color:var(--text);font:inherit;border-top:3px solid var(--accent,var(--cyan))}
.sl-card:hover,.sl-card:focus-visible{border-color:var(--accent,var(--cyan));outline:none;transform:translateY(-1px)}
.sl-card .em{font-size:30px}.sl-card h3{font-size:17px}.sl-card p{margin:0;color:var(--muted);font-size:13px}
.sl-tags{display:flex;gap:6px;flex-wrap:wrap}.sl-tag{font-size:12px;padding:3px 9px;border-radius:20px;background:rgba(255,255,255,.07);color:var(--muted)}
.sl-tag.ok{background:rgba(52,211,153,.15);color:var(--green)}.sl-tag.goal{background:rgba(251,191,36,.15);color:#fcd34d}.sl-tag.hard{background:rgba(248,113,113,.14);color:#f87171}
.sl-banner{padding:9px 14px;border-radius:10px;background:rgba(251,191,36,.12);color:#fcd34d;font-size:13px}
.sl-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.sl-bar .grow{flex:1}
.sl-panel{background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:16px;display:grid;gap:10px}
.sl-daily{background:linear-gradient(135deg,rgba(46,230,230,.12),rgba(59,130,246,.12));border:1px solid var(--cyan)}
.sl-split{display:grid;grid-template-columns:minmax(240px,340px) minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:860px){.sl-split{grid-template-columns:1fr}}
.sl-param{display:grid;gap:4px;font-size:13px}.sl-param .row{display:grid;grid-template-columns:1fr 84px;gap:8px;align-items:center}
.sl-param input[type=range]{width:100%;accent-color:var(--cyan)}.sl-param input[type=number]{width:100%;padding:5px 6px;border:1px solid var(--border);border-radius:6px;background:var(--panel);color:var(--text)}
.sl-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.sl-m{padding:9px 11px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}.sl-m span{display:block;color:var(--muted);font-size:12px}.sl-m strong{font-size:17px;color:var(--cyan)}
.sl-canvas{width:100%;height:290px;display:block;border:1px solid var(--border);border-radius:10px;background:#030814}
.sl-goal{padding:10px 14px;border-radius:10px;border:1px solid rgba(251,191,36,.45);background:rgba(251,191,36,.08);font-size:14px}.sl-goal.met{border-color:var(--green);background:rgba(52,211,153,.12);color:var(--green)}
.sl-err{padding:10px 12px;border:1px solid #7f2d2d;border-radius:8px;background:#2a1212;color:#ffb4b4;white-space:pre-wrap;font:12px/1.5 Consolas,monospace}
.sl-prose h3,.sl-prose h4,.sl-prose h5{margin:14px 0 6px}.sl-prose p{margin:6px 0;line-height:1.65}.sl-prose ul{margin:6px 0 6px 20px}.sl-prose a{color:var(--cyan)}
.sl-hyp{border-left:3px solid var(--cyan);padding:6px 12px;background:rgba(46,230,230,.06);border-radius:0 8px 8px 0}
.sl-safety{border-left:3px solid #f87171;padding:6px 12px;background:rgba(248,113,113,.07);border-radius:0 8px 8px 0;font-size:13px}
.sl-table{width:100%;border-collapse:collapse;font-size:13px}.sl-table th,.sl-table td{padding:5px 8px;border-bottom:1px solid var(--border);text-align:left}
.sl-empty{color:var(--muted);padding:24px;text-align:center}
.sl-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.sl-list li{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:var(--panel)}
.sl-tabs{display:flex;gap:6px}.sl-tabs button{padding:7px 14px;border-radius:20px;border:1px solid var(--border);background:var(--panel);color:var(--muted);cursor:pointer;font:inherit}.sl-tabs button.on{border-color:var(--cyan);color:var(--cyan)}
.sl-note{width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);font:inherit;min-height:60px}
` }));

  /* ---------- content ---------- */
  const cleanP = p => ({ key: String(p.key), label: String(p.label || p.key), unit: String(p.unit || ""), min: num(p.min, 0), max: num(p.max, 100), step: num(p.step, 1) || 1, default: num(p.default, 0) });
  function previewSnapshot() {
    const labs = arr(read("rpLabsLabs.v1", [])).filter(l => l && l.id), lset = new Set(labs.map(l => l.id));
    const exps = arr(read("rpLabsExps.v1", [])).filter(x => x && x.id && x.status !== "draft" && lset.has(x.lab) && x.title).map(x => ({ ...x, params: arr(x.params).filter(p => p && p.key).map(cleanP) })), eset = new Set(exps.map(x => x.id));
    return { labs, experiments: exps, papers: arr(read("rpLabsPapers.v1", [])).filter(p => p && p.id && p.status !== "draft" && lset.has(p.lab) && p.title).map(p => ({ ...p, figure: p.figure && eset.has(p.figure.experiment) ? p.figure : null })) };
  }
  const snap = () => PREVIEW ? previewSnapshot() : (state.snapshot || { labs: [], experiments: [], papers: [] });
  const labs = () => arr(snap().labs), exps = () => arr(snap().experiments), papers = () => arr(snap().papers);
  const labById = id => labs().find(l => l.id === id), expById = id => exps().find(x => x.id === id), paperById = id => papers().find(p => p.id === id);
  async function api(q) { const r = await fetch(SB_URL + "/rest/v1/rp_labs_publications?" + q, { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }
  function saveCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version: state.version, snapshot: state.snapshot })); } catch { /* full */ } }
  function loadCache() { const c = read(CACHE_KEY, null); if (c && c.snapshot && typeof c.snapshot === "object") { state.snapshot = c.snapshot; state.version = Number(c.version) || 0; } }
  async function syncLive(force) {
    if (PREVIEW) return;
    try {
      const head = await api("select=version&order=version.desc&limit=1"); state.offline = false; const latest = head.length ? Number(head[0].version) : 0;
      if (!force && state.loaded && latest === state.version) return;
      if (!latest) { state.snapshot = null; state.version = 0; } else { const rows = await api("select=version,snapshot&version=eq." + latest + "&limit=1"); if (rows.length && rows[0].snapshot && typeof rows[0].snapshot === "object") { state.snapshot = rows[0].snapshot; state.version = Number(rows[0].version); saveCache(); } }
      state.loaded = true; rerender();
    } catch { state.offline = true; state.loaded = true; rerender(); }
  }

  /* ---------- host ---------- */
  const section = document.getElementById("scilabs"), host = el("div", { class: "sl-wrap" }); section.append(host);
  let running = 0, anim = 0;
  const top = () => { host.replaceChildren(); if (PREVIEW) host.append(el("div", { class: "sl-banner", text: "Preview: showing your local drafts." })); else if (state.offline) host.append(el("div", { class: "sl-banner", text: state.snapshot ? "You are offline. Showing the last version saved on this device." : "Could not reach the labs library. Check your connection." })); };
  const tag = (t, c) => el("span", { class: "sl-tag" + (c ? " " + c : ""), text: t });
  const back = (label, fn) => btn("← " + label, fn, "btn secondary");
  function go(view, ids) { cancelAnimationFrame(anim); Object.assign(state, { view }, ids || {}); render(); section.scrollIntoView({ block: "start" }); }
  const render = () => ({ hub: hubView, lab: labView, exp: expView, paper: paperView, notebook: notebookView })[state.view]();
  // Called when new data arrives: don't wipe an experiment or paper figure the visitor is looking at.
  function rerender() { if ((state.view === "exp" || state.view === "paper") && host.querySelector(".sl-results canvas, .sl-results .sl-err")) return; render(); }

  /* ---------- hub ---------- */
  function dailyExperiment() { const list = exps(); if (!list.length) return null; let h = 0; const d = new Date().toISOString().slice(0, 10); for (const ch of d) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return list[h % list.length]; }
  function hubView() {
    state.view = "hub"; top(); host.append(el("h2", { text: "🧪 Science Labs" }), el("p", { class: "research-meta", text: "Run real simulations written by RP scientists. Change the settings, watch what happens, and write down what you discover." }));
    const n = nb(), found = Object.keys(n.done).filter(id => expById(id)).length;
    host.append(el("div", { class: "sl-bar" }, el("span", { class: "sl-tag ok", text: "🏅 " + found + " of " + exps().length + " experiments completed" }), el("span", { class: "grow" }), btn("📓 My lab notebook (" + n.runs.length + ")", () => go("notebook"), "btn secondary")));
    const d = dailyExperiment();
    if (d) host.append(el("div", { class: "sl-panel sl-daily" }, el("h3", { text: "⭐ Experiment of the day" }), el("strong", { text: d.title }), el("p", { class: "research-meta", text: (labById(d.lab) || {}).name + " · " + (d.summary || "") }), btn("Try it today", () => go("exp", { exp: d.id, lab: d.lab }), "btn")));
    if (!labs().length) { host.append(el("p", { class: "sl-empty", text: state.loaded || PREVIEW ? "No labs are published yet. Check back soon." : "Loading labs…" })); return; }
    const grid = el("div", { class: "sl-grid" });
    labs().forEach(l => { const es = exps().filter(x => x.lab === l.id), ps = papers().filter(p => p.lab === l.id), done = es.filter(x => n.done[x.id]).length, c = el("button", { type: "button", class: "sl-card" }, el("span", { class: "em", text: l.emoji || "🔬" }), el("h3", { text: l.name }), el("p", { text: l.description || "" }), el("div", { class: "sl-tags" }, tag(es.length + " experiment" + (es.length === 1 ? "" : "s")), tag(ps.length + " paper" + (ps.length === 1 ? "" : "s")), done ? tag(done + " done", "ok") : document.createTextNode("")));
      c.style.setProperty("--accent", /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#2ee6e6"); c.addEventListener("click", () => go("lab", { lab: l.id, labTab: "exp" })); grid.append(c); });
    host.append(grid);
    const recent = papers().slice(0, 4); if (recent.length) { host.append(el("h3", { text: "📄 Research papers" })); const ul = el("ul", { class: "sl-list" }); recent.forEach(p => ul.append(el("li", {}, el("span", {}, el("strong", { text: p.title }), el("span", { class: "research-meta", text: " " + (labById(p.lab) || {}).name })), btn("Read", () => go("paper", { paper: p.id, lab: p.lab }), "btn secondary")))); host.append(ul); }
  }

  /* ---------- lab ---------- */
  function labView() {
    const lab = labById(state.lab); if (!lab) return hubView(); top();
    host.append(el("div", { class: "sl-bar" }, back("All labs", () => go("hub")), el("h2", { text: (lab.emoji || "🔬") + " " + lab.name })), el("p", { class: "research-meta", text: lab.description || "" }));
    const tabs = el("div", { class: "sl-tabs" }); [["exp", "Experiments"], ["paper", "Papers"]].forEach(([k, t]) => { const b = btn(t, () => { state.labTab = k; labView(); }, state.labTab === k ? "on" : ""); tabs.append(b); }); host.append(tabs);
    const n = nb();
    if (state.labTab === "exp") {
      const grid = el("div", { class: "sl-grid" }), list = exps().filter(x => x.lab === lab.id); if (!list.length) host.append(el("p", { class: "sl-empty", text: "No experiments in this lab yet." }));
      list.forEach(x => { const c = el("button", { type: "button", class: "sl-card" }, el("h3", { text: x.title }), el("p", { text: x.summary || "" }), el("div", { class: "sl-tags" }, tag(x.difficulty || "intro", x.difficulty === "advanced" ? "hard" : ""), tag((x.minutes || 5) + " min"), x.goal ? tag("🎯 challenge", "goal") : document.createTextNode(""), n.done[x.id] ? tag("✓ done", "ok") : document.createTextNode("")));
        c.style.setProperty("--accent", /^#[0-9a-f]{6}$/i.test(lab.color) ? lab.color : "#2ee6e6"); c.addEventListener("click", () => go("exp", { exp: x.id })); grid.append(c); }); host.append(grid);
    } else {
      const ul = el("ul", { class: "sl-list" }), list = papers().filter(p => p.lab === lab.id); if (!list.length) host.append(el("p", { class: "sl-empty", text: "No papers in this lab yet." }));
      list.forEach(p => ul.append(el("li", {}, el("span", {}, el("strong", { text: p.title }), el("div", { class: "research-meta", text: [p.authors, p.abstract && p.abstract.slice(0, 140)].filter(Boolean).join(" · ") })), btn("Read", () => go("paper", { paper: p.id }), "btn secondary")))); host.append(ul);
    }
  }

  /* ---------- experiment ---------- */
  let lastRun = null, prevRun = null, curParams = {};
  function paramsFromHash(x) { const m = location.hash.match(/^#sci\/exp\/([^?]+)\?(.*)$/); const out = {}; if (m && decodeURIComponent(m[1]) === x.id) new URLSearchParams(m[2]).forEach((v, k) => { out[k] = num(v, undefined); }); return out; }
  function expView() {
    const x = expById(state.exp); if (!x) return state.lab ? labView() : hubView(); top(); const lab = labById(x.lab) || {};
    lastRun = null; prevRun = null; const pre = state.preset || paramsFromHash(x); state.preset = null;
    curParams = {}; arr(x.params).forEach(p => { const v = pre[p.key]; curParams[p.key] = Number.isFinite(v) ? Math.min(p.max, Math.max(p.min, v)) : p.default; });
    host.append(el("div", { class: "sl-bar" }, back(lab.name || "Back", () => go("lab", { lab: x.lab, labTab: "exp" })), el("h2", { text: x.title })));
    host.append(el("div", { class: "sl-tags" }, tag(lab.name || ""), tag(x.difficulty || "intro", x.difficulty === "advanced" ? "hard" : ""), tag((x.minutes || 5) + " min")));
    if (x.hypothesis) host.append(el("div", { class: "sl-hyp" }, el("strong", { text: "Hypothesis: " }), document.createTextNode(x.hypothesis)));
    if (x.safety) host.append(el("div", { class: "sl-safety", text: "⚠ " + x.safety }));
    if (x.theory) { const d = el("details", { class: "sl-panel" }, el("summary", { text: "📖 Background and theory" })); const pr = L.markdown(x.theory); pr.className = "sl-prose"; d.append(pr); host.append(d); }
    if (x.goal && x.goal.metric) host.append(el("div", { class: "sl-goal", id: "slGoal", text: "🎯 Challenge: " + (x.goal.text || "Reach the goal") }));
    const controls = el("div", { class: "sl-panel" }), results = el("div", { class: "sl-panel sl-results" }, el("p", { class: "research-meta", text: "Set your values and press Run." }));
    controls.append(el("h3", { text: "Settings" }));
    arr(x.params).forEach(p => {
      const r = el("input", { type: "range", min: p.min, max: p.max, step: p.step, "aria-label": p.label }), nn = el("input", { type: "number", min: p.min, max: p.max, step: p.step, "aria-label": p.label + " value" }); r.value = nn.value = curParams[p.key];
      const set = v => { v = Math.min(p.max, Math.max(p.min, num(v, p.default))); curParams[p.key] = v; r.value = v; if (document.activeElement !== nn) nn.value = v; };
      r.addEventListener("input", () => set(r.value)); nn.addEventListener("input", () => set(nn.value)); nn.addEventListener("change", () => { nn.value = curParams[p.key]; });
      controls.append(el("label", { class: "sl-param" }, el("span", { text: p.label + (p.unit ? " (" + p.unit + ")" : "") }), el("div", { class: "row" }, r, nn)));
    });
    const runBtn = btn("▶ Run experiment", () => run(x, runBtn, results), "btn"), reset = btn("Reset", () => { arr(x.params).forEach(p => { curParams[p.key] = p.default; }); expView(); }, "btn secondary"), share = btn("🔗 Copy link", () => { const q = new URLSearchParams(curParams).toString(), u = location.origin + location.pathname + "#sci/exp/" + encodeURIComponent(x.id) + "?" + q; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast("Link copied"), () => toast("Could not copy the link")); }, "btn secondary");
    controls.append(el("div", { class: "sl-bar" }, runBtn, reset, share));
    host.append(el("div", { class: "sl-split" }, controls, results));
  }
  function describeGoal(x, res) {
    const g = x.goal, m = res.metrics.find(k => k.key === g.metric), met = L.goalMet(g, res), box = document.getElementById("slGoal"); if (!box) return met;
    box.className = "sl-goal" + (met ? " met" : ""); box.textContent = (met ? "✅ Challenge complete! " : "🎯 Challenge: ") + (g.text || "Reach the goal") + (m ? " (" + m.label + ": " + L.formatValue(m) + ")" : ""); return met;
  }
  function animate(canvases, charts, overlays) {
    cancelAnimationFrame(anim); const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches, t0 = performance.now(), dur = 700;
    const draw = p => canvases.forEach((cv, i) => L.drawChart(cv, charts[i], { overlay: overlays[i], progress: p }));
    if (reduce) return draw(1); const tick = now => { const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3); draw(e); if (p < 1) anim = requestAnimationFrame(tick); }; anim = requestAnimationFrame(tick);
  }
  function showResult(root, res, opts) {
    root.replaceChildren(); const charts = res.charts, canvases = [];
    if (res.metrics.length) root.append(el("div", { class: "sl-metrics" }, ...res.metrics.map(m => el("div", { class: "sl-m" }, el("span", { text: m.label }), el("strong", { text: L.formatValue(m) })))));
    charts.forEach(() => { const cv = el("canvas", { class: "sl-canvas", role: "img" }); cv.setAttribute("aria-label", "Chart"); canvases.push(cv); root.append(cv); });
    if (res.table) { const t = el("table", { class: "sl-table" }); t.append(el("tr", {}, ...res.table.columns.map(c => el("th", { text: c })))); res.table.rows.forEach(r => t.append(el("tr", {}, ...r.map(v => el("td", { text: v == null ? "" : String(v) }))))); const w = el("div", {}); w.style.cssText = "max-height:260px;overflow:auto"; w.append(t); root.append(w); }
    if (res.notes) root.append(el("p", { class: "research-meta", text: res.notes }));
    canvases.forEach((cv, i) => cv.setAttribute("aria-label", charts[i].title || "Chart")); animate(canvases, charts, (opts && opts.overlays) || []);
  }
  async function run(x, runBtn, results) {
    if (running) return; running++; runBtn.disabled = true; runBtn.textContent = "Running…"; const params = { ...curParams }, t0 = performance.now();
    const res = await L.run(x.script, params); running--; runBtn.disabled = false; runBtn.textContent = "▶ Run experiment";
    if (state.view !== "exp" || state.exp !== x.id) return;
    if (!res.ok) { results.replaceChildren(el("div", { class: "sl-err", text: "The experiment could not run.\n" + res.error }), el("p", { class: "research-meta", text: "Try different settings." })); return; }
    const result = res.result; prevRun = lastRun; lastRun = { params, result };
    const overlays = prevRun ? prevRun.result.charts.map(c => c.series) : [];
    showResult(results, result, { overlays });
    const n = nb(); n.tried[x.id] = true; let met = true; if (x.goal && x.goal.metric) { met = describeGoal(x, result); } if (met && !n.done[x.id]) { n.done[x.id] = Date.now(); toast("🏅 Experiment completed: " + x.title); } saveNb(n);
    const actions = el("div", { class: "sl-bar" }); const note = el("textarea", { class: "sl-note", maxlength: 500, placeholder: "What did you notice? (saved with this run in your notebook)", "aria-label": "Notebook note" });
    actions.append(btn("📓 Save to notebook", () => { const nn = nb(); nn.runs.push({ id: Date.now().toString(36), exp: x.id, title: x.title, lab: (labById(x.lab) || {}).name || "", ts: Date.now(), params, metrics: result.metrics.map(m => ({ label: m.label, value: m.value, unit: m.unit })), note: note.value.slice(0, 500) }); saveNb(nn); toast("Saved to your notebook"); }),
      btn("⬇ CSV", () => L.download(x.id + "-results.csv", L.csv(result), "text/csv")), el("span", { class: "research-meta", text: "Finished in " + Math.round(performance.now() - t0) + " ms" + (prevRun ? " · grey lines show your previous run" : "") }));
    results.append(note, actions);
  }

  /* ---------- paper ---------- */
  function paperView() {
    const p = paperById(state.paper); if (!p) return hubView(); top(); const lab = labById(p.lab) || {};
    host.append(el("div", { class: "sl-bar" }, back(lab.name || "Back", () => go("lab", { lab: p.lab, labTab: "paper" }))));
    const art = el("article", { class: "sl-panel sl-prose" }, el("h2", { text: p.title }), el("p", { class: "research-meta", text: [p.authors, lab.name].filter(Boolean).join(" · ") }));
    if (p.abstract) art.append(el("div", { class: "sl-hyp" }, el("strong", { text: "Abstract: " }), document.createTextNode(p.abstract)));
    art.append(L.markdown(p.body));
    const x = p.figure && expById(p.figure.experiment);
    if (x) {
      const fig = el("div", { class: "sl-panel" }), out = el("div", { class: "sl-results" }); fig.append(el("strong", { text: "Reproducible figure" }), out, el("p", { class: "research-meta", text: p.figure.caption || "" }));
      const go1 = btn("▶ Reproduce figure", async function () { this.disabled = true; this.textContent = "Running…"; const res = await L.run(x.script, { ...Object.fromEntries(arr(x.params).map(q => [q.key, q.default])), ...(p.figure.params || {}) }); this.disabled = false; this.textContent = "▶ Run again"; if (state.view !== "paper") return; if (!res.ok) out.replaceChildren(el("div", { class: "sl-err", text: res.error })); else showResult(out, res.result); }, "btn");
      fig.append(el("div", { class: "sl-bar" }, go1, btn("Open experiment with these settings", () => { state.preset = { ...(p.figure.params || {}) }; go("exp", { exp: x.id, lab: x.lab }); }, "btn secondary"))); art.append(fig);
    }
    const refs = arr(p.references).filter(r => r && r.title); if (refs.length) { art.append(el("h3", { text: "References" })); const ul = el("ul", {}); refs.forEach(r => { const li = el("li", {}); const u = httpsUrl(r.url); if (u) li.append(el("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: r.title })); else li.textContent = r.title; ul.append(li); }); art.append(ul); }
    host.append(art);
  }

  /* ---------- notebook ---------- */
  function notebookView() {
    top(); const n = nb(); host.append(el("div", { class: "sl-bar" }, back("All labs", () => go("hub")), el("h2", { text: "📓 My lab notebook" })), el("p", { class: "research-meta", text: "Saved on this device only." }));
    if (!n.runs.length) { host.append(el("p", { class: "sl-empty", text: "Nothing here yet. Run an experiment and press “Save to notebook”." })); return; }
    host.append(el("div", { class: "sl-bar" }, btn("⬇ Download as Markdown", () => { const lines = ["# My lab notebook", ""]; n.runs.slice().reverse().forEach(r => { lines.push("## " + r.title + " (" + (r.lab || "") + ")", new Date(r.ts).toLocaleString(), "", "Settings: " + Object.entries(r.params || {}).map(([k, v]) => k + " = " + v).join(", "), "", ...arr(r.metrics).map(m => "- " + m.label + ": " + (m.value === null ? "—" : m.value) + (m.unit ? " " + m.unit : "")), "", r.note ? "Notes: " + r.note : "", ""); }); L.download("lab-notebook.md", lines.join("\n"), "text/markdown"); }, "btn secondary"), btn("Clear notebook", () => { if (confirm("Delete all saved runs from this device?")) { n.runs = []; saveNb(n); notebookView(); } }, "btn secondary")));
    const ul = el("ul", { class: "sl-list" });
    n.runs.slice().reverse().forEach(r => { const li = el("li", {}); const d = el("div", {}, el("strong", { text: r.title }), el("div", { class: "research-meta", text: new Date(r.ts).toLocaleString() + " · " + Object.entries(r.params || {}).map(([k, v]) => k + " = " + v).join(", ") }), el("div", { class: "research-meta", text: arr(r.metrics).slice(0, 4).map(m => m.label + ": " + (m.value === null ? "—" : m.value)).join(" · ") }));
      if (r.note) d.append(el("p", { text: "“" + r.note + "”" })); const acts = el("div", { class: "sl-bar" }); if (expById(r.exp)) acts.append(btn("Re-open", () => { state.preset = { ...r.params }; go("exp", { exp: r.exp, lab: (expById(r.exp) || {}).lab }); }, "btn secondary")); acts.append(btn("Delete", () => { const nn = nb(); nn.runs = nn.runs.filter(q => q.id !== r.id); saveNb(nn); notebookView(); }, "btn secondary")); li.append(d, acts); ul.append(li); });
    host.append(ul);
  }

  /* ---------- employee link + start ---------- */
  function auth() { let s = null; try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return { state: "out" }; } const token = s && typeof s.access_token === "string" ? s.access_token : ""; if (!token) return { state: "out" }; if (Number(s.expires_at) * 1000 < Date.now()) return { state: "expired" }; return { state: "in", token }; }
  const link = el("a", { class: "btn", id: "labsEmployeeLink", href: "labs-employee.html", text: "🧪 Scientist workbench" }); link.style.cssText = "display:none;margin-right:8px"; const header = document.querySelector("header"); header.insertBefore(link, header.querySelector(".btn:not(#backToBranchesFromLab)") || null);
  async function employeeLink() {
    if (PREVIEW) { link.style.display = ""; return; } const a = auth(); if (a.state !== "in") return;
    try { const r = await fetch(SB_URL + "/rest/v1/rpc/rp_get_account_context", { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + a.token, "Content-Type": "application/json" }, body: "{}" }); if (!r.ok) return; const x = await r.json(), roles = Array.isArray(x.roles) ? x.roles : []; if (x.status === "active" && roles.some(q => EDITOR_ROLES.includes(q))) link.style.display = ""; } catch { /* ignore */ }
  }
  function openFromHash() {
    const m = location.hash.match(/^#sci\/exp\/([^?]+)/); if (!m) return; const id = decodeURIComponent(m[1]); if (!expById(id)) return;
    const b = document.querySelector('.tab-btn[data-tab="scilabs"]'); if (b) b.click(); go("exp", { exp: id, lab: expById(id).lab });
  }
  window.addEventListener("hashchange", () => { if (/^#sci\//.test(location.hash)) openFromHash(); });
  if (!PREVIEW) { loadCache(); state.loaded = !!state.snapshot; }
  hubView(); employeeLink(); syncLive(true).then(() => { if (/^#sci\//.test(location.hash)) openFromHash(); });
  if (PREVIEW) { const b = document.querySelector('.tab-btn[data-tab="scilabs"]'); window.addEventListener("load", () => { if (b) b.click(); }); }
  if (!PREVIEW) { setInterval(() => { if (!document.hidden) syncLive(false); }, POLL_MS); window.addEventListener("online", () => syncLive(false)); if (/^#sci\//.test(location.hash)) window.addEventListener("load", openFromHash); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !PREVIEW) syncLive(false); });
  window.addEventListener("storage", () => { if (PREVIEW) rerender(); });
})();

(() => {
  "use strict";
  const K = { labs: "rpLabsLabs.v1", exps: "rpLabsExps.v1", papers: "rpLabsPapers.v1" };
  const SB_URL = "https://nesxcgymsgegkqjhfydx.supabase.co", SB_KEY = "sb_publishable_Tj4frYyU-iAylsH_--y3Qg_esNYqce-";
  const EDITOR_ROLES = ["Creator", "Lab Studio Director", "Lab Scientist", "Labs Employee"];
  const $ = id => document.getElementById(id);
  const read = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? f : v; } catch { return f; } };
  const list = k => { const v = read(K[k], []); return Array.isArray(v) ? v.filter(x => x && x.id) : []; };
  function save(key, value) { try { localStorage.setItem(K[key], JSON.stringify(value)); $("edStatus").textContent = "Saved in this browser"; refreshAll(); return true; } catch { $("edStatus").textContent = "Browser storage full"; return false; } }
  const newId = p => p + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  const str = (v, n) => typeof v === "string" ? v.slice(0, n) : "";
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const say = (id, t, bad) => { const n = $(id); n.textContent = t; n.style.color = bad ? "var(--red)" : "var(--green)"; };
  const when = iso => { try { return new Date(iso).toLocaleString(); } catch { return ""; } };
  function make(tag, attrs = {}, ...kids) { const n = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === "text") n.textContent = v; else if (k === "class") n.className = v; else n.setAttribute(k, v); }); kids.forEach(c => n.append(c)); return n; }
  const btn = (label, fn, cls) => { const b = make("button", { type: "button", text: label }); if (cls) b.className = cls; b.addEventListener("click", fn); return b; };
  const stable = v => Array.isArray(v) ? "[" + v.map(stable).join(",") + "]" : v && typeof v === "object" ? "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}" : JSON.stringify(v === undefined ? null : v);
  const httpsUrl = v => { try { const u = new URL(String(v).trim()); return u.protocol === "https:" ? u.href : ""; } catch { return ""; } };
  const labName = id => (list("labs").find(l => l.id === id) || {}).name || "(missing lab)";
  let labSettings = (window.RPLabsServer || {}).DEFAULTS || {};
  const timeoutMs = () => Math.max(1000, Number(labSettings.sandbox_timeout_ms) || 5000);
  const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,30}$/;

  /* ---------- navigation ---------- */
  const VIEWS = { dashboard: "edDashboard", labs: "edLabs", experiments: "edExperiments", papers: "edPapers", inbox: "edInbox", training: "edTraining", settings: "edSettings", publish: "edPublish", tutorial: "edTutorial" };
  const onShow = {};
  function showView(name) {
    document.querySelectorAll("[data-view]").forEach(b => { const on = b.dataset.view === name; b.classList.toggle("active", on); b.setAttribute("aria-selected", String(on)); });
    Object.entries(VIEWS).forEach(([v, id]) => { const s = $(id), on = v === name; s.hidden = !on; s.classList.toggle("active", on); });
    if (name === "publish") renderPublish();
    if (onShow[name]) onShow[name]();
    if (location.hash !== "#" + name && VIEWS[name]) { try { history.replaceState(null, "", "#" + name); } catch { /* ignore */ } }
  }
  document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  /* ---------- labs ---------- */
  function resetLab() { $("edLabForm").reset(); $("edLabId").value = ""; $("edLabColor").value = "#60a5fa"; $("edLabSave").textContent = "Add lab"; say("edLabMsg", ""); }
  $("edLabForm").addEventListener("submit", e => {
    e.preventDefault(); const name = $("edLabName").value.trim(); if (!name) return say("edLabMsg", "Enter a lab name.", true);
    const id = $("edLabId").value || newId("lab"), item = { id, name, emoji: $("edLabEmoji").value.trim() || "🔬", color: $("edLabColor").value, description: $("edLabDesc").value.trim() };
    const all = list("labs"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.push(item);
    if (save("labs", all)) { resetLab(); say("edLabMsg", "Lab saved."); }
  });
  $("edLabReset").addEventListener("click", resetLab);
  function renderLabList() {
    const root = $("edLabList"), exps = list("exps"), papers = list("papers"); root.replaceChildren();
    if (!list("labs").length) { root.append(make("p", { class: "ed-empty", text: "No labs yet. Create one, or import the starter pack from the Dashboard." })); return; }
    list("labs").forEach(l => {
      const n = exps.filter(x => x.lab === l.id).length, p = papers.filter(x => x.lab === l.id).length, sw = make("span", { class: "lb-swatch" }); sw.style.background = /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#2ee6e6";
      root.append(make("article", { class: "ed-row" }, make("div", {}, make("strong", {}, sw, document.createTextNode((l.emoji || "🔬") + " " + l.name)), make("span", { class: "meta", text: [n + " experiment(s)", p + " paper(s)", l.description].filter(Boolean).join(" · ") })),
        make("div", { class: "acts" }, btn("Edit", () => { $("edLabId").value = l.id; $("edLabName").value = l.name; $("edLabEmoji").value = l.emoji || ""; $("edLabColor").value = /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#2ee6e6"; $("edLabDesc").value = l.description || ""; $("edLabSave").textContent = "Save changes"; $("edLabName").focus(); }),
          btn("Delete", () => { if (n || p) return alert("Delete or move this lab's experiments and papers first."); if (confirm("Delete this lab?")) save("labs", list("labs").filter(x => x.id !== l.id)); }, "danger"))));
    });
  }
  function fillLabSelects() {
    [["edExpLab", false], ["edPaperLab", false], ["edFilterLab", true]].forEach(([id, all]) => {
      const s = $(id), cur = s.value; s.replaceChildren(); if (all) s.append(make("option", { value: "all", text: "all labs" })); else if (!list("labs").length) s.append(make("option", { value: "", text: "Create a lab first" }));
      list("labs").forEach(l => s.append(make("option", { value: l.id, text: (l.emoji || "🔬") + " " + l.name }))); s.value = list("labs").some(l => l.id === cur) || (all && cur === "all") ? cur : (all ? "all" : (list("labs")[0] || {}).id || "");
    });
  }

  /* ---------- parameter editor ---------- */
  const PFIELDS = [["key", "key", "text"], ["label", "label shown", "text"], ["unit", "unit", "text"], ["min", "min", "number"], ["max", "max", "number"], ["step", "step", "number"], ["default", "start", "number"]];
  function addParamRow(p = {}) {
    const row = make("div", { class: "lb-prm" });
    PFIELDS.forEach(([k, ph, type]) => { const i = make("input", { type: type === "number" ? "number" : "text", placeholder: ph, "aria-label": ph, "data-k": k }); if (type === "number") i.step = "any"; if (p[k] !== undefined) i.value = p[k]; i.addEventListener("input", rebuildSliders); row.append(i); });
    row.append(btn("✕", () => { row.remove(); rebuildSliders(); }, "ed-mini danger")); $("edParams").append(row); return row;
  }
  function collectParams() { return [...$("edParams").children].map(r => { const o = {}; r.querySelectorAll("input").forEach(i => { o[i.dataset.k] = i.value; }); return o; }); }
  function cleanParams(raw) { return raw.filter(p => String(p.key).trim()).map(p => ({ key: String(p.key).trim(), label: str(String(p.label || p.key), 60), unit: str(String(p.unit || ""), 16), min: num(p.min, 0), max: num(p.max, 100), step: num(p.step, 1) || 1, default: num(p.default, num(p.min, 0)) })); }
  $("edAddParam").addEventListener("click", () => { addParamRow({ min: 0, max: 100, step: 1, default: 10 }); rebuildSliders(); });
  const sliderVals = {};
  function rebuildSliders() {
    const root = $("edSliders"); root.replaceChildren(); const ps = cleanParams(collectParams());
    if (!ps.length) root.append(make("p", { class: "ed-muted", text: "No parameters. Add one to get a slider." }));
    ps.forEach(p => {
      if (!(p.key in sliderVals) || sliderVals[p.key] < p.min || sliderVals[p.key] > p.max) sliderVals[p.key] = p.default;
      const r = make("input", { type: "range", min: p.min, max: p.max, step: p.step, "aria-label": p.label }); r.value = sliderVals[p.key]; const o = make("output", { text: String(sliderVals[p.key]) });
      r.addEventListener("input", () => { sliderVals[p.key] = Number(r.value); o.textContent = r.value; }); root.append(make("div", { class: "lb-sl" }, make("span", { text: p.label + (p.unit ? " (" + p.unit + ")" : "") }), r, o));
    });
  }

  /* ---------- templates ---------- */
  const TEMPLATES = {
    blank: `// params.x is the slider with key "x".\nconst xs = Lab.linspace(0, 10, 100);\nreturn {\n  charts: [{ title: "My first chart", xLabel: "x", yLabel: "y", series: [{ name: "y = x²", x: xs, y: xs.map(v => v * v) }] }],\n  metrics: { top: { label: "Largest y", value: 100, unit: "" } }\n};`,
    ode: `// Simulate any system of differential equations with Lab.rk4.\n// y = [position, velocity]; f returns [dy0/dt, dy1/dt].\nconst f = (t, y) => [y[1], -4 * y[0] - 0.2 * y[1]];\nconst sim = Lab.rk4(f, [1, 0], 0, 20, 0.01, 5);\nreturn {\n  charts: [{ title: "Damped oscillator", xLabel: "Time (s)", yLabel: "Position", series: [{ name: "x(t)", x: sim.t, y: Lab.column(sim.y, 0) }] }],\n  metrics: { final: { label: "Final position", value: Lab.round(sim.y[sim.y.length - 1][0], 4), unit: "m" } }\n};`,
    mc: `// Monte Carlo: estimate pi with random points. Lab.rng(seed) makes runs repeatable.\nconst r = Lab.rng(42), n = 5000; let inside = 0; const est = [], idx = [];\nfor (let i = 1; i <= n; i++) { const x = r(), y = r(); if (x * x + y * y <= 1) inside++; if (i % 50 === 0) { idx.push(i); est.push(4 * inside / i); } }\nreturn {\n  charts: [{ title: "Estimate of π", xLabel: "Random points", yLabel: "Estimate", series: [{ name: "estimate", x: idx, y: est }, { name: "π", x: [0, n], y: [Math.PI, Math.PI] }] }],\n  metrics: { pi: { label: "Final estimate", value: 4 * inside / n, unit: "" } }\n};`,
    curve: `// Plot a function with a slider parameter named "a".\nconst a = params.a === undefined ? 1 : params.a, xs = Lab.linspace(-10, 10, 200);\nreturn { charts: [{ title: "y = a·sin(x)", xLabel: "x", yLabel: "y", series: [{ name: "a = " + a, x: xs, y: xs.map(x => a * Math.sin(x)) }] }] };`
  };
  $("edTemplate").addEventListener("change", e => { const t = TEMPLATES[e.target.value]; if (t && (!$("edExpScript").value.trim() || confirm("Replace the current script with this template?"))) $("edExpScript").value = t; e.target.value = ""; });
  // The script editor: line numbers, colours, live error check, autocomplete, snippets, find & replace, settings.
  const coder = window.RPLabsCoder ? window.RPLabsCoder.attach($("edExpScript"), { getParamKeys: () => cleanParams(collectParams()).map(p => p.key), onRun: () => testRun() }) : null;

  /* ---------- result rendering (shared by test run and verification) ---------- */
  function renderResult(root, res, withCanvas) {
    root.replaceChildren();
    if (!res.ok) { root.append(make("div", { class: "lb-err", text: res.error })); return; }
    const r = res.result;
    if (r.metrics.length) root.append(make("div", { class: "lb-metrics" }, ...r.metrics.map(m => make("div", { class: "lb-m" }, make("span", { text: m.label }), make("strong", { text: window.RPLabs.formatValue(m) })))));
    r.charts.forEach(c => { const cv = make("canvas", { class: "lb-canvas", role: "img", "aria-label": c.title || "chart" }); root.append(cv); window.RPLabs.drawChart(cv, c); });
    if (r.table) { const t = make("table", { class: "lb-table" }); t.append(make("tr", {}, ...r.table.columns.map(c => make("th", { text: c })))); r.table.rows.slice(0, 8).forEach(row => t.append(make("tr", {}, ...row.map(v => make("td", { text: v == null ? "" : String(v) }))))); root.append(t); }
    if (r.notes) root.append(make("p", { class: "ed-muted", text: r.notes }));
  }
  let running = false;
  async function testRun() {
    if (running) return; running = true; $("edTestRun").disabled = true; $("edRunInfo").textContent = "Running…"; const t0 = performance.now();
    const res = await window.RPLabs.run($("edExpScript").value, { ...sliderVals }, { timeoutMs: timeoutMs() }); running = false; $("edTestRun").disabled = false;
    $("edRunInfo").textContent = res.ok ? "Finished in " + Math.round(performance.now() - t0) + " ms" : "Failed"; renderResult($("edRunOut"), res);
  }
  $("edTestRun").addEventListener("click", testRun);

  /* ---------- experiments ---------- */
  function resetExp() {
    $("edExpForm").reset(); $("edExpId").value = ""; $("edParams").replaceChildren(); $("edExpScript").value = ""; $("edRunOut").replaceChildren(); $("edRunInfo").textContent = ""; Object.keys(sliderVals).forEach(k => delete sliderVals[k]);
    $("edExpSave").textContent = "Add experiment"; say("edExpMsg", ""); rebuildSliders(); setTests([]); if ($("edTestList")) $("edTestList").replaceChildren(); if ($("edTestInfo")) $("edTestInfo").textContent = "";
  }
  function readGoal() { const op = $("edGoalOp").value, metric = $("edGoalMetric").value.trim(); return op && metric ? { metric, op, value: num($("edGoalV").value, 0), value2: num($("edGoalV2").value, 0), text: $("edGoalText").value.trim() } : null; }
  $("edExpForm").addEventListener("submit", e => {
    e.preventDefault(); const title = $("edExpTitle").value.trim(); if (!title) return say("edExpMsg", "Enter a title.", true); if (!$("edExpLab").value) return say("edExpMsg", "Create a lab first.", true);
    if (!$("edExpScript").value.trim()) return say("edExpMsg", "Write a script (or insert a template).", true);
    const raw = collectParams(), keys = raw.map(p => String(p.key).trim()).filter(Boolean), bad = keys.find(k => !KEY_RE.test(k));
    if (bad) return say("edExpMsg", "Parameter key “" + bad + "” must be letters, digits or underscore and start with a letter.", true); if (new Set(keys).size !== keys.length) return say("edExpMsg", "Parameter keys must be unique.", true);
    if (keys.length > 12) return say("edExpMsg", "At most 12 parameters.", true);
    const params = cleanParams(raw); const badRange = params.find(p => !(p.min < p.max) || p.default < p.min || p.default > p.max); if (badRange) return say("edExpMsg", "Parameter “" + badRange.key + "” needs min < max and a start value inside that range.", true);
    const id = $("edExpId").value || newId("exp"), item = { id, lab: $("edExpLab").value, title, difficulty: $("edExpDiff").value, minutes: Math.min(240, Math.max(1, Math.round(num($("edExpMin").value, 5)))), status: $("edExpStatus").value, summary: $("edExpSummary").value.trim(), hypothesis: $("edExpHyp").value.trim(), theory: $("edExpTheory").value, safety: $("edExpSafety").value.trim(), goal: readGoal(), params, tests: collectTests(), script: $("edExpScript").value };
    const all = list("exps"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.push(item);
    if (save("exps", all)) { resetExp(); say("edExpMsg", "Experiment saved. Open the Publish tab to send it live."); }
  });
  $("edExpReset").addEventListener("click", resetExp);
  function loadExp(x) {
    resetExp(); $("edExpId").value = x.id; $("edExpTitle").value = x.title; $("edExpLab").value = x.lab; $("edExpDiff").value = x.difficulty || "intro"; $("edExpMin").value = x.minutes || 5; $("edExpStatus").value = x.status || "published";
    $("edExpSummary").value = x.summary || ""; $("edExpHyp").value = x.hypothesis || ""; $("edExpTheory").value = x.theory || ""; $("edExpSafety").value = x.safety || ""; $("edExpScript").value = x.script || "";
    (x.params || []).forEach(p => addParamRow(p)); setTests(x.tests); const g = x.goal || {}; $("edGoalOp").value = g.op || ""; $("edGoalMetric").value = g.metric || ""; $("edGoalV").value = g.value ?? ""; $("edGoalV2").value = g.value2 ?? ""; $("edGoalText").value = g.text || "";
    rebuildSliders(); $("edExpSave").textContent = "Save changes"; $("edExpTitle").scrollIntoView({ block: "center" }); $("edExpTitle").focus();
  }
  function renderExpList() {
    const root = $("edExpList"), f = $("edFilterLab").value; root.replaceChildren(); const all = list("exps").filter(x => f === "all" || x.lab === f);
    if (!all.length) { root.append(make("p", { class: "ed-empty", text: "No experiments here yet." })); return; }
    all.forEach(x => {
      const draft = x.status === "draft", t = make("strong", { text: x.title });
      t.append(make("span", { class: "ed-badge" + (draft ? " draft" : ""), text: draft ? "Draft" : "Published" }), make("span", { class: "ed-badge", text: x.difficulty || "intro" }));
      root.append(make("article", { class: "ed-row" }, make("div", {}, t, make("span", { class: "meta", text: [labName(x.lab), (x.params || []).length + " parameter(s)", (x.minutes || 5) + " min", x.summary].filter(Boolean).join(" · ") })),
        make("div", { class: "acts" }, btn("Edit", () => loadExp(x)), btn(draft ? "Publish" : "Make draft", () => save("exps", list("exps").map(y => y.id === x.id ? { ...y, status: draft ? "published" : "draft" } : y))),
          btn("Duplicate", () => save("exps", [...list("exps"), { ...JSON.parse(JSON.stringify(x)), id: newId("exp"), title: x.title + " (copy)", status: "draft" }])),
          btn("Delete", () => { const used = list("papers").some(p => p.figure && p.figure.experiment === x.id); if (used) return alert("A paper reproduces this experiment. Change that paper first."); if (confirm("Delete this experiment?")) save("exps", list("exps").filter(y => y.id !== x.id)); }, "danger"))));
    });
  }
  $("edFilterLab").addEventListener("change", renderExpList);

  /* ---------- papers ---------- */
  function addRefRow(r = {}) {
    const row = make("div", { class: "ed-res" }), t = make("input", { type: "text", placeholder: "Title or citation", maxlength: 200, "data-k": "title" }), u = make("input", { type: "url", placeholder: "https:// link (optional)", maxlength: 500, "data-k": "url" });
    t.value = r.title || ""; u.value = r.url || ""; row.append(t, u, btn("✕", () => row.remove(), "ed-mini danger")); row.style.gridTemplateColumns = "1.4fr 1fr auto"; $("edRefs").append(row);
  }
  $("edAddRef").addEventListener("click", () => addRefRow());
  let figVals = {};
  function fillFigExps(selected) {
    const s = $("edFigExp"); s.replaceChildren(make("option", { value: "", text: "No figure" })); list("exps").forEach(x => s.append(make("option", { value: x.id, text: x.title }))); s.value = list("exps").some(x => x.id === selected) ? selected : "";
  }
  function buildFigParams(values) {
    const root = $("edFigParams"); root.replaceChildren(); const x = list("exps").find(y => y.id === $("edFigExp").value); figVals = {}; if (!x) return;
    (x.params || []).forEach(p => { const v = values && p.key in values ? values[p.key] : p.default; figVals[p.key] = v; const r = make("input", { type: "range", min: p.min, max: p.max, step: p.step, "aria-label": p.label }); r.value = v; const o = make("output", { text: String(v) }); r.addEventListener("input", () => { figVals[p.key] = Number(r.value); o.textContent = r.value; }); root.append(make("div", { class: "lb-sl" }, make("span", { text: p.label }), r, o)); });
  }
  $("edFigExp").addEventListener("change", () => buildFigParams());
  function resetPaper() { $("edPaperForm").reset(); $("edPaperId").value = ""; $("edRefs").replaceChildren(); fillFigExps(""); buildFigParams(); $("edPaperSave").textContent = "Add paper"; say("edPaperMsg", ""); }
  $("edPaperForm").addEventListener("submit", e => {
    e.preventDefault(); const title = $("edPaperTitle").value.trim(); if (!title) return say("edPaperMsg", "Enter a title.", true); if (!$("edPaperLab").value) return say("edPaperMsg", "Create a lab first.", true);
    const refs = [...$("edRefs").children].map(r => ({ title: r.querySelector("[data-k=title]").value.trim(), url: r.querySelector("[data-k=url]").value.trim() })).filter(r => r.title);
    if (refs.some(r => r.url && !httpsUrl(r.url))) return say("edPaperMsg", "Reference links must start with https://", true);
    const id = $("edPaperId").value || newId("paper"), fe = $("edFigExp").value;
    const item = { id, lab: $("edPaperLab").value, title, authors: $("edPaperAuthors").value.trim(), status: $("edPaperStatus").value, abstract: $("edPaperAbs").value.trim(), body: $("edPaperBody").value, figure: fe ? { experiment: fe, params: { ...figVals }, caption: $("edFigCaption").value.trim() } : null, references: refs.map(r => ({ title: r.title, url: httpsUrl(r.url) })) };
    const all = list("papers"), i = all.findIndex(x => x.id === id); if (i >= 0) all[i] = item; else all.push(item);
    if (save("papers", all)) { resetPaper(); say("edPaperMsg", "Paper saved. Open the Publish tab to send it live."); }
  });
  $("edPaperReset").addEventListener("click", resetPaper);
  function renderPaperList() {
    const root = $("edPaperList"); root.replaceChildren(); if (!list("papers").length) { root.append(make("p", { class: "ed-empty", text: "No papers yet." })); return; }
    list("papers").forEach(p => {
      const draft = p.status === "draft", t = make("strong", { text: p.title }); t.append(make("span", { class: "ed-badge" + (draft ? " draft" : ""), text: draft ? "Draft" : "Published" }));
      root.append(make("article", { class: "ed-row" }, make("div", {}, t, make("span", { class: "meta", text: [labName(p.lab), p.authors, p.figure ? "has reproducible figure" : ""].filter(Boolean).join(" · ") })),
        make("div", { class: "acts" }, btn("Edit", () => { resetPaper(); $("edPaperId").value = p.id; $("edPaperTitle").value = p.title; $("edPaperLab").value = p.lab; $("edPaperAuthors").value = p.authors || ""; $("edPaperStatus").value = p.status || "published"; $("edPaperAbs").value = p.abstract || ""; $("edPaperBody").value = p.body || "";
          fillFigExps(p.figure && p.figure.experiment); buildFigParams(p.figure && p.figure.params); $("edFigCaption").value = (p.figure && p.figure.caption) || ""; (p.references || []).forEach(addRefRow); $("edPaperSave").textContent = "Save changes"; $("edPaperTitle").scrollIntoView({ block: "center" }); $("edPaperTitle").focus(); }),
          btn(draft ? "Publish" : "Make draft", () => save("papers", list("papers").map(y => y.id === p.id ? { ...y, status: draft ? "published" : "draft" } : y))),
          btn("Delete", () => { if (confirm("Delete this paper?")) save("papers", list("papers").filter(y => y.id !== p.id)); }, "danger"))));
    });
  }

  /* ---------- validation + snapshot ---------- */
  const verify = {}; // experiment id -> {ok, error, script}
  function problems() {
    const out = [], warn = [], labs = list("labs"), lset = new Set(labs.map(l => l.id)), exps = list("exps").filter(x => x.status !== "draft"), eset = new Set(exps.map(x => x.id));
    exps.forEach(x => { const t = "“" + x.title + "”";
      if (!lset.has(x.lab)) out.push(t + " belongs to a lab that no longer exists."); if (!String(x.script || "").trim()) out.push(t + " has no script."); else { const lr = window.RPLabs.lint(x.script); if (!lr.ok) out.push(t + " has a syntax error: " + lr.error); }
      if ((x.params || []).length > 12) out.push(t + " has more than 12 parameters.");
      const v = verify[x.id]; if (v && v.script === x.script && !v.ok) out.push(t + " failed its test run: " + v.error.split("\n")[0]);
      if (x.goal && v && v.script === x.script && v.ok && !v.keys.includes(x.goal.metric)) warn.push(t + ": the goal uses metric “" + x.goal.metric + "” which the script does not return.");
      if (!x.summary) warn.push(t + " has no summary."); if (!x.hypothesis) warn.push(t + " has no hypothesis."); });
    list("papers").filter(p => p.status !== "draft").forEach(p => { const t = "Paper “" + p.title + "”"; if (!lset.has(p.lab)) out.push(t + " belongs to a lab that no longer exists."); if (p.figure && p.figure.experiment && !eset.has(p.figure.experiment)) out.push(t + " reproduces an experiment that is not published."); if (!p.abstract) warn.push(t + " has no abstract."); });
    labs.forEach(l => { if (!list("exps").some(x => x.lab === l.id && x.status !== "draft")) warn.push("Lab “" + l.name + "” has no published experiments."); });
    return { out, warn };
  }
  function buildSnapshot() {
    const lset = new Set(list("labs").map(l => l.id)), pub = list("exps").filter(x => x.status !== "draft" && lset.has(x.lab) && x.title), eset = new Set(pub.map(x => x.id));
    return { schema: 2,
      labs: list("labs").map(l => ({ id: str(l.id, 80), name: str(l.name, 80), emoji: str(l.emoji, 8) || "🔬", color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#2ee6e6", description: str(l.description, 300) })),
      experiments: pub.map(x => ({ id: str(x.id, 80), lab: str(x.lab, 80), title: str(x.title, 120), difficulty: ["intro", "intermediate", "advanced"].includes(x.difficulty) ? x.difficulty : "intro", minutes: Math.round(num(x.minutes, 5)), summary: str(x.summary, 200), hypothesis: str(x.hypothesis, 500), theory: str(x.theory, 8000), safety: str(x.safety, 300),
        goal: x.goal && x.goal.metric && x.goal.op ? { metric: str(x.goal.metric, 40), op: x.goal.op, value: num(x.goal.value, 0), value2: num(x.goal.value2, 0), text: str(x.goal.text, 160) } : null,
        params: cleanParams(x.params || []), tests: cleanTests(x.tests), script: String(x.script || "") })),
      papers: list("papers").filter(p => p.status !== "draft" && lset.has(p.lab) && p.title).map(p => ({ id: str(p.id, 80), lab: str(p.lab, 80), title: str(p.title, 160), authors: str(p.authors, 160), status: "published", abstract: str(p.abstract, 1200), body: str(p.body, 40000),
        figure: p.figure && eset.has(p.figure.experiment) ? { experiment: p.figure.experiment, params: p.figure.params || {}, caption: str(p.figure.caption, 240) } : null,
        references: (p.references || []).map(r => ({ title: str(r.title, 200), url: httpsUrl(r.url) })) })) };
  }

  /* ---------- verification ---------- */
  let verifying = false;
  async function verifyAll() {
    if (verifying) return false; verifying = true; $("pubVerify").disabled = true; const exps = list("exps").filter(x => x.status !== "draft"); let bad = 0;
    for (let i = 0; i < exps.length; i++) { const x = exps[i]; $("pubVerifyInfo").textContent = "Testing " + (i + 1) + " of " + exps.length + "…"; const params = {}; (x.params || []).forEach(p => { params[p.key] = num(p.default, 0); });
      const T = window.RPLabsTests; let res, failMsg = "";
      if (T) { const out = await T.suite(x, { mode: "quick", timeoutMs: timeoutMs() }); res = out.defaultRun || { ok: false, error: "No result" }; if (out.failed) failMsg = out.firstFailure; }
      else res = await window.RPLabs.run(x.script, params, { timeoutMs: timeoutMs() });
      const ok = res.ok && !failMsg; verify[x.id] = { ok, error: ok ? "" : (failMsg || res.error), script: x.script, tests: JSON.stringify(x.tests || []), keys: res.ok ? res.result.metrics.map(m => m.key) : [], result: res.ok ? res.result : null }; if (!ok) bad++; }
    verifying = false; $("pubVerify").disabled = false; $("pubVerifyInfo").textContent = bad ? bad + " failed" : "All " + exps.length + " passed"; renderPublish(); return bad === 0;
  }
  $("pubVerify").addEventListener("click", verifyAll);

  /* ---------- dashboard ---------- */
  function renderDashboard() {
    const exps = list("exps"), live = exps.filter(x => x.status !== "draft"), papers = list("papers").filter(p => p.status !== "draft");
    const tiles = [["Labs", String(list("labs").length), "labs"], ["Experiments", live.length + " / " + exps.length, "experiments"], ["Papers", papers.length + " / " + list("papers").length, "papers"], ["Live version", liveSnap ? "v" + liveSnap.version : "—", "publish"]];
    $("edTiles").replaceChildren(...tiles.map(([l, v, view]) => { const b = make("button", { type: "button", class: "ed-tile" }, make("span", { text: l }), make("strong", { text: v })); b.addEventListener("click", () => showView(view)); return b; }));
    const steps = [["Create a lab", list("labs").length > 0], ["Script an experiment", live.length > 0], ["Set a goal on an experiment", live.some(x => x.goal)], ["Write a paper", papers.length > 0], ["Publish to everyone", !!liveSnap], ["Everything is in sync", !!liveSnap && inSync()]];
    $("edChecklist").replaceChildren(...steps.map(([l, d]) => make("li", { class: d ? "done" : "" }, make("span", { class: "tick", text: d ? "✓" : "○" }), make("span", { text: l }))));
  }
  $("edStarter").addEventListener("click", () => {
    const S = window.RPLabsStarter, have = k => new Set(list(k).map(x => x.id)); let added = 0;
    const labs = list("labs"), hl = have("labs"); S.labs.forEach(l => { if (!hl.has(l.id)) { labs.push({ ...l }); added++; } });
    const exps = list("exps"), he = have("exps"); S.experiments.forEach(x => { if (!he.has(x.id)) { exps.push({ ...JSON.parse(JSON.stringify(x)), status: "published" }); added++; } });
    const papers = list("papers"), hp = have("papers"); S.papers.forEach(p => { if (!hp.has(p.id)) { papers.push(JSON.parse(JSON.stringify(p))); added++; } });
    save("labs", labs); save("exps", exps); save("papers", papers); $("edStarterMsg").textContent = added ? "Imported " + added + " item(s). Open the Experiment studio to explore them." : "The starter pack is already imported.";
  });
  $("edExport").addEventListener("click", () => { window.RPLabs.download("rp-labs-drafts.json", JSON.stringify({ app: "rp-labs-employee", exportedAt: new Date().toISOString(), labs: list("labs"), exps: list("exps"), papers: list("papers") }, null, 2), "application/json"); $("edBackupMsg").textContent = "Backup downloaded."; });
  $("edImport").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d || d.app !== "rp-labs-employee") throw new Error("This is not a Labs workspace backup."); if (!confirm("Replace your current drafts with this backup?")) return;
      localStorage.setItem(K.labs, JSON.stringify(Array.isArray(d.labs) ? d.labs : [])); localStorage.setItem(K.exps, JSON.stringify(Array.isArray(d.exps) ? d.exps : [])); localStorage.setItem(K.papers, JSON.stringify(Array.isArray(d.papers) ? d.papers : [])); refreshAll(); $("edBackupMsg").textContent = "Backup restored."; }
    catch (err) { $("edBackupMsg").textContent = "Could not restore: " + err.message; } e.target.value = "";
  });

  /* ---------- publish ---------- */
  let sb = null, account = { state: "checking" }, liveSnap = null, liveError = "", publishing = false;
  function client() { if (sb) return sb; if (location.protocol === "file:" || !window.supabase || !window.supabase.createClient) return null; sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }); return sb; }
  const SECTIONS = [["labs", "Labs"], ["experiments", "Experiments"], ["papers", "Papers"]];
  const noScript = list => list.map(x => { if (x && typeof x === "object" && "script" in x) { const { script, tests, ...rest } = x; return rest; } return x; });
  const sectionState = (local, remote) => SECTIONS.map(([key, label]) => { const a = noScript(local[key]), b = remote ? noScript(remote[key] || []) : null; return { label, count: a.length, liveCount: b ? b.length : 0, same: remote ? stable(a) === stable(b) : false }; });
  const inSync = () => !!(liveSnap && liveSnap.snapshot && sectionState(buildSnapshot(), liveSnap.snapshot).every(r => r.same));
  function setChip(t, c) { const n = $("edPubChip"); n.textContent = t; n.className = "ed-chip " + (c || ""); }
  function updateChip() { if (liveError && !liveSnap) setChip("Live site unreachable", "bad"); else if (!liveSnap) setChip("Not published yet", "warn"); else if (inSync()) setChip("● Live site in sync (v" + liveSnap.version + ")", "ok"); else setChip("● Unpublished changes", "warn"); if (!$("edPublish").hidden) renderPublish(); }
  async function fetchLive() {
    try { const r = await fetch(SB_URL + "/rest/v1/rp_labs_publications?select=version,published_at,snapshot&order=version.desc&limit=1", { headers: { apikey: SB_KEY, Accept: "application/json" }, cache: "no-store" }); if (!r.ok) throw new Error(r.status === 404 ? "setup" : "HTTP " + r.status); const rows = await r.json(); liveSnap = rows.length ? rows[0] : null; liveError = ""; }
    catch (e) { liveError = e.message || "failed"; } updateChip(); renderDashboard();
  }
  async function loadAccount() {
    const c = client(); if (!c) { account = { state: location.protocol === "file:" ? "file" : "nolib" }; return; }
    try { const { data: { session } } = await c.auth.getSession(); if (!session) { account = { state: "signedout" }; return; } const { data, error } = await c.rpc("rp_get_account_context"); if (error) { account = { state: "error", message: error.message }; return; } const roles = Array.isArray(data.roles) ? data.roles : []; account = { state: roles.some(r => EDITOR_ROLES.includes(r)) && data.status === "active" ? "editor" : "noaccess", username: data.username, roles, status: data.status }; }
    catch (e) { account = { state: "error", message: e.message }; }
  }
  async function loadHistory() {
    const root = $("pubHistory"); root.replaceChildren(); if (account.state !== "editor") { root.append(make("li", { class: "ed-muted", text: "Sign in as a Labs employee to see history." })); return; }
    const { data, error } = await client().from("rp_labs_publications").select("version,published_at,note").order("version", { ascending: false }).limit(10);
    if (error || !data) { root.append(make("li", { class: "ed-muted", text: "History is unavailable." })); return; } if (!data.length) { root.append(make("li", { class: "ed-muted", text: "Nothing published yet." })); return; }
    data.forEach(row => root.append(make("li", {}, make("span", { text: "v" + row.version + (row.note ? " · " + row.note : "") }), make("time", { text: when(row.published_at) }), liveSnap && row.version === liveSnap.version ? make("span", { class: "ed-muted", text: "live" }) : btn("Restore", () => republish(row.version)))));
  }
  function explain(error) {
    const m = (error && error.message) || String(error);
    if (/rp_publish_labs|rp_republish_labs|rp_labs_publications|schema cache|does not exist/i.test(m) && !/lab that|experiment "/i.test(m)) return "The shared database is not set up yet. Run labs-content.sql with npm run migrate in the server folder, then try again.";
    if (/role required/i.test(m)) return "Your account does not have the Labs employee role."; if (/JWT|not authenticated|permission denied/i.test(m)) return "Your sign-in expired. Sign in again on the main page."; return m;
  }
  function renderPublish() {
    const box = $("pubAccount"); box.className = "ed-note"; box.replaceChildren();
    switch (account.state) {
      case "editor": box.className = "ed-note ok"; box.append("Signed in as " + account.username + ". You can publish."); break;
      case "signedout": box.className = "ed-note bad"; box.append(make("a", { href: "../index/index.html", text: "Sign in on the main page" }), " with your employee account, then come back and press Check live version."); break;
      case "noaccess": box.className = "ed-note bad"; box.append("Signed in as " + account.username + ", but this account has no Labs employee role (" + ((account.roles || []).join(", ") || "none") + "). Ask the Creator to assign one."); break;
      case "file": box.className = "ed-note bad"; box.append("Open this page through your website address or localhost. Publishing cannot run from a file:// page."); break;
      case "nolib": box.className = "ed-note bad"; box.append("The sign-in library could not load. Check your connection and reload."); break;
      case "error": box.className = "ed-note bad"; box.append("Could not check your account: " + account.message); break; default: box.append("Checking your sign-in…");
    }
    const p = problems(), pr = $("pubProblems"); pr.replaceChildren();
    if (p.out.length) pr.append(make("div", { class: "ed-problems" }, make("strong", { text: "Fix these before publishing:" }), make("ul", {}, ...p.out.slice(0, 12).map(t => make("li", { text: t })))));
    if (p.warn.length) pr.append(make("div", { class: "ed-warn" }, make("strong", { text: "Worth a look:" }), make("ul", {}, ...p.warn.slice(0, 8).map(t => make("li", { text: t })))));
    const local = buildSnapshot(), rows = sectionState(local, liveSnap ? liveSnap.snapshot : null);
    $("pubSummary").replaceChildren(...rows.map(r => make("li", {}, make("span", { text: r.label + ": " + r.count + (liveSnap && r.liveCount !== r.count ? " (live: " + r.liveCount + ")" : "") }), make("span", { class: "tag " + (r.same ? "same" : "changed"), text: r.same ? "Up to date" : (liveSnap ? "Changed" : "New") }))));
    $("pubVerifyList").replaceChildren(...list("exps").filter(x => x.status !== "draft" && verify[x.id] && verify[x.id].script === x.script).map(x => { const v = verify[x.id]; return make("li", {}, make("span", { text: x.title }), make("span", { class: v.ok ? "lb-ok" : "lb-bad", text: v.ok ? "✓ runs" : "✕ " + v.error.split("\n")[0].slice(0, 80) })); }));
    const bytes = new Blob([JSON.stringify(local)]).size; $("pubSize").textContent = bytes > 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
    const same = liveSnap && inSync(); $("pubPublish").disabled = account.state !== "editor" || publishing || verifying || p.out.length > 0; $("pubPublish").textContent = publishing ? "Publishing…" : same ? "Publish again" : "Publish to everyone";
    $("pubLive").textContent = liveError && !liveSnap ? (liveError === "setup" ? "The shared database is not set up yet (run labs-content.sql)." : "Could not reach the live site (" + liveError + ").") : liveSnap ? "Version " + liveSnap.version + ", published " + when(liveSnap.published_at) + ". " + (same ? "Your drafts match it." : "Your drafts differ from it.") : "Nothing has been published yet.";
  }
  async function publish() {
    if (publishing || account.state !== "editor" || problems().out.length) return;
    say("pubMessage", "Test-running every experiment…"); if (!(await verifyAll())) return say("pubMessage", "Some experiments failed their test run. Fix them first.", true);
    const snap = buildSnapshot(), bytes = new Blob([JSON.stringify(snap)]).size; if (bytes > 18 * 1048576) return say("pubMessage", "Too large to publish in one go (over 18 MB). Publish fewer experiments at a time.", true);
    if (!confirm("Publish to everyone?\n\n" + snap.labs.length + " lab(s), " + snap.experiments.length + " experiment(s) and " + snap.papers.length + " paper(s) will be visible on every device.")) return say("pubMessage", "");
    publishing = true; renderPublish(); say("pubMessage", "Publishing…");
    const { data, error } = await client().rpc("rp_publish_labs", { p_snapshot: snap, p_note: $("pubNote").value.trim() }); publishing = false;
    if (error) { say("pubMessage", explain(error), true); renderPublish(); return; }
    $("pubNote").value = ""; say("pubMessage", "Published as version " + data + ". Training the starting results…");
    const trained = await trainDefaults(snap); say("pubMessage", "Published as version " + data + ". Visitors will see it within about a minute." + (trained.n ? " Trained " + trained.n + " starting result(s)." : "") + (trained.error ? " Could not train some results: " + trained.error : "")); await fetchLive(); loadHistory();
  }
  /* Visitors only get results that were trained. Every published experiment is trained at its start values, and every paper figure at its figure values. */
  async function trainDefaults(snap) {
    const L = window.RPLabs, items = []; let error = "";
    try {
      for (const x of snap.experiments) {
        const v = verify[x.id], defs = {}; (x.params || []).forEach(p => { defs[p.key] = p.default; });
        let result = v && v.script === (list("exps").find(y => y.id === x.id) || {}).script && v.result ? v.result : null;
        if (!result) { const r = await L.run((list("exps").find(y => y.id === x.id) || {}).script, defs, { timeoutMs: timeoutMs() }); if (r.ok) result = r.result; }
        if (result) items.push({ kind: "exp", key: L.expKey(x, defs), data: result });
      }
      for (const p of snap.papers) {
        if (!p.figure) continue; const x = snap.experiments.find(y => y.id === p.figure.experiment), src = list("exps").find(y => y.id === p.figure.experiment); if (!x || !src) continue;
        const params = { ...Object.fromEntries((x.params || []).map(q => [q.key, q.default])), ...(p.figure.params || {}) }, key = L.expKey(x, params); if (items.some(i => i.key === key)) continue;
        const r = await L.run(src.script, params, { timeoutMs: timeoutMs() }); if (r.ok) items.push({ kind: "exp", key, data: r.result });
      }
      for (let i = 0; i < items.length; i += 25) { const { error: e } = await client().rpc("rp_labs_train_many", { p_items: items.slice(i, i + 25) }); if (e) throw e; }
    } catch (e) { error = e.message || String(e); }
    return { n: error ? 0 : items.length, error };
  }
  async function republish(version) {
    if (!confirm("Make version " + version + " the live version again?")) return;
    const { data, error } = await client().rpc("rp_republish_labs", { p_version: version }); if (error) return say("pubMessage", explain(error), true);
    say("pubMessage", "Version " + version + " is live again (as version " + data + ")."); await fetchLive(); loadHistory();
  }
  async function refreshPublish() { say("pubMessage", ""); await loadAccount(); await fetchLive(); renderPublish(); loadHistory(); }
  $("pubPublish").addEventListener("click", publish); $("pubRefresh").addEventListener("click", refreshPublish); $("edPubChip").addEventListener("click", () => showView("publish"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPublish(); });

  function refreshAll() { fillLabSelects(); fillFigExps($("edFigExp").value); renderLabList(); renderExpList(); renderPaperList(); renderDashboard(); updateChip(); }
  /* tests stored with each experiment (custom checks); the editor for them lives in labs-employee-extra.js */
  let testsApi = { collect: () => [], set: () => {} };
  const collectTests = () => testsApi.collect(), setTests = t => testsApi.set(t);
  const cleanTests = t => (Array.isArray(t) ? t : []).slice(0, 50).map(a => ({ at: ["defaults", "min", "max", "current"].includes(a.at) ? a.at : "defaults", metric: str(String(a.metric || ""), 40), op: [">=", "<=", "between", "approx", "returns"].includes(a.op) ? a.op : ">=", value: num(a.value, 0), value2: num(a.value2, 0) })).filter(a => a.metric);
  window.RPLabsEd = { $, list, save, make, btn, say, when, str, num, stable, cleanParams, collectParams, sliderVals, showView, onShow, coder, buildSnapshot, timeoutMs, client, setTestsApi: api => { testsApi = api; }, getAccount: () => account, setSettings: v => { labSettings = v; if (window.RPLabs) window.RPLabs.LIMITS.timeoutMs = timeoutMs(); }, explain, renderResult, testRun, expKey: (x, p) => window.RPLabs.expKey(x, p) };
  resetLab(); refreshAll(); resetExp(); resetPaper(); showView(/^#(inbox|training|settings|publish)$/.test(location.hash) ? location.hash.slice(1) : "dashboard"); refreshPublish();
})();

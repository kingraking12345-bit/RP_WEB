/* RP Labs workbench, part 2: test suite, Inbox, Training library, Settings. Loaded after labs-employee.js. */
(() => {
  "use strict";
  const E = window.RPLabsEd, L = window.RPLabs, S = window.RPLabsServer; if (!E || !L || !S) return;
  const { $, make, btn, say, when, num, stable } = E;
  const rpc = (fn, args) => S.rpc(fn, args);

  /* ====================== TEST SUITE ====================== */
  const defaultsOf = x => Object.fromEntries((x.params || []).map(p => [p.key, num(p.default, 0)]));
  const cornerOf = (x, which) => Object.fromEntries((x.params || []).map(p => [p.key, which === "min" ? num(p.min, 0) : num(p.max, 100)]));
  const midOf = x => Object.fromEntries((x.params || []).map(p => [p.key, (num(p.min, 0) + num(p.max, 100)) / 2]));
  function randomOf(x, seed) { let s = seed >>> 0 || 1; const r = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; return Object.fromEntries((x.params || []).map(p => { const min = num(p.min, 0), max = num(p.max, 100), st = num(p.step, 1) || 1; return [p.key, Math.min(max, min + Math.round(r() * (max - min) / st) * st)]; })); }
  const fmtParams = p => Object.entries(p).map(([k, v]) => k + "=" + (+Number(v).toPrecision(5))).join(", ") || "no sliders";
  const metricVal = (res, key) => { const m = res.result.metrics.find(q => q.key === key); return m ? m.value : undefined; };
  function checkAssertion(a, res) {
    if (!res.ok) return { ok: false, text: "the script failed: " + String(res.error).split("\n")[0] };
    const v = metricVal(res, a.metric);
    if (a.op === "returns") return v === undefined ? { ok: false, text: "metric “" + a.metric + "” was not returned" } : { ok: true, text: "returned " + v };
    if (typeof v !== "number") return { ok: false, text: v === undefined ? "metric “" + a.metric + "” was not returned" : "metric “" + a.metric + "” is not a number (" + v + ")" };
    const A = num(a.value, 0), B = num(a.value2, 0);
    const ok = a.op === ">=" ? v >= A : a.op === "<=" ? v <= A : a.op === "between" ? v >= Math.min(A, B) && v <= Math.max(A, B) : Math.abs(v - A) <= Math.max(1e-9, Math.abs(B) || Math.abs(A) * 0.01);
    return { ok, text: a.metric + " = " + +v.toPrecision(6) };
  }
  /* mode "quick": defaults + corners + your checks (used before publishing). mode "full": everything. */
  async function suite(x, opts) {
    opts = opts || {}; const full = opts.mode === "full", timeoutMs = opts.timeoutMs || 5000, rows = []; let defaultRun = null, firstFailure = "", runs = 0;
    const add = (name, ok, detail, warn) => { rows.push({ name, ok, warn: !!warn, detail: detail || "" }); if (!ok && !warn && !firstFailure) firstFailure = name + (detail ? ": " + detail : ""); if (opts.onRow) opts.onRow(rows); };
    const exec = async params => { const t0 = performance.now(), r = await L.run(x.script, params, { timeoutMs }); r.ms = Math.round(performance.now() - t0); runs++; return r; };
    const lr = L.lint(x.script);
    if (!lr.ok) { add("Syntax", false, lr.error); return { rows, failed: 1, defaultRun: { ok: false, error: lr.error }, firstFailure, runs }; }
    add("Syntax", true, ""); (lr.warnings || []).forEach(w => add("Heads-up", true, w, true));
    const d = defaultsOf(x); defaultRun = await exec(d); add("Runs at the start values", defaultRun.ok, defaultRun.ok ? defaultRun.ms + " ms (" + fmtParams(d) + ")" : defaultRun.error);
    if (!defaultRun.ok) return { rows, failed: rows.filter(r => !r.ok && !r.warn).length, defaultRun, firstFailure, runs };
    if (defaultRun.ms > timeoutMs * 0.5) add("Speed", true, "took " + defaultRun.ms + " ms, over half of the " + Math.round(timeoutMs / 1000) + " s limit. Visitors with slower devices may time out.", true);
    const size = JSON.stringify(defaultRun.result).length; if (size > 1.5 * 1048576) add("Result size", false, Math.round(size / 1024) + " KB is too big to train (limit about 1.5 MB). Use fewer points."); else if (full) add("Result size", true, Math.round(size / 1024) + " KB");
    const nulls = defaultRun.result.metrics.filter(m => m.value === null).map(m => m.label); if (nulls.length) add("Metrics are real numbers", false, nulls.join(", ") + " came out empty (NaN or Infinity)."); else if (full) add("Metrics are real numbers", true, defaultRun.result.metrics.length + " metric(s)");
    const noData = defaultRun.result.charts.filter(c => !c.series.length).length; if (noData) add("Charts have data", false, noData + " chart(s) have no valid points (values must be finite numbers).");
    if (full) { const again = await exec(d); { const same = again.ok && stable(again.result) === stable(defaultRun.result); add("Repeatable (same answer twice)", same, same ? "" : again.ok ? "Two runs gave different answers. Use Lab.rng(seed) instead of Math.random() so results are the same every time." : again.error); } }
    if ((x.params || []).length) {
      for (const [label, p] of [["lowest slider values", cornerOf(x, "min")], ["highest slider values", cornerOf(x, "max")]]) { const r = await exec(p); add("Runs at the " + label, r.ok, r.ok ? r.ms + " ms" : fmtParams(p) + " → " + r.error); }
      if (full) {
        const m = await exec(midOf(x)); add("Runs at the middle values", m.ok, m.ok ? m.ms + " ms" : m.error);
        for (let i = 1; i <= 4; i++) { const p = randomOf(x, 1234 * i), r = await exec(p); add("Random settings #" + i, r.ok, r.ok ? fmtParams(p) : fmtParams(p) + " → " + r.error); }
      }
    }
    if (x.goal && x.goal.metric) {
      const has = defaultRun.result.metrics.some(m => m.key === x.goal.metric); add("Goal metric exists", has, has ? "“" + x.goal.metric + "”" : "The goal uses “" + x.goal.metric + "” but the script returns: " + (defaultRun.result.metrics.map(m => m.key).join(", ") || "no metrics"));
      if (full && has) { let reached = L.goalMet(x.goal, defaultRun.result); for (let i = 1; i <= 8 && !reached; i++) { const r = await exec(randomOf(x, 777 * i)); if (r.ok && L.goalMet(x.goal, r.result)) reached = true; } add("Goal can be reached", reached, reached ? "" : "No tested setting met the goal. Check the goal numbers.", !reached); }
    }
    for (const a of (x.tests || [])) {
      const at = a.at === "min" ? cornerOf(x, "min") : a.at === "max" ? cornerOf(x, "max") : a.at === "current" ? { ...defaultsOf(x), ...E.sliderVals } : d;
      const r = a.at === "defaults" && defaultRun.ok ? defaultRun : await exec(at), c = checkAssertion(a, r);
      const opText = a.op === "between" ? "between " + a.value + " and " + a.value2 : a.op === "approx" ? "≈ " + a.value : a.op === "returns" ? "is returned" : a.op + " " + a.value;
      add("Check: " + a.metric + " " + opText + " (" + (a.at === "defaults" ? "start values" : a.at === "min" ? "lowest" : a.at === "max" ? "highest" : "current sliders") + ")", c.ok, c.text);
    }
    return { rows, failed: rows.filter(r => !r.ok && !r.warn).length, defaultRun, firstFailure, runs };
  }
  window.RPLabsTests = { suite };

  /* ---------- custom checks editor ---------- */
  const OPS = [[">=", "at least"], ["<=", "at most"], ["between", "between"], ["approx", "about (±)"], ["returns", "is returned"]];
  function addAssert(a = {}) {
    const row = make("div", { class: "ed-assert" }), at = make("select", { "data-k": "at", "aria-label": "At which settings" }), op = make("select", { "data-k": "op", "aria-label": "Comparison" }), metric = make("input", { type: "text", placeholder: "metric key", "data-k": "metric", "aria-label": "Metric key" }), v1 = make("input", { type: "number", step: "any", placeholder: "value", "data-k": "value", "aria-label": "Value" }), v2 = make("input", { type: "number", step: "any", placeholder: "to / ±", "data-k": "value2", "aria-label": "Second value" });
    [["defaults", "start values"], ["min", "lowest sliders"], ["max", "highest sliders"], ["current", "current sliders"]].forEach(([k, t]) => at.append(make("option", { value: k, text: t }))); OPS.forEach(([k, t]) => op.append(make("option", { value: k, text: t })));
    at.value = a.at || "defaults"; op.value = a.op || ">="; metric.value = a.metric || ""; v1.value = a.value ?? ""; v2.value = a.value2 ?? "";
    const sync = () => { v1.disabled = op.value === "returns"; v2.disabled = !(op.value === "between" || op.value === "approx"); v2.placeholder = op.value === "approx" ? "± tolerance" : "to"; }; op.addEventListener("change", sync); sync();
    row.append(at, metric, op, v1, v2, btn("✕", () => row.remove(), "ed-mini danger")); $("edAsserts").append(row);
  }
  E.setTestsApi({
    collect: () => [...$("edAsserts").children].map(r => { const o = {}; r.querySelectorAll("input,select").forEach(i => { o[i.dataset.k] = i.value; }); return o; }).filter(a => String(a.metric || "").trim()),
    set: list => { $("edAsserts").replaceChildren(); (Array.isArray(list) ? list : []).forEach(addAssert); }
  });
  $("edAddAssert").addEventListener("click", () => addAssert());
  const collectChecks = () => [...$("edAsserts").children].map(r => { const o = {}; r.querySelectorAll("input,select").forEach(i => { o[i.dataset.k] = i.value; }); return o; }).filter(a => String(a.metric || "").trim());
  function currentExp() { const op = $("edGoalOp").value, metric = $("edGoalMetric").value.trim(); return { id: $("edExpId").value || "draft", title: $("edExpTitle").value || "Untitled", params: E.cleanParams(E.collectParams()), script: $("edExpScript").value, tests: collectChecks(), goal: op && metric ? { metric, op, value: num($("edGoalV").value, 0), value2: num($("edGoalV2").value, 0) } : null }; }
  let testing = false;
  async function runSuite(mode) {
    if (testing) return; const x = currentExp(); if (!x.script.trim()) return say("edTestInfo", "Write a script first.", true);
    testing = true; ["edTestAll", "edTestQuick"].forEach(id => { $(id).disabled = true; }); $("edTestInfo").style.color = ""; $("edTestInfo").textContent = "Testing…"; const list = $("edTestList");
    const out = await suite(x, { mode, timeoutMs: E.timeoutMs(), onRow: rows => { list.replaceChildren(...rows.map(r => make("li", {}, make("span", { text: r.name }), make("span", { class: r.ok ? (r.warn ? "" : "lb-ok") : "lb-bad", style: r.warn ? "color:var(--amber)" : "", text: (r.ok ? (r.warn ? "⚠ " : "✓ ") : "✕ ") + String(r.detail || "").slice(0, 160) })))); } });
    testing = false; ["edTestAll", "edTestQuick"].forEach(id => { $(id).disabled = false; });
    const total = out.rows.filter(r => !r.warn).length, passed = total - out.failed; say("edTestInfo", passed + " of " + total + " checks passed · " + out.runs + " script run(s)" + (out.failed ? "" : " · ready to publish"), !!out.failed);
    if (out.defaultRun && out.defaultRun.ok) E.renderResult($("edRunOut"), out.defaultRun); else if (out.defaultRun) E.renderResult($("edRunOut"), out.defaultRun);
    if (out.failed && E.coder && !L.lint(x.script).ok) E.coder.goto(window.RPLabsCoder.errorLine(x.script));
  }
  $("edTestAll").addEventListener("click", () => runSuite("full")); $("edTestQuick").addEventListener("click", () => runSuite("quick"));
  $("edTrainNow").addEventListener("click", async () => {
    const x = currentExp(); if (E.getAccount().state !== "editor") return say("edTestInfo", "Sign in as a Labs employee to train results.", true);
    const params = { ...defaultsOf(x), ...E.sliderVals }; $("edTestInfo").textContent = "Running…"; const r = await L.run(x.script, params, { timeoutMs: E.timeoutMs() });
    if (!r.ok) return say("edTestInfo", "The script failed: " + String(r.error).split("\n")[0], true);
    try { await S.train("exp", L.expKey(x, params), r.result); say("edTestInfo", "Trained for the current sliders (" + fmtParams(params) + "). Visitors who pick these values now get this result, once the experiment is published."); } catch (e) { say("edTestInfo", e.message, true); }
  });

  /* ====================== INBOX ====================== */
  const KIND = { lab: "Lab bench", time: "Time & Temp", physics: "Physics Lab", exp: "Science Labs" };
  function setBadge(n) { const b = $("edInboxCount"); b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); }
  async function refreshBadge() { try { const s = await rpc("rp_labs_stats"); setBadge(s.inbox_new || 0); return s; } catch { return null; } }
  async function localScript(expId) { const x = E.list("exps").find(y => y.id === expId); if (x && x.script) return x; try { const all = await rpc("rp_labs_scripts_get"); if (all && all[expId]) return { id: expId, script: all[expId], params: [] }; } catch { /* ignore */ } return null; }
  async function renderInbox() {
    const root = $("edInboxList"); root.replaceChildren(make("p", { class: "ed-muted", text: "Loading…" }));
    let rows; try { rows = await rpc("rp_labs_inbox", { p_status: $("edInboxFilter").value, p_limit: 300 }); } catch (e) { root.replaceChildren(make("p", { class: "ed-empty", text: /role required|JWT|permission/i.test(e.message) ? "Sign in as a Labs employee to see the inbox." : "Could not load the inbox: " + e.message })); return; }
    const filter = $("edInboxFilter").value; if (filter === "new") rows = rows.filter(r => r.status === "new");
    $("edInboxInfo").textContent = rows.length + " shown"; root.replaceChildren(); refreshBadge();
    if (!rows.length) { root.append(make("p", { class: "ed-empty", text: "Nothing waiting. When someone tries a combination you have not trained, it shows up here." })); return; }
    rows.forEach(r => {
      const who = make("span", { class: "ed-who", text: r.username + " (#" + r.account_number + ")" }), title = make("strong", {}, who, document.createTextNode(" tried ")), badge = make("span", { class: "ed-badge", text: KIND[r.kind] || r.kind });
      title.append(badge); if (r.status === "new") title.append(make("span", { class: "ed-badge draft", text: "new" })); if (r.trained) title.append(make("span", { class: "ed-badge", text: "now trained" }));
      const meta = make("span", { class: "meta", text: r.label + " · tried " + r.attempts + "× · first " + when(r.first_at) + " · last " + when(r.last_at) });
      const acts = make("div", { class: "acts" }), form = make("div", { class: "ed-inbox-form", hidden: "" });
      const done = () => { renderInbox(); refreshBadge(); };
      if (r.kind === "lab") acts.append(make("a", { href: "labs.html#train=lab:" + encodeURIComponent(r.key), target: "_blank", rel: "noopener", class: "ed-mini", style: "text-decoration:none;display:inline-flex;align-items:center", text: "Train in the lab ↗" }));
      if (r.kind === "time" || r.kind === "physics") acts.append(btn("Train…", () => { form.hidden = !form.hidden; }, "ed-mini"));
      if (r.kind === "exp") acts.append(btn("Run and train", async function () { this.disabled = true; this.textContent = "Running…"; const id = r.key.split("|")[0], x = (await localScript(id)); if (!x) { this.disabled = false; this.textContent = "Run and train"; return alert("This experiment is not in your drafts, so it cannot be run here. Open it in the Experiment studio first."); }
        const params = r.params && Object.keys(r.params).length ? r.params : defaultsOf(x), res = await L.run(x.script, params, { timeoutMs: E.timeoutMs() }); if (!res.ok) { this.disabled = false; this.textContent = "Run and train"; return alert("The script failed at these settings: " + res.error); }
        try { await S.train("exp", r.key, res.result); done(); } catch (e) { alert(e.message); this.disabled = false; this.textContent = "Run and train"; } }, "ed-mini"));
      if (r.status !== "dismissed") { if (r.status === "new") acts.append(btn("Mark seen", async () => { await rpc("rp_labs_inbox_set", { p_id: r.id, p_status: "seen" }); done(); }, "ed-mini")); acts.append(btn("Dismiss", async () => { await rpc("rp_labs_inbox_set", { p_id: r.id, p_status: "dismissed" }); done(); }, "ed-mini danger")); }
      else acts.append(btn("Reopen", async () => { await rpc("rp_labs_inbox_set", { p_id: r.id, p_status: "seen" }); done(); }, "ed-mini"));
      if (r.kind === "time" || r.kind === "physics") {
        const t = make("input", { type: "text", maxlength: 120, placeholder: "Result title", value: "🧬 Discovery" }), tx = make("textarea", { rows: 3, maxlength: 2000, placeholder: "What happens? (required)", class: "wide" }), pn = make("input", { type: "text", maxlength: 60, placeholder: "Product name (optional)" }), pe = make("input", { type: "text", maxlength: 4, placeholder: "Emoji", value: "🧪" });
        const save = btn("Save trained result", async () => { if (!tx.value.trim()) return alert("Describe what happens first."); const entry = { title: t.value.trim() || "🧬 Discovery", text: tx.value.trim() }; if (pn.value.trim()) entry.product = { name: pn.value.trim(), formula: "-", state: r.kind === "time" ? "aqueous" : "solid", emoji: pe.value.trim() || "🧪" }; try { await S.train(r.kind, r.key, entry); done(); } catch (e) { alert(e.message); } }, "ed-primary");
        form.append(t, pe, tx, pn, make("div", { class: "wide" }, save));
      }
      root.append(make("article", { class: "ed-row" + (r.status === "new" ? " unread" : "") }, make("div", {}, title, meta), acts, form));
    });
  }
  E.onShow.inbox = renderInbox; $("edInboxFilter").addEventListener("change", renderInbox); $("edInboxRefresh").addEventListener("click", renderInbox);
  $("edInboxSeen").addEventListener("click", async () => { try { await rpc("rp_labs_inbox_mark_all_seen"); } catch (e) { alert(e.message); } renderInbox(); });

  /* ====================== TRAINING LIBRARY ====================== */
  async function renderTraining() {
    const root = $("edTrainList"); root.replaceChildren(make("p", { class: "ed-muted", text: "Loading…" }));
    try {
      const st = await rpc("rp_labs_stats"); $("edTrainTiles").replaceChildren(...[["Lab bench", st.trained.lab || 0], ["Time & Temp", st.trained.time || 0], ["Physics Lab", st.trained.physics || 0], ["Science Labs", st.trained.exp || 0], ["Waiting in inbox", st.untrained_open], ["Visitors who explored", st.explorers]].map(([l, v]) => make("div", { class: "ed-tile" }, make("span", { text: l }), make("strong", { text: String(v) }))));
      const rows = await rpc("rp_labs_training_list", { p_kind: $("edTrainKind").value || null, p_query: $("edTrainSearch").value.trim(), p_limit: 200, p_offset: 0 });
      $("edTrainInfo").textContent = rows.length + " shown" + (rows.length === 200 ? " (first 200)" : ""); root.replaceChildren(); if (!rows.length) return root.append(make("p", { class: "ed-empty", text: "Nothing trained yet." }));
      rows.forEach(r => root.append(make("article", { class: "ed-row" }, make("div", {}, make("strong", {}, document.createTextNode(r.title || r.key), make("span", { class: "ed-badge", text: KIND[r.kind] || r.kind })), make("span", { class: "meta", text: r.key.slice(0, 120) + " · " + Math.max(1, Math.round(r.bytes / 1024)) + " KB · by " + (r.trained_by || "?") + " · " + when(r.trained_at) })),
        make("div", { class: "acts" }, btn("View JSON", async () => { try { const d = await rpc("rp_labs_training_get", { p_kind: r.kind, p_key: r.key }); L.download("trained-" + r.kind + ".json", JSON.stringify({ kind: r.kind, key: r.key, data: d }, null, 2), "application/json"); } catch (e) { alert(e.message); } }, "ed-mini"),
          btn("Delete", async () => { if (!confirm("Delete this trained result? Visitors will see “Not discovered yet” again.")) return; try { await rpc("rp_labs_untrain", { p_kind: r.kind, p_key: r.key }); renderTraining(); } catch (e) { alert(e.message); } }, "ed-mini danger")))));
    } catch (e) { root.replaceChildren(make("p", { class: "ed-empty", text: /role required|JWT|permission/i.test(e.message) ? "Sign in as a Labs employee to see the training library." : "Could not load: " + e.message })); }
    const sel = $("edGridExp"), cur = sel.value; sel.replaceChildren(...E.list("exps").filter(x => x.status !== "draft").map(x => make("option", { value: x.id, text: x.title }))); if (cur) sel.value = cur;
  }
  E.onShow.training = renderTraining; $("edTrainKind").addEventListener("change", renderTraining); let ts = 0; $("edTrainSearch").addEventListener("input", () => { clearTimeout(ts); ts = setTimeout(renderTraining, 300); });
  $("edTrainExport").addEventListener("click", async () => { try { const all = await rpc("rp_labs_training_export", { p_kind: $("edTrainKind").value || null }); L.download("rp-labs-training.json", JSON.stringify({ app: "rp-labs-training", exportedAt: new Date().toISOString(), items: all }, null, 2), "application/json"); $("edTrainInfo").textContent = "Downloaded " + all.length + " result(s)."; } catch (e) { alert(e.message); } });
  $("edTrainImport").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()), items = Array.isArray(d) ? d : d && d.items; if (!Array.isArray(items) || !items.length) throw new Error("No trained results found in this file."); if (!confirm("Import " + items.length + " trained result(s)? Existing ones with the same key are replaced.")) return;
      for (let i = 0; i < items.length; i += 50) await S.trainMany(items.slice(i, i + 50).map(q => ({ kind: q.kind, key: q.key, data: q.data }))); $("edTrainInfo").textContent = "Imported " + items.length + "."; renderTraining(); }
    catch (err) { alert("Import failed: " + err.message); } e.target.value = "";
  });
  $("edGridRun").addEventListener("click", async () => {
    const x = E.list("exps").find(y => y.id === $("edGridExp").value); if (!x) return say("edGridInfo", "Choose an experiment first.", true);
    const n = Math.min(12, Math.max(1, Math.round(num($("edGridN").value, 3)))), ps = E.cleanParams(x.params || []);
    const vals = ps.map(p => { const out = []; for (let i = 0; i < n; i++) { const raw = n === 1 ? p.default : p.min + (p.max - p.min) * i / (n - 1); out.push(Math.min(p.max, p.min + Math.round((raw - p.min) / p.step) * p.step)); } return [...new Set(out)]; });
    let combos = [{}]; ps.forEach((p, i) => { const next = []; combos.forEach(c => vals[i].forEach(v => next.push({ ...c, [p.key]: v }))); combos = next; });
    if (combos.length > 200) return say("edGridInfo", combos.length + " combinations is too many (limit 200). Use fewer values per slider.", true);
    if (!confirm("Run " + combos.length + " combination(s) and train them?")) return; const items = []; const L2 = L; $("edGridRun").disabled = true;
    for (let i = 0; i < combos.length; i++) { say("edGridInfo", "Running " + (i + 1) + " of " + combos.length + "…"); const r = await L2.run(x.script, combos[i], { timeoutMs: E.timeoutMs() }); if (r.ok) items.push({ kind: "exp", key: L2.expKey({ id: x.id, params: ps }, combos[i]), data: r.result }); }
    try { for (let i = 0; i < items.length; i += 25) await S.trainMany(items.slice(i, i + 25)); say("edGridInfo", "Trained " + items.length + " of " + combos.length + " combination(s)" + (items.length < combos.length ? " (the rest failed in the script)." : ".")); renderTraining(); } catch (e) { say("edGridInfo", e.message, true); } $("edGridRun").disabled = false;
  });

  /* ====================== SETTINGS ====================== */
  const TAB_NAMES = { lab: "🔬 LAB", scilabs: "🧪 SCIENCE LABS", research: "📚 RESEARCH", library: "🗂 LIBRARY", store: "🛒 STORE", addmaterial: "🧬 ADD MATERIAL", timeskip: "⏱ TIME & TEMP", physicslab: "⚛ PHYSICS LAB", materialinfo: "📖 MATERIAL INFO", earn: "🎓 EARN" };
  let loadedSettings = null;
  function fillSettings(s) {
    loadedSettings = s; $("stOpen").value = String(s.labs_open !== false); $("stDaily").value = String(s.show_daily_experiment !== false); $("stBanner").value = s.banner || ""; $("stTone").value = s.banner_tone || "info";
    $("stNotText").value = s.not_discovered_text || ""; $("stGuestText").value = s.guest_text || ""; $("stNotify").value = String(s.notify_enabled !== false); $("stThank").value = String(s.notify_discoverer !== false);
    $("stNotCap").value = s.notify_cap_per_day; $("stAttCap").value = s.attempts_cap_per_account_day; $("stMoney").value = s.starting_money; $("stMult").value = s.price_multiplier; $("stMax").value = s.max_selection; $("stQ2").value = s.quiz_reward_both; $("stQ1").value = s.quiz_reward_one; $("stTimeout").value = Math.round(s.sandbox_timeout_ms / 1000);
    $("stTabs").replaceChildren(...Object.entries(TAB_NAMES).map(([k, t]) => { const c = make("input", { type: "checkbox", "data-tab": k }); c.checked = (s.tabs || {})[k] !== false; return make("label", {}, c, document.createTextNode(t)); }));
  }
  async function loadSettings() { const s = await S.settings(true); E.setSettings(s); fillSettings(s); }
  E.onShow.settings = loadSettings; $("stReload").addEventListener("click", loadSettings);
  $("edSettingsForm").addEventListener("submit", async e => {
    e.preventDefault(); const tabs = {}; $("stTabs").querySelectorAll("input").forEach(c => { tabs[c.dataset.tab] = c.checked; });
    const data = { labs_open: $("stOpen").value === "true", show_daily_experiment: $("stDaily").value === "true", banner: $("stBanner").value.trim(), banner_tone: $("stTone").value, not_discovered_text: $("stNotText").value.trim(), guest_text: $("stGuestText").value.trim(), notify_enabled: $("stNotify").value === "true", notify_discoverer: $("stThank").value === "true",
      notify_cap_per_day: num($("stNotCap").value, 200), attempts_cap_per_account_day: num($("stAttCap").value, 200), starting_money: num($("stMoney").value, 50), price_multiplier: num($("stMult").value, 1), max_selection: num($("stMax").value, 4), quiz_reward_both: num($("stQ2").value, 25), quiz_reward_one: num($("stQ1").value, 10), sandbox_timeout_ms: Math.round(num($("stTimeout").value, 5) * 1000), tabs };
    if (!data.not_discovered_text) return say("stMsg", "The “not discovered” text cannot be empty.", true);
    $("stSave").disabled = true; try { const s = await rpc("rp_labs_settings_save", { p_data: data }); const merged = { ...S.DEFAULTS, ...s, tabs: { ...S.DEFAULTS.tabs, ...(s.tabs || {}) } }; E.setSettings(merged); fillSettings(merged); say("stMsg", "Saved. Visitors get the new settings the next time they open or reload the Labs page."); } catch (err) { say("stMsg", /role required/i.test(err.message) ? "Sign in as a Labs employee to change settings." : err.message, true); } $("stSave").disabled = false;
  });

  /* ====================== start ====================== */
  S.settings(true).then(s => E.setSettings(s)).catch(() => {}); refreshBadge(); setInterval(() => { if (!document.hidden) refreshBadge(); }, 60000);
  window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (["inbox", "training", "settings"].includes(h)) E.showView(h); });
})();

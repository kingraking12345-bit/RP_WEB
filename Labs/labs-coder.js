/* RP Labs coder: a real code editor for experiment scripts (no libraries, no network).
   Line numbers, syntax colours, live error check, auto-complete for Lab.* and params.*, snippets, find & replace,
   auto-indent, bracket pairing, comment toggle, format, fullscreen and personal editor settings.
   Usage: RPLabsCoder.attach(textarea, { getParamKeys: () => ["x","y"], onChange: () => {} }) -> { setValue, getValue, focus, goto, refresh } */
window.RPLabsCoder = (() => {
  "use strict";
  const PREF_KEY = "rpLabsCoderPrefs.v1", DEFAULT_PREFS = { fontSize: 13, tabSize: 2, lineNumbers: true, autoClose: true, liveCheck: true, highlight: true, wrap: false };
  const loadPrefs = () => { try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREF_KEY) || "{}") || {}) }; } catch { return { ...DEFAULT_PREFS }; } };
  const savePrefs = p => { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* full */ } };
  const KEYWORDS = new Set("const let var function return if else for while do break continue switch case default new typeof instanceof of in true false null undefined NaN Infinity try catch finally throw".split(" "));
  const LAB_API = [
    ["Lab.constants", "g, c, G, kB, NA, R, h, e"], ["Lab.sum(a)", "sum of an array"], ["Lab.mean(a)", "average"], ["Lab.std(a)", "standard deviation"],
    ["Lab.rng(seed)", "repeatable random numbers: const r = Lab.rng(1); r()"], ["Lab.normal(r, mean, sd)", "random normal number"],
    ["Lab.min(a)", "smallest value"], ["Lab.max(a)", "largest value"], ["Lab.round(v, digits)", "round to digits"],
    ["Lab.linspace(a, b, n)", "n evenly spaced numbers"], ["Lab.range(a, b, step)", "numbers from a to b"], ["Lab.column(rows, i)", "one column of a table"],
    ["Lab.binomial(r, n, p)", "random binomial count"], ["Lab.linreg(x, y)", "{ slope, intercept, r2 }"], ["Lab.rk4(f, y0, t0, t1, dt, every)", "solve differential equations -> { t, y }"]
  ];
  const SNIPPETS = [
    ["Chart (line)", `charts: [{ title: "Title", xLabel: "x", yLabel: "y", series: [{ name: "data", x: xs, y: ys, style: "line" }] }],`],
    ["Metric", `metrics: { key: { label: "Label", value: 0, unit: "" } },`],
    ["Table", `table: { columns: ["a", "b"], rows: rows },`],
    ["For loop", `for (let i = 0; i < n; i++) {\n  \n}`],
    ["Monte Carlo loop", `const r = Lab.rng(42);\nlet hits = 0;\nfor (let i = 0; i < 5000; i++) {\n  if (r() < 0.5) hits++;\n}`],
    ["Differential equation", `const f = (t, y) => [y[1], -y[0]];\nconst sim = Lab.rk4(f, [1, 0], 0, 10, 0.01, 5);`],
    ["Full result", `return {\n  charts: [{ title: "Chart", xLabel: "x", yLabel: "y", series: [{ name: "y", x: xs, y: ys }] }],\n  metrics: { top: { label: "Top value", value: Lab.max(ys), unit: "" } },\n  notes: ""\n};`]
  ];
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function highlight(src) {
    const re = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?)|(\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\b(?:Lab|params|Math)\b(?:\.[A-Za-z_]\w*)?)|(\b[A-Za-z_$][\w$]*\b)/g;
    let out = "", last = 0, m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index)); const t = m[0];
      if (m[1]) out += '<span class="c-cm">' + esc(t) + "</span>"; else if (m[2]) out += '<span class="c-st">' + esc(t) + "</span>"; else if (m[3]) out += '<span class="c-nm">' + esc(t) + "</span>";
      else if (m[4]) out += '<span class="c-lab">' + esc(t) + "</span>"; else if (KEYWORDS.has(t)) out += '<span class="c-kw">' + esc(t) + "</span>"; else out += esc(t);
      last = m.index + t.length;
    }
    return out + esc(src.slice(last));
  }
  /* Best-effort line of a syntax error: the first line at which the code so far is wrong in a way more code cannot fix. */
  function errorLine(src) {
    const lines = src.split("\n"); let found = lines.length;
    for (let n = 1; n <= lines.length; n++) {
      try { new Function("params", "Lab", lines.slice(0, n).join("\n")); } catch (e) { const m = String(e && e.message); if (!/end of input|Unterminated template|missing \) after argument list|Unexpected token '?}'?$/i.test(m) && !/^Unexpected token '?}'?/.test(m)) { found = n; break; } }
    }
    return found;
  }
  const CSS = `
.rc{position:relative;border:1px solid var(--line,#1e3a63);border-radius:8px;background:#030814;overflow:hidden;display:flex;flex-direction:column}
.rc.full{position:fixed;inset:10px;z-index:9999;border-color:#2ee6e6}
.rc-bar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(125,160,220,.2);background:#0a1530}
.rc-bar button{padding:4px 9px;border:1px solid rgba(125,160,220,.3);border-radius:6px;background:#10203f;color:#d7e6ff;font-size:12px;cursor:pointer}
.rc-bar button:hover{border-color:#2ee6e6}.rc-bar .sp{flex:1}.rc-bar .st{font-size:12px;color:#7d93b8}
.rc-main{position:relative;display:flex;flex:1;min-height:330px;max-height:70vh;overflow:hidden}.rc.full .rc-main{max-height:none}
.rc-gut{flex:none;min-width:44px;padding:12px 8px 12px 6px;text-align:right;color:#4d6288;background:#07102a;border-right:1px solid rgba(125,160,220,.15);overflow:hidden;white-space:pre;user-select:none;font-family:Consolas,'Courier New',monospace}
.rc-gut .bad{color:#f87171;font-weight:700;background:rgba(248,113,113,.15)}
.rc-gut .cur{color:#d7e6ff}
.rc-edit{position:relative;flex:1;min-width:0}
.rc-pre,.rc-edit textarea{position:absolute;inset:0;margin:0;padding:12px;border:0;font-family:Consolas,'Courier New',monospace;line-height:1.5;tab-size:var(--rc-tab,2);white-space:pre;overflow:auto;box-sizing:border-box;letter-spacing:0}
.rc-pre{pointer-events:none;color:#c9e7ff;overflow:hidden}
.rc-edit textarea{background:transparent;color:transparent;caret-color:#fff;resize:none;outline:none;min-height:0!important}
.rc.nohl .rc-edit textarea{color:#c9e7ff}.rc.nohl .rc-pre{visibility:hidden}
.rc.wrap .rc-pre,.rc.wrap .rc-edit textarea{white-space:pre-wrap;word-break:break-word}
.rc-edit textarea::selection{background:rgba(46,230,230,.3);color:transparent}.rc.nohl .rc-edit textarea::selection{color:#fff}
.c-cm{color:#5b7aa6;font-style:italic}.c-st{color:#a5e075}.c-nm{color:#fbbf24}.c-kw{color:#f472b6}.c-lab{color:#2ee6e6}
.rc-ac{position:absolute;z-index:5;min-width:260px;max-width:420px;max-height:200px;overflow:auto;background:#10203f;border:1px solid #2ee6e6;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.5);font:12px Consolas,monospace}
.rc-ac div{padding:5px 9px;cursor:pointer;display:flex;justify-content:space-between;gap:12px;color:#d7e6ff}.rc-ac div span{color:#7d93b8;font-family:'Segoe UI',sans-serif}.rc-ac .on{background:#1b3566}
.rc-msg{padding:6px 10px;font-size:12px;border-top:1px solid rgba(125,160,220,.2);min-height:28px;background:#07102a;color:#7d93b8}.rc-msg.bad{color:#ffb4b4;background:#2a1212}.rc-msg.ok{color:#34d399}.rc-msg .w{color:#fbbf24;display:block}
.rc-pop{position:absolute;right:8px;top:42px;z-index:6;width:min(300px,90%);padding:12px;border:1px solid #2ee6e6;border-radius:10px;background:#0c1830;display:grid;gap:8px;font-size:12px;color:#d7e6ff}
.rc-pop label{display:flex;justify-content:space-between;gap:8px;align-items:center}.rc-pop input[type=number]{width:64px}
.rc-find{display:flex;gap:6px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid rgba(125,160,220,.2);background:#07102a}
.rc-find input{padding:4px 8px;border:1px solid rgba(125,160,220,.3);border-radius:6px;background:#030814;color:#d7e6ff;font-size:12px;min-width:120px}
`;
  function attach(ta, opts) {
    opts = opts || {}; if (!document.getElementById("rcStyle")) { const st = document.createElement("style"); st.id = "rcStyle"; st.textContent = CSS; document.head.append(st); }
    const prefs = loadPrefs(), nativeDesc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    const root = document.createElement("div"), bar = document.createElement("div"), main = document.createElement("div"), gut = document.createElement("div"), edit = document.createElement("div"), pre = document.createElement("pre"), msg = document.createElement("div"), find = document.createElement("div");
    root.className = "rc"; bar.className = "rc-bar"; main.className = "rc-main"; gut.className = "rc-gut"; edit.className = "rc-edit"; pre.className = "rc-pre"; msg.className = "rc-msg"; find.className = "rc-find"; find.hidden = true; pre.setAttribute("aria-hidden", "true");
    ta.parentNode.insertBefore(root, ta); ta.removeAttribute("maxlength"); ta.style.cssText = ""; ta.className = ""; ta.setAttribute("wrap", "off");
    edit.append(pre, ta); main.append(gut, edit); root.append(bar, find, main, msg);
    const mkBtn = (t, fn, title) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; if (title) b.title = title; b.addEventListener("click", fn); bar.append(b); return b; };
    let ac = null, acItems = [], acIdx = 0, lintTimer = 0, lintState = { ok: true };
    const get = () => nativeDesc.get.call(ta), put = v => { nativeDesc.set.call(ta, v); refresh(); };
    Object.defineProperty(ta, "value", { get() { return nativeDesc.get.call(this); }, set(v) { nativeDesc.set.call(this, v); refresh(); }, configurable: true });
    function applyPrefs() {
      root.style.setProperty("--rc-tab", prefs.tabSize); [pre, ta, gut].forEach(n => { n.style.fontSize = prefs.fontSize + "px"; n.style.lineHeight = "1.5"; });
      root.classList.toggle("nohl", !prefs.highlight); root.classList.toggle("wrap", !!prefs.wrap); gut.style.display = prefs.lineNumbers ? "" : "none"; ta.setAttribute("wrap", prefs.wrap ? "soft" : "off");
    }
    function lineCol() { const v = get(), pos = ta.selectionStart, before = v.slice(0, pos).split("\n"); return { line: before.length, col: before[before.length - 1].length + 1 }; }
    function refresh() {
      const v = get(), lines = v.split("\n").length; pre.innerHTML = prefs.highlight ? highlight(v) + "\n" : "";
      const cur = lineCol().line, bad = lintState.ok ? 0 : lintState.line; let g = "";
      for (let i = 1; i <= lines; i++) g += (i === bad ? '<span class="bad">' + i + "</span>" : i === cur ? '<span class="cur">' + i + "</span>" : i) + "\n";
      gut.innerHTML = g; syncScroll(); status();
      if (prefs.liveCheck) { clearTimeout(lintTimer); lintTimer = setTimeout(check, 350); } else { lintState = { ok: true }; showMsg(); }
    }
    function syncScroll() { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; gut.scrollTop = ta.scrollTop; }
    function status() { const p = lineCol(); if (stEl) stEl.textContent = "Line " + p.line + ", col " + p.col + " · " + get().length.toLocaleString() + " characters"; }
    function check() {
      const v = get(), L = window.RPLabs; if (!L || !L.lint) return; const r = L.lint(v);
      lintState = r.ok ? { ok: true, warnings: r.warnings || [] } : { ok: false, error: r.error, line: v.trim() ? errorLine(v) : 1 }; showMsg();
      const cur = lineCol().line, bad = lintState.ok ? 0 : lintState.line; const lines = v.split("\n").length; let g = ""; for (let i = 1; i <= lines; i++) g += (i === bad ? '<span class="bad">' + i + "</span>" : i === cur ? '<span class="cur">' + i + "</span>" : i) + "\n"; gut.innerHTML = g; syncScroll();
      if (opts.onLint) opts.onLint(lintState);
    }
    function showMsg() {
      msg.className = "rc-msg" + (lintState.ok ? (get().trim() ? " ok" : "") : " bad"); msg.replaceChildren();
      if (!get().trim()) { msg.textContent = "Empty script. Insert a template or a snippet to start."; return; }
      if (!lintState.ok) { msg.textContent = "✕ " + lintState.error + " (near line " + lintState.line + ")"; return; }
      msg.append("✓ No syntax errors."); (lintState.warnings || []).forEach(w => { const s = document.createElement("span"); s.className = "w"; s.textContent = "⚠ " + w; msg.append(s); });
    }
    const stEl = document.createElement("span"); stEl.className = "st";
    /* ----- editing helpers ----- */
    function replaceRange(a, b, text, selA, selB) { ta.focus(); ta.setSelectionRange(a, b); let ok = false; try { ok = document.execCommand("insertText", false, text); } catch { /* old browser */ } if (!ok) ta.setRangeText(text, a, b, "end"); const s = selA == null ? a + text.length : selA; ta.setSelectionRange(s, selB == null ? s : selB); changed(); }
    function changed() { refresh(); if (opts.onChange) opts.onChange(get()); }
    function insertAtCursor(text) { replaceRange(ta.selectionStart, ta.selectionEnd, text); }
    const indentUnit = () => " ".repeat(prefs.tabSize);
    function lineBounds() { const v = get(), a = v.lastIndexOf("\n", ta.selectionStart - 1) + 1; let b = v.indexOf("\n", ta.selectionEnd); if (b < 0) b = v.length; if (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === "\n") b = ta.selectionEnd - 1; return [a, b]; }
    function indentSel(out) {
      const [a, b] = lineBounds(), v = get(), block = v.slice(a, b), un = indentUnit();
      const nb = block.split("\n").map(l => out ? (l.startsWith(un) ? l.slice(un.length) : l.replace(/^\t| {1,}/, m => m.length > prefs.tabSize ? m.slice(prefs.tabSize) : "")) : (l.length ? un + l : l)).join("\n"); replaceRange(a, b, nb, a, a + nb.length);
    }
    function toggleComment() { const [a, b] = lineBounds(), block = get().slice(a, b), lines = block.split("\n"), all = lines.every(l => !l.trim() || /^\s*\/\//.test(l)); const nb = lines.map(l => !l.trim() ? l : all ? l.replace(/^(\s*)\/\/ ?/, "$1") : l.replace(/^(\s*)/, "$1// ")).join("\n"); replaceRange(a, b, nb, a, a + nb.length); }
    function duplicateLine() { const [a, b] = lineBounds(), block = get().slice(a, b); replaceRange(b, b, "\n" + block); }
    function format() {
      const v = get(), un = indentUnit(); let depth = 0, out = [];
      v.split("\n").forEach(raw => { const line = raw.trim(); if (!line) { out.push(""); return; } const noStr = line.replace(/\/\/.*$/, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, ""); const lead = (noStr.match(/^[\]})]+/) || [""])[0].length; const d = Math.max(0, depth - lead); out.push(un.repeat(d) + line); const opens = (noStr.match(/[\[{(]/g) || []).length, closes = (noStr.match(/[\]})]/g) || []).length; depth = Math.max(0, depth + opens - closes); });
      const next = out.join("\n"); if (next !== v) { ta.focus(); ta.select(); try { document.execCommand("insertText", false, next); } catch { put(next); } changed(); }
    }
    /* ----- auto-complete ----- */
    function closeAc() { if (ac) { ac.remove(); ac = null; } }
    function openAc() {
      const pos = ta.selectionStart, v = get(), before = v.slice(0, pos), m = before.match(/(Lab|params)\.([A-Za-z_]*)$/); if (!m) return closeAc();
      const kind = m[1], prefix = m[2].toLowerCase();
      acItems = kind === "Lab" ? LAB_API.filter(x => x[0].slice(4).toLowerCase().startsWith(prefix)).map(x => ({ insert: x[0].slice(4), label: x[0], hint: x[1] })) : (opts.getParamKeys ? opts.getParamKeys() : []).filter(k => k.toLowerCase().startsWith(prefix)).map(k => ({ insert: k, label: "params." + k, hint: "slider value" }));
      if (!acItems.length) return closeAc(); acIdx = 0; if (!ac) { ac = document.createElement("div"); ac.className = "rc-ac"; edit.append(ac); }
      const cs = lineCol(), lh = prefs.fontSize * 1.5, cw = prefs.fontSize * 0.6; ac.style.left = Math.min(edit.clientWidth - 270, 12 + (cs.col - 1) * cw - ta.scrollLeft) + "px"; ac.style.top = Math.min(edit.clientHeight - 60, 12 + cs.line * lh - ta.scrollTop) + "px";
      ac.replaceChildren(...acItems.map((it, i) => { const d = document.createElement("div"); if (i === acIdx) d.className = "on"; const l = document.createElement("b"); l.textContent = it.label; l.style.fontWeight = "400"; const h = document.createElement("span"); h.textContent = it.hint; d.append(l, h); d.addEventListener("mousedown", e => { e.preventDefault(); acIdx = i; acceptAc(); }); return d; }));
    }
    function acceptAc() { if (!ac || !acItems[acIdx]) return; const pos = ta.selectionStart, m = get().slice(0, pos).match(/(?:Lab|params)\.([A-Za-z_]*)$/), it = acItems[acIdx]; const start = pos - (m ? m[1].length : 0); closeAc(); replaceRange(start, pos, it.insert); }
    /* ----- keys ----- */
    const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "'": "'", "`": "`" };
    ta.addEventListener("keydown", e => {
      if (ac) { if (e.key === "ArrowDown") { e.preventDefault(); acIdx = (acIdx + 1) % acItems.length; openAc(); ac && (acIdx = acIdx); return; } if (e.key === "ArrowUp") { e.preventDefault(); acIdx = (acIdx + acItems.length - 1) % acItems.length; openAc(); return; } if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); acceptAc(); return; } if (e.key === "Escape") { e.preventDefault(); closeAc(); return; } }
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "Tab") { e.preventDefault(); if (e.shiftKey || ta.selectionStart !== ta.selectionEnd && get().slice(ta.selectionStart, ta.selectionEnd).includes("\n")) indentSel(e.shiftKey); else insertAtCursor(indentUnit()); return; }
      if (mod && e.key === "/") { e.preventDefault(); toggleComment(); return; }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateLine(); return; }
      if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); toggleFind(true); return; }
      if (mod && e.key === "Enter") { e.preventDefault(); if (opts.onRun) opts.onRun(); return; }
      if (e.key === "Escape" && root.classList.contains("full")) { toggleFull(); return; }
      if (e.key === "Enter" && !mod) { // keep indentation, add a level after an opening bracket
        const v = get(), pos = ta.selectionStart, ls = v.lastIndexOf("\n", pos - 1) + 1, cur = v.slice(ls, pos), ind = (cur.match(/^\s*/) || [""])[0], prev = v[pos - 1], next = v[pos];
        if (ta.selectionStart === ta.selectionEnd) { e.preventDefault(); if ((prev === "{" || prev === "[" || prev === "(") && PAIRS[prev] === next) { replaceRange(pos, pos, "\n" + ind + indentUnit() + "\n" + ind, pos + 1 + ind.length + indentUnit().length); } else replaceRange(pos, pos, "\n" + ind + (/[{[(]\s*$/.test(cur) ? indentUnit() : "")); return; }
      }
      if (prefs.autoClose && !mod) {
        const v = get(), s = ta.selectionStart, en = ta.selectionEnd;
        if (PAIRS[e.key] && s === en) { const next = v[s]; if ((e.key === '"' || e.key === "'" || e.key === "`") && (next === e.key)) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; } if (/[\w]/.test(v[s - 1] || "") && (e.key === '"' || e.key === "'" || e.key === "`")) return; e.preventDefault(); replaceRange(s, s, e.key + PAIRS[e.key], s + 1); return; }
        if (PAIRS[e.key] && s !== en) { e.preventDefault(); const sel = v.slice(s, en); replaceRange(s, en, e.key + sel + PAIRS[e.key], s + 1, en + 1); return; }
        if ([")", "]", "}"].includes(e.key) && v[s] === e.key && s === en) { e.preventDefault(); ta.setSelectionRange(s + 1, s + 1); return; }
        if (e.key === "Backspace" && s === en && PAIRS[v[s - 1]] && PAIRS[v[s - 1]] === v[s]) { e.preventDefault(); replaceRange(s - 1, s + 1, "", s - 1); return; }
      }
    });
    ta.addEventListener("input", () => { changed(); openAc(); });
    ta.addEventListener("scroll", syncScroll); ta.addEventListener("click", () => { closeAc(); status(); refresh(); }); ta.addEventListener("keyup", e => { if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) status(); }); ta.addEventListener("blur", () => setTimeout(closeAc, 120));
    /* ----- toolbar ----- */
    const snip = document.createElement("select"); snip.setAttribute("aria-label", "Insert snippet"); snip.style.cssText = "padding:4px 6px;border:1px solid rgba(125,160,220,.3);border-radius:6px;background:#10203f;color:#d7e6ff;font-size:12px";
    snip.append(new Option("＋ Snippet…", "")); SNIPPETS.forEach(([n], i) => snip.append(new Option(n, String(i)))); snip.addEventListener("change", () => { if (snip.value !== "") insertAtCursor(SNIPPETS[Number(snip.value)][1]); snip.value = ""; ta.focus(); }); bar.append(snip);
    mkBtn("Format", format, "Fix indentation"); mkBtn("Comment (Ctrl+/)", toggleComment); mkBtn("Find (Ctrl+F)", () => toggleFind()); mkBtn("Undo", () => { ta.focus(); try { document.execCommand("undo"); } catch { /* none */ } changed(); }); mkBtn("Redo", () => { ta.focus(); try { document.execCommand("redo"); } catch { /* none */ } changed(); });
    if (opts.onRun) mkBtn("▶ Run (Ctrl+Enter)", () => opts.onRun());
    const sp = document.createElement("span"); sp.className = "sp"; bar.append(sp, stEl);
    const settingsBtn = mkBtn("⚙ Editor settings", () => togglePop()); const fullBtn = mkBtn("⛶ Fullscreen", toggleFull);
    function toggleFull() { root.classList.toggle("full"); fullBtn.textContent = root.classList.contains("full") ? "✕ Exit fullscreen" : "⛶ Fullscreen"; ta.focus(); }
    let pop = null;
    function togglePop() {
      if (pop) { pop.remove(); pop = null; return; } pop = document.createElement("div"); pop.className = "rc-pop";
      const row = (label, input) => { const l = document.createElement("label"); l.append(document.createTextNode(label), input); pop.append(l); };
      const num = (k, min, max) => { const i = document.createElement("input"); i.type = "number"; i.min = min; i.max = max; i.value = prefs[k]; i.addEventListener("change", () => { prefs[k] = Math.min(max, Math.max(min, Number(i.value) || DEFAULT_PREFS[k])); i.value = prefs[k]; savePrefs(prefs); applyPrefs(); refresh(); }); return i; };
      const chk = k => { const i = document.createElement("input"); i.type = "checkbox"; i.checked = !!prefs[k]; i.addEventListener("change", () => { prefs[k] = i.checked; savePrefs(prefs); applyPrefs(); refresh(); }); return i; };
      row("Font size (px)", num("fontSize", 10, 24)); row("Tab size (spaces)", num("tabSize", 2, 8)); row("Line numbers", chk("lineNumbers")); row("Syntax colours", chk("highlight")); row("Check errors while typing", chk("liveCheck")); row("Close brackets and quotes", chk("autoClose")); row("Wrap long lines", chk("wrap"));
      const rs = document.createElement("button"); rs.type = "button"; rs.textContent = "Reset to defaults"; rs.addEventListener("click", () => { Object.assign(prefs, DEFAULT_PREFS); savePrefs(prefs); applyPrefs(); refresh(); togglePop(); }); pop.append(rs); root.append(pop);
    }
    /* ----- find & replace ----- */
    const fi = document.createElement("input"), ri = document.createElement("input"), fCount = document.createElement("span"); fi.placeholder = "Find"; ri.placeholder = "Replace with"; fCount.className = "st"; fCount.style.alignSelf = "center";
    const mkF = (t, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.addEventListener("click", fn); b.style.cssText = "padding:4px 9px;border:1px solid rgba(125,160,220,.3);border-radius:6px;background:#10203f;color:#d7e6ff;font-size:12px;cursor:pointer"; return b; };
    function findNext(dir) { const q = fi.value; if (!q) return; const v = get(), n = v.split(q).length - 1; fCount.textContent = n + " found"; if (!n) return; let i = dir < 0 ? v.lastIndexOf(q, ta.selectionStart - 1) : v.indexOf(q, ta.selectionEnd); if (i < 0) i = dir < 0 ? v.lastIndexOf(q) : v.indexOf(q); ta.focus(); ta.setSelectionRange(i, i + q.length); const line = v.slice(0, i).split("\n").length; ta.scrollTop = Math.max(0, (line - 4) * prefs.fontSize * 1.5); syncScroll(); status(); }
    find.append(fi, ri, mkF("Next", () => findNext(1)), mkF("Previous", () => findNext(-1)), mkF("Replace", () => { const q = fi.value; if (q && get().slice(ta.selectionStart, ta.selectionEnd) === q) replaceRange(ta.selectionStart, ta.selectionEnd, ri.value); findNext(1); }), mkF("Replace all", () => { const q = fi.value; if (!q) return; const v = get(), n = v.split(q).length - 1; if (!n) return; ta.focus(); ta.select(); const next = v.split(q).join(ri.value); try { document.execCommand("insertText", false, next); } catch { put(next); } changed(); fCount.textContent = "Replaced " + n; }), mkF("✕", () => toggleFind(false)), fCount);
    fi.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); } if (e.key === "Escape") toggleFind(false); });
    function toggleFind(force) { find.hidden = force === undefined ? !find.hidden : !force; if (!find.hidden) { const sel = get().slice(ta.selectionStart, ta.selectionEnd); if (sel && !sel.includes("\n")) fi.value = sel; fi.focus(); fi.select(); } else ta.focus(); }
    applyPrefs(); refresh();
    return { setValue: put, getValue: get, focus: () => ta.focus(), refresh, check, insert: insertAtCursor, goto(line) { const ls = get().split("\n"); let pos = 0; for (let i = 0; i < Math.min(line - 1, ls.length); i++) pos += ls[i].length + 1; ta.focus(); ta.setSelectionRange(pos, pos); ta.scrollTop = Math.max(0, (line - 4) * prefs.fontSize * 1.5); syncScroll(); status(); }, lint: () => lintState };
  }
  return { attach, highlight, errorLine };
})();
